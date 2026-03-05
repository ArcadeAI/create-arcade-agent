from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.routes import arcade, auth, plan

_parsed_app_url = urlparse(settings.app_url)
_canonical_host = _parsed_app_url.hostname
_canonical_port = _parsed_app_url.port


class CanonicalHostMiddleware(BaseHTTPMiddleware):
    """Redirect requests to the canonical APP_URL host.

    This prevents cookie/session mismatch between 127.0.0.1 and localhost.
    For example, if APP_URL is http://localhost:8765, requests to
    http://127.0.0.1:8765 are redirected to http://localhost:8765.
    """

    async def dispatch(self, request: Request, call_next):
        request_host = request.headers.get("host", "")
        # Build expected host header (host:port or just host for default ports)
        if _canonical_port and _canonical_port not in (80, 443):
            expected_host = f"{_canonical_host}:{_canonical_port}"
        else:
            expected_host = _canonical_host

        if request_host != expected_host:
            url = f"{settings.app_url}{request.url.path}"
            if request.url.query:
                url += f"?{request.url.query}"
            return RedirectResponse(url, status_code=302)

        return await call_next(request)


@asynccontextmanager
async def lifespan(application: FastAPI):
    # Print registered routes on startup for debugging
    print("\n📋 Registered routes:")
    for route in application.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            print(f"  {', '.join(route.methods):20s} {route.path}")
    print()
    yield


app = FastAPI(title="Arcade Agent", lifespan=lifespan)
app.add_middleware(CanonicalHostMiddleware)

BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# API routers
app.include_router(auth.router)
app.include_router(arcade.router)
app.include_router(plan.router)


@app.get("/")
async def index(request: Request, db: AsyncSession = Depends(get_db)):
    """Login/register page, or redirect to dashboard if already logged in."""
    user = await get_current_user(request, db)
    if user:
        return RedirectResponse("/dashboard")
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/dashboard")
async def dashboard_page(request: Request, db: AsyncSession = Depends(get_db)):
    """Dashboard page -- requires authentication."""
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse("/")
    return templates.TemplateResponse("dashboard.html", {"request": request, "user": user})

