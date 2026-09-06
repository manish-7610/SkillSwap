from datetime import datetime
import sqlalchemy as sa
from sqlalchemy import Boolean, Text, DateTime, ForeignKey, func, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True, autoincrement=True
    )
    sender_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    receiver_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ── Per-user hide flags (migration 0004) ─────────────────────────────────
    # deleted_for_sender=True   → exclude this row from the sender's history view.
    # deleted_for_receiver=True → exclude this row from the receiver's history view.
    # These are set independently by each user's "Delete for me" action.
    # Two independent "Delete for me" actions CAN result in both=True but that
    # is NOT the same as "deleted for everyone" — see deleted_for_everyone below.
    deleted_for_sender: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    deleted_for_receiver: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )

    # ── Delete-for-everyone flag (migration 0005) ─────────────────────────────
    # Set to True ONLY by the original sender's explicit "Delete for everyone"
    # action.  When True, BOTH users see a "Message deleted" placeholder bubble
    # instead of the original content.
    # This flag is orthogonal to deleted_for_sender/receiver:
    #   - dfe=True, dfs=True, dfr=True → placeholder shown to both (for everyone)
    #   - dfs=True, dfr=True, dfe=False → row hidden from both (two for-me deletes)
    deleted_for_everyone: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    sender: Mapped["User"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[sender_id],
        lazy="select",
    )
    receiver: Mapped["User"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[receiver_id],
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<Message id={self.id} "
            f"from={self.sender_id} to={self.receiver_id} "
            f"read={self.is_read} dfe={self.deleted_for_everyone}>"
        )
