from pydantic import BaseModel, EmailStr, field_validator
from typing import Literal
import re

_PASSWORD_REGEX = re.compile(r"^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$")
_PASSWORD_ERROR = (
    "Password must be at least 8 characters and include uppercase, number, and special character"
)


def _validate_password(v: str) -> str:
    """Shared password strength validator used by signup and password-reset models."""
    if not _PASSWORD_REGEX.match(v):
        raise ValueError(_PASSWORD_ERROR)
    return v


class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Literal["engineer", "admin", "viewer"] = "engineer"
    organization: str = ""

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name must not be empty")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password(v)

    @field_validator("organization")
    @classmethod
    def org_strip(cls, v: str) -> str:
        return v.strip()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password(v)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str = "engineer"
    organization: str = ""
