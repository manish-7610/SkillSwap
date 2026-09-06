from datetime import datetime
from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Widened from String(10) to Text in migration 0003_widen_avatar_to_text.
    # Stores either a short emoji (e.g. "🧑‍💻") or a base64 data URL for
    # custom profile photos (data:image/jpeg;base64,…).
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    skills: Mapped[list["Skill"]] = relationship(
        "Skill", back_populates="user", cascade="all, delete-orphan", lazy="select"
    )
    sent_requests: Mapped[list["Connection"]] = relationship(
        "Connection",
        foreign_keys="[Connection.sender_id]",
        back_populates="sender",
        cascade="all, delete-orphan",
        lazy="select",
    )
    received_requests: Mapped[list["Connection"]] = relationship(
        "Connection",
        foreign_keys="[Connection.receiver_id]",
        back_populates="receiver",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"
