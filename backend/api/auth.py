import logging
from fastapi import APIRouter, HTTPException, Request, status, Depends
from core.security import get_current_user
from models.auth import (
    LoginRequest, SignupRequest, RefreshRequest,
    PasswordResetRequest, PasswordResetConfirm,
    TokenResponse, UserResponse,
)
from services.auth import (
    signup as svc_signup,
    login as svc_login,
    refresh as svc_refresh,
    request_password_reset as svc_request_reset,
    confirm_password_reset as svc_confirm_reset,
    get_me,
    AuthError,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _raise(exc: AuthError) -> None:
    safe_codes = {400, 401, 403, 404, 409, 422, 429}
    detail = exc.detail if exc.status_code in safe_codes else "Internal server error."
    raise HTTPException(status_code=exc.status_code, detail=detail)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, request: Request):
    try:
        return svc_signup(
            body,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
    except AuthError as exc:
        _raise(exc)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request):
    try:
        return svc_login(
            body,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
    except AuthError as exc:
        _raise(exc)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest):
    try:
        return svc_refresh(body)
    except AuthError as exc:
        _raise(exc)


@router.get("/me", response_model=UserResponse)
async def me(current_user: dict = Depends(get_current_user)):
    return get_me(current_user)


@router.post("/password-reset/request", status_code=status.HTTP_204_NO_CONTENT)
async def password_reset_request(body: PasswordResetRequest):
    svc_request_reset(body)


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def password_reset_confirm(body: PasswordResetConfirm):
    try:
        svc_confirm_reset(body)
    except AuthError as exc:
        _raise(exc)
