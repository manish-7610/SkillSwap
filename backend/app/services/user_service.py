from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.crud.crud_user import get_user_by_email, create_user, get_user_by_id
from app.schemas.user import UserCreate
from app.core.security import verify_password, create_access_token
from app.models.user import User


def register_user(db: Session, data: UserCreate) -> User:
    if get_user_by_email(db, data.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    return create_user(db, data)


def authenticate_user(db: Session, email: str, password: str) -> tuple[User, str]:
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(subject=user.id)
    return user, token
