from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# AI-EDIT-SAFE: application schema extension
# Add domain tables/columns as needed for your project.


class User(SQLAlchemyBaseUserTableUUID, Base):
    """User model — extends FastAPI Users for email/password authentication.

    FastAPI Users provides: id (UUID), email, hashed_password,
    is_active, is_superuser, is_verified.

    Add your own custom fields below.
    """

    __tablename__ = "users"

    # --- CUSTOMIZATION POINT ---
    name: Mapped[str | None] = mapped_column(nullable=True)
