# No `from __future__ import annotations` here: slowapi wraps the login handler, and FastAPI can't
# resolve string annotations through that wrapper (the body would be read as a query parameter).
from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status

from app.core.config import settings
from app.core.exceptions import PermissionDeniedError
from app.core.rate_limit import LOGIN_LIMIT, limiter
from app.db.models import User
from app.dependencies import get_current_user, get_email_service, get_uow
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.auth import (
    ChallengeResponse,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResendChallengeRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerifyChallengeRequest,
    VerifyOTPRequest,
    VerifyOTPResponse,
)
from app.schemas.common import MessageOut
from app.services.auth_service import AuthService, Challenge, Session
from app.services.email_service import EmailService
from app.services.mappers import user_out

router = APIRouter(prefix="/auth", tags=["auth"])


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        httponly=True,
        secure=True,
        samesite="strict",
        path=settings.REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH,
        httponly=True, secure=True, samesite="strict",
    )


def verify_origin(request: Request) -> None:
    """CSRF defence for cookie-authenticated endpoints (SameSite=Strict + explicit Origin check)."""
    origin = request.headers.get("origin")
    if origin is None:
        if settings.is_production:
            raise PermissionDeniedError("Origin header required", code="ORIGIN_NOT_ALLOWED")
        return
    if origin.rstrip("/") not in settings.allowed_origins:
        raise PermissionDeniedError("Origin not allowed", code="ORIGIN_NOT_ALLOWED")


def _token_response(session: Session) -> TokenResponse:
    return TokenResponse(
        access_token=session.access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user_out(session.user),
    )


def challenge_response(challenge: Challenge, background: BackgroundTasks, email: EmailService) -> ChallengeResponse:
    """Queue the code email and describe the pending step. Shared with the password-change route."""
    background.add_task(email.send_otp, challenge.user.email, challenge.otp, challenge.purpose)
    return ChallengeResponse(
        challenge_token=challenge.token,
        purpose=challenge.purpose,  # type: ignore[arg-type]
        email=challenge.user.email,
        expires_in=settings.OTP_EXPIRE_MINUTES * 60,
        resend_after=settings.OTP_RESEND_COOLDOWN_SECONDS,
    )


@router.post("/register", response_model=ChallengeResponse, status_code=status.HTTP_202_ACCEPTED)
async def register(data: RegisterRequest, background: BackgroundTasks, uow: UnitOfWork = Depends(get_uow),
                   email: EmailService = Depends(get_email_service)) -> ChallengeResponse:
    """Step 1 of sign-up. The account is usable once the emailed code is sent to /otp/verify."""
    return challenge_response(await AuthService(uow).register(data), background, email)


@router.post("/login", response_model=ChallengeResponse)
@limiter.limit(LOGIN_LIMIT)
async def login(request: Request, response: Response, data: LoginRequest, background: BackgroundTasks,
                uow: UnitOfWork = Depends(get_uow),
                email: EmailService = Depends(get_email_service)) -> ChallengeResponse:
    """Step 1 of sign-in: checks the password and emails a code."""
    return challenge_response(await AuthService(uow).login(data.email, data.password), background, email)


@router.post("/otp/verify", response_model=TokenResponse)
@limiter.limit(LOGIN_LIMIT)
async def verify_challenge(request: Request, response: Response, data: VerifyChallengeRequest,
                           uow: UnitOfWork = Depends(get_uow)) -> TokenResponse:
    """Step 2 of sign-in / sign-up: exchanges the emailed code for a session."""
    session = await AuthService(uow).verify_challenge(data.challenge_token, data.otp,
                                                      request.headers.get("user-agent"))
    set_refresh_cookie(response, session.refresh_token or "")
    return _token_response(session)


@router.post("/otp/resend", response_model=ChallengeResponse)
async def resend_challenge(data: ResendChallengeRequest, background: BackgroundTasks,
                           uow: UnitOfWork = Depends(get_uow),
                           email: EmailService = Depends(get_email_service)) -> ChallengeResponse:
    return challenge_response(await AuthService(uow).resend_challenge(data.challenge_token), background, email)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, uow: UnitOfWork = Depends(get_uow)) -> TokenResponse:
    verify_origin(request)
    session = await AuthService(uow).refresh(request.cookies.get(settings.REFRESH_COOKIE_NAME))
    return _token_response(session)


@router.post("/logout", response_model=MessageOut)
async def logout(request: Request, response: Response, _: User = Depends(get_current_user),
                 uow: UnitOfWork = Depends(get_uow)) -> MessageOut:
    verify_origin(request)
    await AuthService(uow).logout(request.cookies.get(settings.REFRESH_COOKIE_NAME))
    _clear_refresh_cookie(response)
    return MessageOut(detail="Signed out")


@router.post("/forgot-password", response_model=MessageOut)
async def forgot_password(data: ForgotPasswordRequest, background: BackgroundTasks,
                          uow: UnitOfWork = Depends(get_uow),
                          email: EmailService = Depends(get_email_service)) -> MessageOut:
    dispatch = await AuthService(uow).request_password_reset(data.email)
    if dispatch is not None:
        background.add_task(email.send_otp, dispatch.email, dispatch.otp)
    # Identical response whether or not the account exists.
    return MessageOut(detail="If an account exists for that email, a code is on its way.")


@router.post("/verify-otp", response_model=VerifyOTPResponse)
async def verify_otp(data: VerifyOTPRequest, uow: UnitOfWork = Depends(get_uow)) -> VerifyOTPResponse:
    token = await AuthService(uow).verify_otp(data.email, data.otp)
    return VerifyOTPResponse(reset_token=token, expires_in=settings.RESET_TOKEN_EXPIRE_MINUTES * 60)


@router.post("/reset-password", response_model=MessageOut)
async def reset_password(data: ResetPasswordRequest, uow: UnitOfWork = Depends(get_uow)) -> MessageOut:
    await AuthService(uow).reset_password(data.reset_token, data.new_password)
    return MessageOut(detail="Password updated. Sign in with your new password.")
