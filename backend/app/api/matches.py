from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.routers.dependencies import get_current_user
from app.models.user import User
from app.crud.crud_user import get_all_users
from app.services.matching_service import generate_matches
from app.schemas.match import MatchListResponse

router = APIRouter(prefix="/matches", tags=["Matches"])


@router.get(
    "",
    response_model=MatchListResponse,
    summary="Get smart skill-swap matches for the current user",
)
def get_matches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MatchListResponse:
    all_users = get_all_users(db, limit=500)
    return generate_matches(db, current_user, all_users)
