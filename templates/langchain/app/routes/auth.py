"""Auth endpoints backed by FastAPI Users.

These routes maintain the same URLs and JSON interface as before, but delegate
all password hashing and user management to FastAPI Users' UserManager.
"""

import contextlib
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse
from fastapi_users import exceptions
from fastapi_users.schemas import BaseUserCreate
from pydantic import BaseModel, EmailStr

from app.auth_manager import UserManager, get_jwt_strategy, get_user_manager
from app.config import settings

_ARCADE_TOKENS_FILE = Path(__file__).resolve().parents[2] / ".arcade-auth" / "tokens.json"

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthRequest(BaseModel):
    email: EmailStr
    password: str


class _UserCreate(BaseUserCreate):
    """Minimal schema for FastAPI Users user creation."""

    pass


@dataclass
class _Credentials:
    """OAuth2-compatible credentials container for FastAPI Users authenticate()."""

    username: str
    password: str


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        "session_id",
        token,
        max_age=3600 * 24 * 7,
        httponly=True,
        samesite="lax",
        secure=settings.app_url.startswith("https://"),
    )


@router.post("/register")
async def register(
    body: AuthRequest,
    response: Response,
    user_manager: UserManager = Depends(get_user_manager),
):
    try:
        user = await user_manager.create(_UserCreate(email=body.email, password=body.password))
    except exceptions.UserAlreadyExists:
        return JSONResponse({"error": "Email already registered"}, status_code=409)
    except exceptions.InvalidPasswordException as e:
        return JSONResponse({"error": str(e.reason)}, status_code=400)

    token = await get_jwt_strategy().write_token(user)
    _set_session_cookie(response, token)
    return {"success": True}


@router.post("/login")
async def login(
    body: AuthRequest,
    response: Response,
    user_manager: UserManager = Depends(get_user_manager),
):
    credentials = _Credentials(username=body.email, password=body.password)
    user = await user_manager.authenticate(credentials)
    if user is None or not user.is_active:
        return JSONResponse({"error": "Invalid credentials"}, status_code=401)

    token = await get_jwt_strategy().write_token(user)
    _set_session_cookie(response, token)
    return {"success": True}


@router.post("/logout")
async def logout(response: Response):
    # Clear Arcade tokens so the next user who signs in has to re-authenticate.
    with contextlib.suppress(OSError):
        _ARCADE_TOKENS_FILE.unlink()
    response.delete_cookie("session_id", path="/")
    return {"success": True}
