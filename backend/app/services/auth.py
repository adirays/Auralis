"""
services/auth.py
All authentication business logic lives here.
"""
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from postgrest.exceptions import APIError

from core.config import get_settings
from core.database import get_db
from core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_refresh_token,
)
from models.auth import (
    SignupRequest, LoginRequest, RefreshRequest,
    PasswordResetRequest, PasswordResetConfirm,
    TokenResponse, UserResponse,
)

logger = logging.getLogger(__name__)

_DUMMY_HASH = "$2b$04$IMlTu33mdc9y2pn2bd1CVu/SCZPLoRiUKkqpfJ.msB.lxjJLKkJdC"


class AuthError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _safe_db_error(exc: Exception) -> str:
    if isinstance(exc, APIError):
        return exc.message or str(exc)
    return str(exc)


def _log_event(
    user_id: str, email: str, event: str, success: bool,
    ip_address: str = "", user_agent: str = "",
) -> None:
    try:
        db = get_db()
        db.table("login_events").insert({
            "user_id":    user_id,
            "email":      email,
            "event":      event,
            "success":    success,
            "ip_address": ip_address or None,
            "user_agent": user_agent or None,
        }).execute()
    except Exception as exc:
        logger.warning("[auth] login_events insert failed (non-fatal): %s", exc)


def _build_token_pair(user: dict) -> TokenResponse:
    payload = {
        "sub":          user["id"],
        "email":        user["email"],
        "name":         user["name"],
        "role":         user.get("role", "engineer"),
        "organization": user.get("organization", ""),
    }
    return TokenResponse(
        access_token=create_access_token(payload),
        refresh_token=create_refresh_token(payload),
    )


def _send_reset_email(to_email: str, reset_url: str) -> None:
    settings = get_settings()
    if not settings.smtp_configured:
        logger.warning(
            "[auth] SMTP not configured — password reset link for %s: %s",
            to_email, reset_url,
        )
        return
    msg = MIMEText(
        f"You requested a password reset for your Auralis account.\n\n"
        f"Click the link below to reset your password (valid for 1 hour):\n\n"
        f"{reset_url}\n\n"
        f"If you did not request this, ignore this email.",
        "plain",
    )
    msg["Subject"] = "Auralis — Password Reset"
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.sendmail(settings.smtp_from, [to_email], msg.as_string())
        logger.info("[auth] password reset email sent to %s", to_email)
    except Exception as exc:
        logger.error("[auth] failed to send reset email to %s: %s", to_email, exc)
        raise AuthError(500, "Failed to send reset email. Contact the administrator.")


# ── Public service functions ──────────────────────────────────────────────────

def signup(
    body: SignupRequest,
    ip_address: str = "",
    user_agent: str = "",
) -> TokenResponse:
    logger.info("[auth] signup attempt — email=%s", body.email)
    try:
        db = get_db()
    except RuntimeError as exc:
        raise AuthError(503, "Database not configured.") from exc

    try:
        existing = db.table("users").select("id").eq("email", body.email).execute()
    except Exception as exc:
        raise AuthError(500, "Database error while checking email availability.") from exc

    if existing.data:
        raise AuthError(400, "Email already registered.")

    try:
        hashed = hash_password(body.password)
    except Exception:
        raise AuthError(500, "Internal error during account creation.")

    try:
        result = (
            db.table("users")
            .insert({
                "email":         body.email,
                "name":          body.name,
                "password_hash": hashed,
                "role":          body.role,
                "organization":  body.organization,
            })
            .execute()
        )
    except Exception as exc:
        raise AuthError(500, f"Failed to create account: {_safe_db_error(exc)}") from exc

    if not result.data:
        raise AuthError(500, "Account creation failed. Check Supabase table permissions.")

    user = result.data[0]
    logger.info("[auth] user created — id=%s email=%s", user["id"], user["email"])
    _log_event(user["id"], user["email"], "signup", True, ip_address, user_agent)
    return _build_token_pair(user)


def login(
    body: LoginRequest,
    ip_address: str = "",
    user_agent: str = "",
) -> TokenResponse:
    logger.info("[auth] login attempt — email=%s ip=%s", body.email, ip_address or "unknown")
    try:
        db = get_db()
    except RuntimeError:
        raise AuthError(503, "Database not configured.")

    try:
        result = db.table("users").select("*").eq("email", body.email).execute()
    except Exception as exc:
        raise AuthError(500, "Database error during login.") from exc

    if not result.data:
        verify_password("dummy", _DUMMY_HASH)
        raise AuthError(401, "Invalid email or password.")

    user = result.data[0]
    if not verify_password(body.password, user["password_hash"]):
        _log_event(user["id"], user["email"], "login", False, ip_address, user_agent)
        raise AuthError(401, "Invalid email or password.")

    logger.info("[auth] login successful — id=%s email=%s", user["id"], user["email"])
    _log_event(user["id"], user["email"], "login", True, ip_address, user_agent)
    return _build_token_pair(user)


def refresh(body: RefreshRequest) -> TokenResponse:
    """Validate a refresh token and issue a new access + refresh token pair."""
    payload = decode_refresh_token(body.refresh_token)
    user_id = payload.get("sub")
    if not user_id:
        raise AuthError(401, "Invalid refresh token.")

    try:
        db = get_db()
        result = db.table("users").select("*").eq("id", user_id).execute()
    except Exception:
        raise AuthError(500, "Database error during token refresh.")

    if not result.data:
        raise AuthError(401, "User not found.")

    return _build_token_pair(result.data[0])


def request_password_reset(body: PasswordResetRequest) -> None:
    """
    Generate a reset token, store it, and email the user.
    Always returns successfully to prevent user enumeration.
    """
    settings = get_settings()
    try:
        db = get_db()
        result = db.table("users").select("id, email").eq("email", body.email).execute()
    except Exception:
        return  # silent — don't reveal DB errors

    if not result.data:
        return  # silent — don't reveal whether email exists

    user = result.data[0]
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    try:
        # Invalidate any existing token for this user first
        db.table("password_reset_tokens").delete().eq("user_id", user["id"]).execute()
        db.table("password_reset_tokens").insert({
            "user_id":    user["id"],
            "token":      token,
            "expires_at": expires_at,
        }).execute()
    except Exception as exc:
        logger.error("[auth] failed to store reset token: %s", exc)
        return

    reset_url = f"{settings.frontend_url}/reset-password?token={token}"
    _send_reset_email(user["email"], reset_url)


def confirm_password_reset(body: PasswordResetConfirm) -> None:
    """Validate the reset token and update the user's password."""
    try:
        db = get_db()
        result = (
            db.table("password_reset_tokens")
            .select("user_id, expires_at")
            .eq("token", body.token)
            .execute()
        )
    except Exception:
        raise AuthError(500, "Database error.")

    if not result.data:
        raise AuthError(400, "Invalid or expired reset token.")

    row = result.data[0]
    expires_at = datetime.fromisoformat(row["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise AuthError(400, "Reset token has expired.")

    try:
        hashed = hash_password(body.new_password)
        db.table("users").update({"password_hash": hashed}).eq("id", row["user_id"]).execute()
        db.table("password_reset_tokens").delete().eq("token", body.token).execute()
        logger.info("[auth] password reset completed for user_id=%s", row["user_id"])
    except Exception as exc:
        raise AuthError(500, f"Failed to update password: {_safe_db_error(exc)}") from exc


def get_me(current_user: dict) -> UserResponse:
    return UserResponse(
        id=current_user["sub"],
        email=current_user["email"],
        name=current_user["name"],
        role=current_user.get("role", "engineer"),
        organization=current_user.get("organization", ""),
    )
