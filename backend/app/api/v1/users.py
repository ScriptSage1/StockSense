from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request, Response

from app.api.v1.auth import set_refresh_cookie
from app.db.models import User
from app.dependencies import get_current_user, get_uow, require_role
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.auth import RoleUpdate, UserOut, UserUpdate
from app.services.auth_service import AuthService
from app.services.mappers import user_out

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return user_out(user)


@router.put("/me", response_model=UserOut)
async def update_me(data: UserUpdate, request: Request, response: Response,
                    user: User = Depends(get_current_user), uow: UnitOfWork = Depends(get_uow)) -> UserOut:
    updated, new_refresh = await AuthService(uow).update_profile(user, data, request.headers.get("user-agent"))
    if new_refresh:
        # Password changed: every old session was revoked; keep this browser signed in.
        set_refresh_cookie(response, new_refresh)
    return user_out(updated)


@router.get("", response_model=list[UserOut])
async def list_users(_: User = Depends(require_role("manager")), uow: UnitOfWork = Depends(get_uow)) -> list[UserOut]:
    return [user_out(u) for u in await AuthService(uow).list_users()]


@router.put("/{user_id}", response_model=UserOut)
async def update_user(user_id: uuid.UUID, data: RoleUpdate, actor: User = Depends(require_role("manager")),
                      uow: UnitOfWork = Depends(get_uow)) -> UserOut:
    return user_out(await AuthService(uow).update_user(actor, user_id, data))
