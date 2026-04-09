import re

from pydantic import BaseModel, EmailStr, field_validator


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password is too long")
        if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
            raise ValueError("Password must include a letter and a number")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SignupResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    email_verification_required: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    token: str

    @field_validator("token", mode="before")
    @classmethod
    def coerce_token(cls, value: object) -> str:
        if value is None:
            return ""
        s = str(value).strip()
        # Match web: allow pasted codes with spaces (e.g. "123 456")
        return re.sub(r"\s+", "", s)

    @field_validator("token")
    @classmethod
    def validate_token(cls, value: str) -> str:
        if not value:
            raise ValueError("Verification code is required")
        if not re.match(r"^\d{6}$", value):
            raise ValueError("Verification code must be exactly 6 digits")
        return value


class VerifyEmailResponse(BaseModel):
    verified: bool


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ResendVerificationResponse(BaseModel):
    sent: bool
