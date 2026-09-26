from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response

from app.api.v1.auth import challenge_response, set_refresh_cookie
from app.db.models import User
from app.dependencies import get_current_user, get_email_service, get_uow, require_role
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.auth import (
    ChallengeResponse,
    PasswordChangeConfirm,
    PasswordChangeStart,
    RoleUpdate,
    UserOut,
    UserUpdate,
)
from app.services.auth_service import AuthService
from app.services.email_service import EmailService
from app.services.mappers import user_out

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return user_out(user)


@router.put("/me", response_model=UserOut)
async def update_me(data: UserUpdate, user: User = Depends(get_current_user),
                    uow: UnitOfWork = Depends(get_uow)) -> UserOut:
    return user_out(await AuthService(uow).update_profile(user, data))


@router.post("/me/password/otp", response_model=ChallengeResponse)
async def start_password_change(data: PasswordChangeStart, background: BackgroundTasks,
                                user: User = Depends(get_current_user), uow: UnitOfWork = Depends(get_uow),
                                email: EmailService = Depends(get_email_service)) -> ChallengeResponse:
    """Step 1: confirm the current password; a code is emailed to the account address."""
    challenge = await AuthService(uow).start_password_change(user, data.current_password)
    return challenge_response(challenge, background, email)


@router.post("/me/password", response_model=UserOut)
async def confirm_password_change(data: PasswordChangeConfirm, request: Request, response: Response,
                                  user: User = Depends(get_current_user),
                                  uow: UnitOfWork = Depends(get_uow)) -> UserOut:
    """Step 2: the emailed code plus the new password."""
    updated, new_refresh = await AuthService(uow).confirm_password_change(
        user, data.challenge_token, data.otp, data.new_password, request.headers.get("user-agent")
    )
    # Every old session was revoked; keep this browser signed in.
    set_refresh_cookie(response, new_refresh)
    return user_out(updated)


@router.get("", response_model=list[UserOut])
async def list_users(_: User = Depends(require_role("manager")), uow: UnitOfWork = Depends(get_uow)) -> list[UserOut]:
    return [user_out(u) for u in await AuthService(uow).list_users()]


@router.put("/{user_id}", response_model=UserOut)
async def update_user(user_id: uuid.UUID, data: RoleUpdate, actor: User = Depends(require_role("manager")),
                      uow: UnitOfWork = Depends(get_uow)) -> UserOut:
    return user_out(await AuthService(uow).update_user(actor, user_id, data))
