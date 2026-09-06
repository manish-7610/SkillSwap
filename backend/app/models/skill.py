from datetime import datetime
from sqlalchemy import String, Enum, ForeignKey, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from app.models.base import Base


class SkillType(str, enum.Enum):
    teach = "teach"
    learn = "learn"


class SkillCategory(str, enum.Enum):
    Technology = "Technology"
    Design = "Design"
    Music = "Music"
    Business = "Business"
    Language = "Language"
    Other = "Other"


class Skill(Base):
    __tablename__ = "skills"
    __table_args__ = (
        UniqueConstraint("user_id", "name", "type", name="uq_user_skill_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[SkillType] = mapped_column(
        Enum(SkillType, name="skill_type_enum"), nullable=False
    )
    category: Mapped[SkillCategory] = mapped_column(
        Enum(SkillCategory, name="skill_category_enum"),
        nullable=False,
        default=SkillCategory.Other,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="skills")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Skill id={self.id} name={self.name} type={self.type}>"
