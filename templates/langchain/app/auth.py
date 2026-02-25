import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Session as SessionModel
from app.models import User

SESSION_COOKIE = "session_id"
SESSION_MAX_AGE = timedelta(days=7)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


async def create_session(db: AsyncSession, user_id: int, response: Response) -> str:
    session_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + SESSION_MAX_AGE

    db.add(SessionModel(id=session_id, user_id=user_id, expires_at=expires_at))
    await db.commit()

    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=int(SESSION_MAX_AGE.total_seconds()),
    )
    return session_id


async def get_current_user(request: Request, db: AsyncSession) -> User | None:
    session_id = request.cookies.get(SESSION_COOKIE)
    if not session_id:
        return None

    result = await db.execute(select(SessionModel).where(SessionModel.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        return None
    if session.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        await db.delete(session)
        await db.commit()
        return None

    result = await db.execute(select(User).where(User.id == session.user_id))
    return result.scalar_one_or_none()


async def destroy_session(request: Request, db: AsyncSession, response: Response) -> None:
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        result = await db.execute(select(SessionModel).where(SessionModel.id == session_id))
        session = result.scalar_one_or_none()
        if session:
            await db.delete(session)
            await db.commit()

    response.delete_cookie(SESSION_COOKIE, path="/")
