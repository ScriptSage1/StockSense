from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status

from app.core.config import settings
from app.core.exceptions import PermissionDeniedError
from app.core.rate_limit import LOGIN_LIMIT, limiter
from app.db.models import User
from app.dependencies import get_current_user, get_email_service, get_uow
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerifyOTPRequest,
    VerifyOTPResponse,
)
from app.schemas.common import MessageOut
from app.services.auth_service import AuthService, Session
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


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, request: Request, response: Response,
                   uow: UnitOfWork = Depends(get_uow)) -> TokenResponse:
    session = await AuthService(uow).register(data, request.headers.get("user-agent"))
    set_refresh_cookie(response, session.refresh_token or "")
    return _token_response(session)


@router.post("/login", response_model=TokenResponse)
@limiter.limit(LOGIN_LIMIT)
async def login(request: Request, response: Response, data: LoginRequest,
                uow: UnitOfWork = Depends(get_uow)) -> TokenResponse:
    session = await AuthService(uow).login(data.email, data.password, request.headers.get("user-agent"))
    set_refresh_cookie(response, session.refresh_token or "")
    return _token_response(session)


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
