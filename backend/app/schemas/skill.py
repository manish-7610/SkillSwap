from datetime import datetime
from pydantic import BaseModel, Field
from app.models.skill import SkillType, SkillCategory


class SkillCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: SkillType
    category: SkillCategory = SkillCategory.Other


class SkillUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    category: SkillCategory | None = None


class SkillOut(BaseModel):
    id: int
    user_id: int
    name: str
    type: SkillType
    category: SkillCategory
    created_at: datetime

    model_config = {"from_attributes": True}
