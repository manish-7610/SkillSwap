"""
chat_service.py
~~~~~~~~~~~~~~~
Business logic and security guards for the messaging / chat feature.

All public functions raise HTTPException on policy violations so that both
the REST API layer (Phase 2) and the WebSocket layer (Phase 3) can call them
directly and surface consistent error responses.
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.crud.crud_connection import get_connection_between
from app.crud.crud_user import get_user_by_id
from app.crud.crud_message import (
    create_message,
    get_conversation,
    get_conversations_for_user,
    mark_messages_read,
    get_message_by_id,
    delete_message_for_user,
)
from app.models.connection import ConnectionStatus
from app.models.message import Message
from app.models.user import User
from app.schemas.message import (
    ConversationHistoryResponse,
    ConversationSummaryResponse,
    MessageOut,
)

# Maximum allowed message length (also enforced in the Pydantic schema).
MAX_CONTENT_LENGTH = 2000


# ── Internal guard ────────────────────────────────────────────────────────────

def assert_users_are_connected(db: Session, user_a_id: int, user_b_id: int) -> None:
    """
    Raise HTTP 403 unless there is an *accepted* Connection between the two users.
    """
    connection = get_connection_between(db, user_a_id, user_b_id)
    if connection is None or connection.status != ConnectionStatus.accepted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be connected to this user to message them.",
        )


# ── Public service functions ──────────────────────────────────────────────────

def send_message(
    db: Session,
    sender: User,
    receiver_id: int,
    content: str,
) -> Message:
    """
    Validate, authorise, and persist a new message.

    Security checks (in order):
      1. Sender cannot message themselves.
      2. Receiver must exist.
      3. The two users must share an accepted Connection.
      4. Content must be non-empty after stripping and within the length limit.
    """
    if sender.id == receiver_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot send a message to yourself.",
        )

    receiver = get_user_by_id(db, receiver_id)
    if not receiver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipient user not found.",
        )

    assert_users_are_connected(db, sender.id, receiver_id)

    content = content.strip()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message content cannot be empty.",
        )
    if len(content) > MAX_CONTENT_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Message content exceeds the maximum of {MAX_CONTENT_LENGTH} characters.",
        )

    return create_message(db, sender.id, receiver_id, content)


def get_conversation_history(
    db: Session,
    current_user: User,
    other_user_id: int,
    limit: int = 50,
    before_id: int | None = None,
) -> ConversationHistoryResponse:
    """
    Return paginated conversation history between current_user and other_user_id.

    Deletion visibility:
      - Messages deleted only for the requesting user are excluded entirely.
      - Messages deleted for everyone appear in results with content=None and
        deleted_for_everyone=True so the frontend can show a placeholder bubble.
    """
    other_user = get_user_by_id(db, other_user_id)
    if not other_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    assert_users_are_connected(db, current_user.id, other_user_id)

    # Fetch limit+1 to detect has_more
    rows = get_conversation(
        db,
        user_a_id=current_user.id,
        user_b_id=other_user_id,
        requesting_user_id=current_user.id,
        limit=limit + 1,
        before_id=before_id,
    )
    has_more = len(rows) > limit
    messages = rows[:limit]

    return ConversationHistoryResponse(
        messages=[MessageOut.model_validate(m) for m in messages],
        has_more=has_more,
    )


def get_conversations(
    db: Session,
    current_user: User,
) -> ConversationSummaryResponse:
    """Return a summary of all active conversations for the current user."""
    summaries = get_conversations_for_user(db, current_user.id)
    return ConversationSummaryResponse(conversations=summaries)


def open_conversation(
    db: Session,
    current_user: User,
    other_user_id: int,
) -> None:
    """
    Mark all messages from other_user_id → current_user as read.
    Called when a user opens the chat window.
    """
    other_user = get_user_by_id(db, other_user_id)
    if not other_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    assert_users_are_connected(db, current_user.id, other_user_id)
    mark_messages_read(db, from_user_id=other_user_id, to_user_id=current_user.id)


def delete_message(
    db: Session,
    current_user: User,
    message_id: int,
    mode: str,  # "for_me" | "for_everyone"
) -> Message:
    """
    Apply a soft-delete to a message.

    Authorization rules (enforced here, not in the route):
      1. Current user must be authenticated (guaranteed by get_current_user dep).
      2. Message must exist.
      3. Current user must be a PARTICIPANT (sender OR receiver).
         A third party cannot delete someone else's message.
      4. "for_everyone" requires the current user to be the original SENDER.
         The receiver cannot delete a message for everyone.
      5. Idempotent — re-deleting an already-deleted message returns the
         message unchanged without raising an error.

    Returns the updated Message ORM instance.
    """
    msg = get_message_by_id(db, message_id)
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found.",
        )

    is_sender   = msg.sender_id   == current_user.id
    is_receiver = msg.receiver_id == current_user.id

    # Rule 3: must be a participant
    if not is_sender and not is_receiver:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this message.",
        )

    if mode == "for_everyone":
        # Rule 4: only the original sender may delete for everyone
        if not is_sender:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the sender can delete a message for everyone.",
            )
        return delete_message_for_user(
            db, msg, current_user.id, for_everyone=True
        )

    # mode == "for_me"
    return delete_message_for_user(
        db, msg, current_user.id, for_everyone=False
    )
