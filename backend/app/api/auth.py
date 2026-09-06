from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.security import create_access_token
from app.schemas.user import UserCreate, UserOut
from app.services.user_service import register_user, authenticate_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=201,
    summary="Register a new user account",
)
def register(data: UserCreate, db: Session = Depends(get_db)) -> TokenResponse:
    user = register_user(db, data)
    token = create_access_token(subject=user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login and receive a JWT token",
)
def login(data: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user, token = authenticate_user(db, data.email, data.password)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))
