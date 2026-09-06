from pydantic import BaseModel
from app.schemas.user import UserOut
from app.schemas.skill import SkillOut
from app.schemas.request import ConnectionOut
from app.schemas.match import MatchResult


class DashboardStats(BaseModel):
    total_skills_teaching: int
    total_skills_learning: int
    total_connections: int
    pending_received: int
    pending_sent: int
    total_matches: int


class DashboardResponse(BaseModel):
    profile: UserOut
    teach_skills: list[SkillOut]
    learn_skills: list[SkillOut]
    pending_received: list[ConnectionOut]
    pending_sent: list[ConnectionOut]
    accepted_connections: list[ConnectionOut]
    top_matches: list[MatchResult]
    stats: DashboardStats
