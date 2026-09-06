"""
chat_ws.py
~~~~~~~~~~
WebSocket endpoint for real-time messaging in SkillSwap.

Architecture
------------
- Single in-process ConnectionManager (dict[user_id, set[WebSocket]]).
  Safe for a single-process Uvicorn deployment.  Multi-worker deployments
  would require a pub/sub layer (e.g. Redis), which is out of scope.

Authentication
--------------
- JWT is passed as a query parameter: ws://host/api/v1/ws/chat?token=<jwt>
- Browsers cannot set the Authorization header on WS upgrade requests (spec
  limitation), so query-param auth is the standard FastAPI pattern.
- The token is validated *before* ws.accept() is called, so unauthenticated
  connections are rejected at the HTTP 101 upgrade stage.
- The raw token value is never written to any log.

Message protocol (JSON frames)
-------------------------------
Client → Server:
  { "type": "send_message", "receiver_id": <int>, "content": "<str>" }
  { "type": "pong" }

Server → Client:
  { "type": "new_message",   "message": { ...MessageOut } }
  { "type": "ping" }
  { "type": "error",         "code": "<str>", "detail": "<str>" }
  { "type": "connected",     "user_id": <int> }
"""
import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import decode_access_token
from app.crud.crud_user import get_user_by_id
from app.models.user import User
from app.schemas.message import MessageOut
from app.services.chat_service import (
    assert_users_are_connected,
    send_message,
    delete_message as svc_delete_message,
)

logger = logging.getLogger("skillswap.chat")

router = APIRouter(tags=["Chat WebSocket"])

# ── Heartbeat interval (seconds) ──────────────────────────────────────────────
PING_INTERVAL = 30

# ── Max message content length (mirrors chat_service / Pydantic schema) ───────
MAX_CONTENT_LEN = 2000


# ═════════════════════════════════════════════════════════════════════════════
# ConnectionManager
# ═════════════════════════════════════════════════════════════════════════════

class ConnectionManager:
    """
    Tracks active WebSocket connections keyed by user_id.
    A user may have multiple simultaneous connections (e.g. two browser tabs).
    All are stored in a set so a message is delivered to every tab.
    """

    def __init__(self) -> None:
        # user_id → set of active WebSocket objects
        self._connections: dict[int, set[WebSocket]] = {}

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(user_id, set()).add(ws)
        logger.info("WS connected  user_id=%d  total_sockets=%d", user_id, self._count())

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        sockets = self._connections.get(user_id, set())
        sockets.discard(ws)
        if not sockets:
            self._connections.pop(user_id, None)
        logger.info("WS disconnected  user_id=%d  total_sockets=%d", user_id, self._count())

    async def send_to_user(self, user_id: int, payload: dict[str, Any]) -> None:
        """Send a JSON payload to every active socket for user_id."""
        sockets = list(self._connections.get(user_id, set()))
        if not sockets:
            return
        data = json.dumps(payload, default=str)
        for ws in sockets:
            try:
                await ws.send_text(data)
            except Exception:
                # The socket may have closed between the check and the send.
                # The disconnect handler will clean it up on the next receive.
                pass

    def is_online(self, user_id: int) -> bool:
        return bool(self._connections.get(user_id))

    def _count(self) -> int:
        return sum(len(s) for s in self._connections.values())


# Module-level singleton — shared across all requests in this process.
manager = ConnectionManager()


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

def _error_frame(code: str, detail: str) -> dict[str, str]:
    return {"type": "error", "code": code, "detail": detail}


def _message_frame(msg_out: MessageOut) -> dict[str, Any]:
    return {"type": "new_message", "message": msg_out.model_dump(mode="json")}


def _deleted_frame(message_id: int, mode: str) -> dict[str, Any]:
    """
    Broadcast frame sent to both participants when a message is deleted for everyone.
    Frontend listens for type='message_deleted' and replaces the bubble content.

    mode is always "for_everyone" in the broadcast (for_me deletions are local
    to the requesting user — no WS event needed for the other participant).
    """
    return {"type": "message_deleted", "message_id": message_id, "mode": mode}


async def _authenticate(token: str) -> User | None:
    """
    Decode JWT and load the user.  Returns None on any failure.
    The token value is intentionally not included in any log message.
    """
    db: Session = SessionLocal()
    try:
        payload = decode_access_token(token)
        user_id_str: str | None = payload.get("sub")
        if not user_id_str:
            return None
        user = get_user_by_id(db, int(user_id_str))
        return user  # may be None if account deleted
    except Exception:
        # decode_access_token raises HTTPException on bad tokens;
        # catch everything to avoid leaking details over the wire.
        return None
    finally:
        db.close()


# ═════════════════════════════════════════════════════════════════════════════
# WebSocket endpoint
# ═════════════════════════════════════════════════════════════════════════════

@router.websocket("/ws/chat")
async def chat_websocket(
    ws: WebSocket,
    token: str = Query(..., description="JWT access token"),
) -> None:
    """
    Real-time chat endpoint.

    Connect:  ws://host/api/v1/ws/chat?token=<jwt>

    Flow:
    1. Authenticate before accepting the connection.
    2. Accept; send a 'connected' confirmation frame.
    3. Start a heartbeat task (ping every 30 s).
    4. Loop: receive JSON frames, validate, persist, broadcast.
    5. On disconnect: cancel heartbeat, unregister socket.
    """
    # ── Step 1: Authenticate ──────────────────────────────────────────────────
    user = await _authenticate(token)
    if user is None:
        # Reject before upgrade — send a plain close without accepting
        await ws.close(code=4001)
        logger.warning("WS auth failed — rejected before accept")
        return

    # ── Step 2: Accept and confirm ────────────────────────────────────────────
    await manager.connect(user.id, ws)
    await manager.send_to_user(
        user.id,
        {"type": "connected", "user_id": user.id},
    )

    # ── Step 3: Heartbeat task ────────────────────────────────────────────────
    async def _heartbeat() -> None:
        while True:
            await asyncio.sleep(PING_INTERVAL)
            try:
                await ws.send_text(json.dumps({"type": "ping"}))
            except Exception:
                break  # socket is gone; loop ends naturally

    heartbeat_task = asyncio.create_task(_heartbeat())

    # ── Step 4: Receive loop ──────────────────────────────────────────────────
    try:
        while True:
            raw = await ws.receive_text()

            # Parse JSON
            try:
                frame = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_text(
                    json.dumps(_error_frame("INVALID_JSON", "Payload must be valid JSON."))
                )
                continue

            frame_type = frame.get("type")

            # ── Pong (heartbeat reply) ────────────────────────────────────────
            if frame_type == "pong":
                continue  # nothing to do

            # ── Send message ──────────────────────────────────────────────────
            if frame_type == "send_message":
                await _handle_send_message(ws, user, frame)
                continue

            # ── Delete message ────────────────────────────────────────────────
            if frame_type == "delete_message":
                await _handle_delete_message(ws, user, frame)
                continue

            # ── Unknown frame type — silently ignore ──────────────────────────
            # Avoids crashing on future client-side frame types.

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error("WS unexpected error user_id=%d: %s", user.id, exc, exc_info=True)
    finally:
        heartbeat_task.cancel()
        manager.disconnect(user.id, ws)


# ═════════════════════════════════════════════════════════════════════════════
# Frame handler
# ═════════════════════════════════════════════════════════════════════════════

async def _handle_send_message(
    ws: WebSocket,
    sender: User,
    frame: dict[str, Any],
) -> None:
    """
    Process a 'send_message' frame from the sender.

    Validates the payload, re-checks connection authorization (every frame,
    not just at connect time), persists the message, and delivers it.
    """
    # ── Payload validation ────────────────────────────────────────────────────
    receiver_id_raw = frame.get("receiver_id")
    content = frame.get("content", "")

    if receiver_id_raw is None:
        await ws.send_text(
            json.dumps(_error_frame("MISSING_FIELD", "receiver_id is required."))
        )
        return

    try:
        receiver_id = int(receiver_id_raw)
    except (TypeError, ValueError):
        await ws.send_text(
            json.dumps(_error_frame("INVALID_FIELD", "receiver_id must be an integer."))
        )
        return

    if not isinstance(content, str):
        await ws.send_text(
            json.dumps(_error_frame("INVALID_FIELD", "content must be a string."))
        )
        return

    content = content.strip()

    if not content:
        await ws.send_text(
            json.dumps(_error_frame("EMPTY_MESSAGE", "Message content cannot be empty."))
        )
        return

    if len(content) > MAX_CONTENT_LEN:
        await ws.send_text(
            json.dumps(
                _error_frame(
                    "MESSAGE_TOO_LONG",
                    f"Message exceeds the {MAX_CONTENT_LEN}-character limit.",
                )
            )
        )
        return

    if receiver_id == sender.id:
        await ws.send_text(
            json.dumps(_error_frame("SELF_MESSAGE", "You cannot message yourself."))
        )
        return

    # ── DB operations in a dedicated session ─────────────────────────────────
    db: Session = SessionLocal()
    try:
        # Re-validate accepted connection on every message (not just at connect)
        try:
            assert_users_are_connected(db, sender.id, receiver_id)
        except Exception:
            await ws.send_text(
                json.dumps(
                    _error_frame(
                        "NOT_CONNECTED",
                        "You must be connected to this user to message them.",
                    )
                )
            )
            return

        # Persist via chat_service (also re-validates everything)
        try:
            msg = send_message(db, sender=sender, receiver_id=receiver_id, content=content)
        except Exception as exc:
            # Surface the service-layer detail back to the sender
            detail = getattr(exc, "detail", str(exc))
            await ws.send_text(
                json.dumps(_error_frame("SEND_FAILED", str(detail)))
            )
            return

        msg_out = MessageOut.model_validate(msg)
        frame_payload = _message_frame(msg_out)

        # Deliver to receiver (if online) and echo back to ALL sender tabs
        await manager.send_to_user(receiver_id, frame_payload)
        await manager.send_to_user(sender.id, frame_payload)

    finally:
        db.close()


async def _handle_delete_message(
    ws: WebSocket,
    sender: User,
    frame: dict[str, Any],
) -> None:
    """
    Process a 'delete_message' frame from a client.

    Expected frame:
      { "type": "delete_message", "message_id": <int>, "mode": "for_me"|"for_everyone" }

    For "for_me":
      - Applies the soft-delete flag for the requesting user only.
      - No broadcast needed — only the requesting user's UI is affected.
      - Sends a confirmation frame back to the sender's socket only.

    For "for_everyone":
      - Applies both soft-delete flags (sender-only auth enforced in service).
      - Broadcasts a 'message_deleted' frame to BOTH participants so online
        clients can update their UI in real time without a page refresh.
      - If the other participant is offline, they will see the deletion when
        they next call GET /messages/conversation/{id} (filtering is DB-level).
    """
    # ── Payload validation ────────────────────────────────────────────────────
    message_id_raw = frame.get("message_id")
    mode           = frame.get("mode", "")

    if message_id_raw is None:
        await ws.send_text(
            json.dumps(_error_frame("MISSING_FIELD", "message_id is required."))
        )
        return

    try:
        message_id = int(message_id_raw)
    except (TypeError, ValueError):
        await ws.send_text(
            json.dumps(_error_frame("INVALID_FIELD", "message_id must be an integer."))
        )
        return

    if mode not in ("for_me", "for_everyone"):
        await ws.send_text(
            json.dumps(
                _error_frame(
                    "INVALID_FIELD",
                    'mode must be "for_me" or "for_everyone".',
                )
            )
        )
        return

    # ── DB operation ──────────────────────────────────────────────────────────
    db: Session = SessionLocal()
    try:
        try:
            msg = svc_delete_message(
                db,
                current_user=sender,
                message_id=message_id,
                mode=mode,
            )
        except Exception as exc:
            detail = getattr(exc, "detail", str(exc))
            code   = getattr(exc, "status_code", 400)
            err_code = "FORBIDDEN" if code == 403 else "DELETE_FAILED"
            await ws.send_text(json.dumps(_error_frame(err_code, str(detail))))
            return

        if mode == "for_everyone":
            # Broadcast deletion to BOTH participants so online clients update
            broadcast = _deleted_frame(message_id, "for_everyone")
            other_id  = msg.receiver_id if msg.sender_id == sender.id else msg.sender_id
            await manager.send_to_user(sender.id, broadcast)
            await manager.send_to_user(other_id,  broadcast)
        else:
            # Delete for me — only confirm back to the requesting socket
            await ws.send_text(
                json.dumps(
                    {
                        "type":       "message_deleted",
                        "message_id": message_id,
                        "mode":       "for_me",
                    }
                )
            )

    finally:
        db.close()
