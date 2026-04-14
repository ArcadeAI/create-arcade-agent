"""Auth helpers using FastAPI Users.

`get_current_user(request, db)` provides a backward-compatible wrapper that
decodes the FastAPI Users JWT session cookie and returns the authenticated user.
All other route files (chat, arcade, plan) continue to call this function
without modification.
"""

from fastapi import Request
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


async def get_current_user(request: Request, db: AsyncSession) -> User | None:
    """Return the authenticated user from the session cookie, or None.

    Reads the `session_id` JWT cookie written by FastAPI Users' CookieTransport
    and verifies it using the configured JWTStrategy.
    """
    from app.auth_manager import UserManager, get_jwt_strategy

    token = request.cookies.get("session_id")
    if not token:
        return None

    user_db = SQLAlchemyUserDatabase(db, User)
    user_manager = UserManager(user_db)
    strategy = get_jwt_strategy()

    try:
        user = await strategy.read_token(token, user_manager)
        if user and user.is_active:
            return user
        return None
    except Exception:
        return None
