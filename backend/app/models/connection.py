from datetime import datetime
from sqlalchemy import Enum, ForeignKey, DateTime, func, UniqueConstraint, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from app.models.base import Base


class ConnectionStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class Connection(Base):
    __tablename__ = "connections"
    __table_args__ = (
        UniqueConstraint("sender_id", "receiver_id", name="uq_sender_receiver"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    sender_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    receiver_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[ConnectionStatus] = mapped_column(
        Enum(ConnectionStatus, name="connection_status_enum"),
        nullable=False,
        default=ConnectionStatus.pending,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Use string-based foreign_keys to avoid forward-reference issues
    sender: Mapped["User"] = relationship(  # noqa: F821
        "User",
        foreign_keys="[Connection.sender_id]",
        back_populates="sent_requests",
    )
    receiver: Mapped["User"] = relationship(  # noqa: F821
        "User",
        foreign_keys="[Connection.receiver_id]",
        back_populates="received_requests",
    )

    def __repr__(self) -> str:
        return f"<Connection id={self.id} {self.sender_id}->{self.receiver_id} {self.status}>"
