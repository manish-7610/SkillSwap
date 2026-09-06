from pydantic import BaseModel
from app.schemas.user import UserPublic
from app.schemas.skill import SkillOut


class MatchResult(BaseModel):
    user: UserPublic
    score: int
    label: str  # "Excellent Match" | "Good Match" | "Low Match"
    teach_skills: list[SkillOut]
    learn_skills: list[SkillOut]

    model_config = {"from_attributes": True}


class MatchListResponse(BaseModel):
    total: int
    matches: list[MatchResult]
