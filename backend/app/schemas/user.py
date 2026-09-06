from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator
import re

# Maximum encoded size for a base64 avatar data URL.
# 3 MB raw image → ~4 MB base64 encoded.
# We allow up to 4,200,000 bytes (slightly above the theoretical 4,194,304)
# to account for data URL prefix overhead.
_AVATAR_MAX_B64_BYTES = 4_200_000

# Allowed data URL MIME prefixes for custom profile photos.
_AVATAR_ALLOWED_PREFIXES = (
    "data:image/jpeg;base64,",
    "data:image/jpg;base64,",
    "data:image/png;base64,",
    "data:image/webp;base64,",
)


def _check_avatar(v: str | None) -> str | None:
    """
    Shared avatar validation logic used by both UserBase and UserUpdate.

    Accepts:
      - None  (no avatar set)
      - A short emoji string of ≤ 10 characters
      - A base64 data URL for JPEG / PNG / WEBP with encoded size ≤ 820 KB
    """
    if v is None:
        return v
    # Plain emoji / short predefined avatar
    if len(v) <= 10:
        return v
    # Must start with an allowed data URL prefix
    if not any(v.startswith(p) for p in _AVATAR_ALLOWED_PREFIXES):
        raise ValueError(
            "avatar must be a short emoji or a data URL with a "
            "data:image/jpeg, data:image/png, or data:image/webp prefix."
        )
    # Guard against huge payloads — ASCII-encode first to get byte count
    if len(v.encode("ascii", errors="ignore")) > _AVATAR_MAX_B64_BYTES:
        raise ValueError(
            "Profile photo is too large. Maximum file size is 3 MB."
        )
    return v


class UserBase(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    bio: str | None = Field(None, max_length=500)
    # avatar accepts either a short emoji string (≤ 10 chars) or a
    # base64 data URL for a custom profile photo.  Validated by
    # _check_avatar() below.
    avatar: str | None = None
    location: str | None = Field(None, max_length=120)

    @field_validator("avatar", mode="before")
    @classmethod
    def validate_avatar(cls, v: str | None) -> str | None:
        return _check_avatar(v)


class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not re.search(r"[A-Za-z]", v):
            raise ValueError("Password must contain at least one letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=120)
    bio: str | None = Field(None, max_length=500)
    # avatar: same rules as UserBase — emoji OR validated base64 data URL.
    avatar: str | None = None
    location: str | None = Field(None, max_length=120)
    # TODO (security): password change does not currently require the user's
    # existing password.  A future improvement should add a `current_password`
    # field and verify it before applying the new password hash.
    password: str | None = Field(None, min_length=6, max_length=128)

    @field_validator("avatar", mode="before")
    @classmethod
    def validate_avatar(cls, v: str | None) -> str | None:
        return _check_avatar(v)


class UserOut(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserPublic(BaseModel):
    id: int
    full_name: str
    bio: str | None
    avatar: str | None
    location: str | None

    model_config = {"from_attributes": True}
