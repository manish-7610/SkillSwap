"""
messages.py
~~~~~~~~~~~
REST API for the SkillSwap chat / messaging feature.

All endpoints require a valid JWT (via get_current_user).
All conversation access is guarded by chat_service, which verifies that
the two parties share an accepted Connection before allowing any operation.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.routers.dependencies import get_current_user
from app.models.user import User
from app.schemas.message import (
    MessageCreate,
    MessageDeleteRequest,
    MessageOut,
    ConversationHistoryResponse,
    ConversationSummaryResponse,
)
from app.services.chat_service import (
    send_message,
    get_conversation_history,
    get_conversations,
    open_conversation,
    delete_message,
)

router = APIRouter(prefix="/messages", tags=["Messages"])


# ── 1. Conversation history ───────────────────────────────────────────────────

@router.get(
    "/conversation/{other_user_id}",
    response_model=ConversationHistoryResponse,
    summary="Get conversation history with another connected user",
)
def get_history(
    other_user_id: int,
    limit: int = Query(default=50, ge=1, le=100, description="Number of messages to return"),
    before_id: int | None = Query(
        default=None,
        description="Cursor: return messages with id < before_id (for pagination)",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationHistoryResponse:
    """
    Return up to `limit` messages between the current user and `other_user_id`,
    ordered newest-first.  Pass `before_id` to page backward through history.

    Messages deleted for everyone appear with content=null and
    deleted_for_everyone=true so the frontend can render a placeholder.
    Messages deleted only for the requesting user are excluded entirely.

    Requires an accepted connection between the two users.
    """
    return get_conversation_history(
        db,
        current_user=current_user,
        other_user_id=other_user_id,
        limit=limit,
        before_id=before_id,
    )


# ── 2. Send a message ─────────────────────────────────────────────────────────

@router.post(
    "/send",
    response_model=MessageOut,
    status_code=201,
    summary="Send a message to a connected user",
)
def send(
    data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageOut:
    """
    Persist and return a new message.

    Guards enforced by chat_service:
    - Cannot message yourself.
    - Receiver must exist.
    - The two users must share an **accepted** Connection.
    - Content must be 1–2000 characters (also validated by Pydantic schema).
    """
    msg = send_message(
        db,
        sender=current_user,
        receiver_id=data.receiver_id,
        content=data.content,
    )
    return MessageOut.model_validate(msg)


# ── 3. Conversation list (inbox) ──────────────────────────────────────────────

@router.get(
    "/conversations",
    response_model=ConversationSummaryResponse,
    summary="List all active conversations for the current user",
)
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationSummaryResponse:
    """
    Return one entry per unique conversation partner, sorted by most recent
    activity.  Each entry includes the partner's public profile, the last
    visible message snippet, and the count of unread messages.
    """
    return get_conversations(db, current_user)


# ── 4. Mark conversation as read ──────────────────────────────────────────────

@router.post(
    "/mark-read/{other_user_id}",
    status_code=204,
    summary="Mark all messages from another user as read",
)
def mark_read(
    other_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Mark every unread message sent by `other_user_id` to the current user as read.
    Typically called when the chat window is opened.

    Requires an accepted connection between the two users.
    """
    open_conversation(db, current_user=current_user, other_user_id=other_user_id)


# ── 5. Delete a message ───────────────────────────────────────────────────────

@router.delete(
    "/{message_id}",
    status_code=204,
    summary="Delete a message (for me or for everyone)",
)
def delete_msg(
    message_id: int,
    data: MessageDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Soft-delete a message for the requesting user or for all participants.

    **mode: "for_me"**
    - Hides the message only from the requesting user's conversation view.
    - The other participant can still see the message.
    - Available to both sender and receiver.

    **mode: "for_everyone"**
    - Hides the message for BOTH participants.
    - Only the **original sender** may use this mode (HTTP 403 otherwise).
    - After deletion, neither participant sees the original content.
      The message appears as a "Message deleted" placeholder in history.

    Authorization enforced by chat_service:
    - Current user must be a participant (sender or receiver).
    - "for_everyone" requires current user to be the sender.
    - Non-existent message → 404.
    - Wrong participant → 403.
    - Invalid mode → 422 (validated by Pydantic Literal).
    - Idempotent: re-deleting returns 204 without error.
    """
    delete_message(
        db,
        current_user=current_user,
        message_id=message_id,
        mode=data.mode,
    )
