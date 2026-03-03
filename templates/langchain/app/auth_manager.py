"""FastAPI Users configuration.

This module sets up FastAPI Users with a cookie-based JWT authentication backend.
See: https://fastapi-users.github.io/fastapi-users/
"""

import uuid

from fastapi import Depends
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import (
    AuthenticationBackend,
    CookieTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase

from app.config import settings
from app.database import get_db
from app.models import User


async def get_user_db(session=Depends(get_db)):
    yield SQLAlchemyUserDatabase(session, User)


SECRET = settings.app_secret_key


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    """Manages user lifecycle events (registration, login, password reset)."""

    reset_password_token_secret = SECRET
    verification_token_secret = SECRET


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


# Cookie transport — stores the JWT in an httpOnly session_id cookie
cookie_transport = CookieTransport(
    cookie_name="session_id",
    cookie_max_age=3600 * 24 * 7,  # 7 days
    cookie_secure=False,  # Set to True in production (HTTPS)
    cookie_httponly=True,
    cookie_samesite="lax",
)


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=SECRET, lifetime_seconds=3600 * 24 * 7)


auth_backend = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])
