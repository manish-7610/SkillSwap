from sqlalchemy.orm import Session
from sqlalchemy import select, or_, and_, func, desc
from app.models.message import Message
from app.models.user import User
from app.schemas.message import ConversationSummary, ConversationPartner, LastMessageSnippet


# ── Write ─────────────────────────────────────────────────────────────────────

def create_message(
    db: Session,
    sender_id: int,
    receiver_id: int,
    content: str,
) -> Message:
    """Persist a new message and return the refreshed ORM instance."""
    msg = Message(
        sender_id=sender_id,
        receiver_id=receiver_id,
        content=content,
        is_read=False,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


# ── Read ──────────────────────────────────────────────────────────────────────

def get_message_by_id(db: Session, message_id: int) -> Message | None:
    """Fetch a single message by primary key.  Returns None if not found."""
    return db.get(Message, message_id)


def get_conversation(
    db: Session,
    user_a_id: int,
    user_b_id: int,
    requesting_user_id: int,
    limit: int = 50,
    before_id: int | None = None,
) -> list[Message]:
    """
    Return messages between two users, ordered newest-first (DESC).

    Visibility rules with three orthogonal flags:

    deleted_for_everyone=True (set only by sender's explicit "delete for everyone"):
        → Keep the row so the API layer can return a redacted placeholder.
          Both parties see "Message deleted". The flag alone determines this.

    deleted_for_sender=True, deleted_for_receiver=False, deleted_for_everyone=False:
        → This is a pure "delete for me" by the sender. Hide from sender only.

    deleted_for_receiver=True, deleted_for_sender=False/True, deleted_for_everyone=False:
        → This is a pure "delete for me" by receiver. Hide from receiver only.

    Key insight: deleted_for_everyone takes precedence.  If dfe=True we always
    show the placeholder regardless of the per-user flags.  We only apply the
    per-user filter when dfe=False.

    Concretely — for the requesting user we exclude rows where:
        dfe=False  AND  (their own hide-flag is True)

    This means:
        - "for me" rows are silently excluded for that user.
        - "for everyone" rows pass through and are rendered as placeholders.
        - Two independent "for me" deletes → dfs=True, dfr=True, dfe=False
          → row excluded for both (each just sees nothing, which is correct).
    """
    stmt = (
        select(Message)
        .where(
            or_(
                and_(Message.sender_id == user_a_id, Message.receiver_id == user_b_id),
                and_(Message.sender_id == user_b_id, Message.receiver_id == user_a_id),
            )
        )
        .order_by(desc(Message.created_at), desc(Message.id))
        .limit(limit)
    )

    if before_id is not None:
        stmt = stmt.where(Message.id < before_id)

    # Exclude rows hidden for the requesting user (only when dfe=False).
    # Pattern: exclude if (dfe=False) AND (requesting user's own flag is True).
    if requesting_user_id == user_a_id or requesting_user_id == user_b_id:
        stmt = stmt.where(
            ~and_(
                Message.deleted_for_everyone.is_(False),
                or_(
                    # Requesting user is the sender of this message and deleted for themselves
                    and_(
                        Message.sender_id == requesting_user_id,
                        Message.deleted_for_sender.is_(True),
                    ),
                    # Requesting user is the receiver of this message and deleted for themselves
                    and_(
                        Message.receiver_id == requesting_user_id,
                        Message.deleted_for_receiver.is_(True),
                    ),
                ),
            )
        )

    return list(db.scalars(stmt).all())


def get_conversations_for_user(
    db: Session,
    user_id: int,
) -> list[ConversationSummary]:
    """
    Return one ConversationSummary per unique conversation partner.

    Last-message snippet:
      - Prefers the most recent message visible to this user.
      - "Deleted for everyone" messages show as "Message deleted" in the snippet.
      - "Deleted for me only" messages are skipped — show the next visible one.
    """
    sent_partners = select(Message.receiver_id.label("partner_id")).where(
        Message.sender_id == user_id
    )
    recv_partners = select(Message.sender_id.label("partner_id")).where(
        Message.receiver_id == user_id
    )
    partner_ids_stmt = sent_partners.union(recv_partners).subquery()

    partners: list[User] = list(
        db.scalars(
            select(User).where(User.id.in_(select(partner_ids_stmt.c.partner_id)))
        ).all()
    )

    summaries: list[ConversationSummary] = []
    for partner in partners:
        # Fetch the most recent message that is either:
        #   a) not hidden for this user (for-me exclusion doesn't apply), OR
        #   b) deleted for everyone (show placeholder)
        # Exclude messages that are for-me-hidden from this user AND dfe=False.
        latest_msg: Message | None = db.scalar(
            select(Message)
            .where(
                or_(
                    and_(Message.sender_id == user_id, Message.receiver_id == partner.id),
                    and_(Message.sender_id == partner.id, Message.receiver_id == user_id),
                ),
                # Same per-user exclusion logic as get_conversation()
                ~and_(
                    Message.deleted_for_everyone.is_(False),
                    or_(
                        and_(
                            Message.sender_id == user_id,
                            Message.deleted_for_sender.is_(True),
                        ),
                        and_(
                            Message.receiver_id == user_id,
                            Message.deleted_for_receiver.is_(True),
                        ),
                    ),
                ),
            )
            .order_by(desc(Message.created_at), desc(Message.id))
            .limit(1)
        )
        if latest_msg is None:
            continue

        snippet_content = (
            "Message deleted"
            if latest_msg.deleted_for_everyone
            else latest_msg.content
        )

        # Unread count: only messages not hidden for the receiver (this user)
        # and not deleted for everyone (those aren't unread in a useful sense)
        unread_count: int = db.scalar(
            select(func.count(Message.id)).where(
                Message.sender_id == partner.id,
                Message.receiver_id == user_id,
                Message.is_read.is_(False),
                Message.deleted_for_receiver.is_(False),
                Message.deleted_for_everyone.is_(False),
            )
        ) or 0

        summaries.append(
            ConversationSummary(
                other_user=ConversationPartner(
                    id=partner.id,
                    full_name=partner.full_name,
                    avatar=partner.avatar,
                ),
                last_message=LastMessageSnippet(
                    content=snippet_content,
                    created_at=latest_msg.created_at,
                    sender_id=latest_msg.sender_id,
                ),
                unread_count=unread_count,
            )
        )

    summaries.sort(key=lambda s: s.last_message.created_at, reverse=True)
    return summaries


# ── Update ────────────────────────────────────────────────────────────────────

def mark_messages_read(
    db: Session,
    from_user_id: int,
    to_user_id: int,
) -> int:
    """Mark all unread messages sent by from_user_id to to_user_id as read."""
    unread: list[Message] = list(
        db.scalars(
            select(Message).where(
                Message.sender_id == from_user_id,
                Message.receiver_id == to_user_id,
                Message.is_read.is_(False),
            )
        ).all()
    )
    for msg in unread:
        msg.is_read = True
    if unread:
        db.commit()
    return len(unread)


def delete_message_for_user(
    db: Session,
    msg: Message,
    requesting_user_id: int,
    for_everyone: bool,
) -> Message:
    """
    Apply a soft-delete flag to a message.

    for_everyone=True  (Delete for everyone — sender only, enforced by service):
        Sets deleted_for_sender=True, deleted_for_receiver=True, AND
        deleted_for_everyone=True.
        Both users see a "Message deleted" placeholder.

    for_everyone=False (Delete for me):
        Sets only the requesting user's own flag.
        The other participant is completely unaffected.
        The deleted_for_everyone flag is NOT touched — it remains False
        unless the sender explicitly used "delete for everyone".

    Idempotent — calling again on an already-flagged message is a no-op.
    Returns the refreshed Message instance.
    """
    if for_everyone:
        msg.deleted_for_sender   = True
        msg.deleted_for_receiver = True
        msg.deleted_for_everyone = True   # explicit — distinguishes from two for-me deletes
    else:
        if requesting_user_id == msg.sender_id:
            msg.deleted_for_sender = True
        else:
            msg.deleted_for_receiver = True
        # deleted_for_everyone is intentionally NOT set here

    db.commit()
    db.refresh(msg)
    return msg
