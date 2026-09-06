from sqlalchemy.orm import Session
from app.models.user import User
from app.crud.crud_skill import get_skills_for_user
from app.crud.crud_connection import (
    get_pending_received,
    get_pending_sent,
    get_accepted_connections,
)
from app.crud.crud_user import get_all_users
from app.services.matching_service import generate_matches
from app.schemas.dashboard import DashboardResponse, DashboardStats
from app.schemas.user import UserOut
from app.schemas.skill import SkillOut
from app.schemas.request import ConnectionOut
from app.models.skill import SkillType


def get_dashboard(db: Session, current_user: User) -> DashboardResponse:
    skills       = get_skills_for_user(db, current_user.id)
    teach_skills = [SkillOut.model_validate(s) for s in skills if s.type == SkillType.teach]
    learn_skills = [SkillOut.model_validate(s) for s in skills if s.type == SkillType.learn]

    pending_recv = get_pending_received(db, current_user.id)
    pending_sent = get_pending_sent(db, current_user.id)
    accepted     = get_accepted_connections(db, current_user.id)

    all_users    = get_all_users(db, limit=500)
    match_result = generate_matches(db, current_user, all_users)
    top_matches  = match_result.matches[:10]

    stats = DashboardStats(
        total_skills_teaching=len(teach_skills),
        total_skills_learning=len(learn_skills),
        total_connections=len(accepted),
        pending_received=len(pending_recv),
        pending_sent=len(pending_sent),
        total_matches=match_result.total,
    )

    return DashboardResponse(
        profile=UserOut.model_validate(current_user),
        teach_skills=teach_skills,
        learn_skills=learn_skills,
        pending_received=[ConnectionOut.model_validate(c) for c in pending_recv],
        pending_sent=[ConnectionOut.model_validate(c) for c in pending_sent],
        accepted_connections=[ConnectionOut.model_validate(c) for c in accepted],
        top_matches=top_matches,
        stats=stats,
    )
