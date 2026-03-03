"""
Arcade MCP Gateway OAuth connection and custom user verifier.

- POST /api/arcade/connect           — check tokens or start OAuth flow
- POST /api/sources                  — check per-source auth via WhoAmI tools
- GET  /api/auth/arcade/callback     — OAuth callback (exchanges code for tokens)
- GET  /api/arcade/verify            — custom user verifier for COAT attack protection
"""

import asyncio
import json
import re

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.arcade_oauth import (
    clear_pending_auth_url,
    discover_and_authorize,
    exchange_code,
    get_cached_tools,
    get_mcp_client,
    get_state,
    get_tokens,
)
from app.auth import get_current_user
from app.config import settings
from app.database import get_db

router = APIRouter(tags=["arcade"])

ARCADE_CONFIRM_URL = "https://cloud.arcade.dev/api/v1/oauth/confirm_user"


@router.post("/api/arcade/connect")
async def connect(request: Request, db: AsyncSession = Depends(get_db)):
    """Check if Arcade Gateway is connected, or start OAuth flow."""
    user = await get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    if not settings.arcade_gateway_url:
        return JSONResponse(
            {
                "connected": False,
                "error": (
                    "ARCADE_GATEWAY_URL is missing. Create one at "
                    "https://app.arcade.dev/mcp-gateways, add only the minimum required "
                    "tools from Slack, Google Calendar, Linear, GitHub, and Gmail, then "
                    "set ARCADE_GATEWAY_URL in .env."
                ),
            },
            status_code=400,
        )

    # Fast path: already have tokens
    tokens = get_tokens()
    if tokens and tokens.get("access_token"):
        try:
            mcp_client = get_mcp_client()
            await get_cached_tools(mcp_client)
            return {"connected": True}
        except Exception:  # noqa: S110
            # Token may be expired/revoked; fall through and restart OAuth.
            pass

    # No tokens — kick off OAuth discovery + registration + redirect
    try:
        auth_url = await discover_and_authorize()
        clear_pending_auth_url()
        return JSONResponse({"connected": False, "authUrl": auth_url})
    except Exception as e:
        return JSONResponse(
            {
                "connected": False,
                "error": f"Could not connect to Arcade Gateway: {e}",
            },
            status_code=502,
        )


def _map_tool_to_source(tool_name: str | None) -> str:
    if not tool_name:
        return "other"
    service = re.split(r"[._]", tool_name)[0].lower()
    if service == "slack":
        return "slack"
    if service in ("google", "googlecalendar", "calendar"):
        return "google_calendar"
    if service == "linear":
        return "linear"
    if service in ("git", "github"):
        return "github"
    if service == "gmail":
        return "gmail"
    return service or "other"


def _extract_auth_url_from_result(content: str) -> str | None:
    """Check if a tool result contains an Arcade authorization URL."""
    try:
        parsed = json.loads(content)
        url = (
            parsed.get("authorization_url")
            or parsed.get("url")
            or (parsed.get("structuredContent") or {}).get("authorization_url")
        )
        if url:
            return url
    except (json.JSONDecodeError, AttributeError):
        pass
    # Fallback: regex
    match = re.search(
        r"https://[^\s\"'>\]]+/oauth/[^\s\"'>\]]+|https://[^\s\"'>\]]+authorize[^\s\"'>\]]*",
        content or "",
        re.IGNORECASE,
    )
    return match.group(0) if match else None


@router.post("/api/sources")
async def check_sources(request: Request, db: AsyncSession = Depends(get_db)):
    """Call WhoAmI tools in parallel to check per-source auth status."""
    user = await get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    if not settings.arcade_gateway_url:
        return JSONResponse(
            {
                "error": (
                    "ARCADE_GATEWAY_URL is missing. Create one at "
                    "https://app.arcade.dev/mcp-gateways, add only the minimum required "
                    "tools from Slack, Google Calendar, Linear, GitHub, and Gmail, then "
                    "set ARCADE_GATEWAY_URL in .env."
                ),
                "sources": {},
            },
            status_code=400,
        )

    try:
        mcp_client = get_mcp_client()
        all_tools = await get_cached_tools(mcp_client)
        whoami_tools = [t for t in all_tools if re.search(r"[._]WhoAmI$", t.name, re.IGNORECASE)]

        async def _call_whoami(tool):
            try:
                result = await tool.ainvoke({})
                content = result if isinstance(result, str) else str(result)
                auth_url = _extract_auth_url_from_result(content)
                source = _map_tool_to_source(tool.name)
                return source, auth_url
            except Exception:
                source = _map_tool_to_source(tool.name)
                return source, None

        results = await asyncio.gather(
            *[_call_whoami(t) for t in whoami_tools],
            return_exceptions=True,
        )

        sources = {}
        for r in results:
            if isinstance(r, Exception):
                continue
            source, auth_url = r
            sources[source] = (
                {"status": "auth_required", "authUrl": auth_url}
                if auth_url
                else {"status": "connected"}
            )

        return {"sources": sources}
    except Exception as e:
        print(f"[sources] Error checking WhoAmI tools: {e}")
        return {"sources": {}}


@router.get("/api/auth/arcade/callback")
async def callback(request: Request):
    """OAuth callback — exchange authorization code for tokens."""
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code:
        return JSONResponse({"error": "Missing authorization code"}, status_code=400)

    stored_state = get_state()
    if not stored_state or state != stored_state:
        return RedirectResponse("/dashboard?error=auth_failed", status_code=302)

    try:
        await exchange_code(code)
        # Use relative redirect so the browser stays on the same host
        # (avoids cookie mismatch between 127.0.0.1 and localhost)
        return RedirectResponse("/dashboard", status_code=302)
    except Exception as e:
        print(f"Arcade OAuth callback error: {e}")
        return RedirectResponse("/dashboard?error=auth_failed", status_code=302)


@router.get("/api/arcade/verify")
async def verify(request: Request, db: AsyncSession = Depends(get_db)):
    """Custom user verifier for COAT attack protection.

    When enabled (ARCADE_CUSTOM_VERIFIER=true), Arcade redirects users here
    with a flow_id. This endpoint confirms the user's identity with Arcade,
    preventing attackers from completing auth flows on behalf of victims.

    IMPORTANT: Enabling the custom verifier also requires registering custom
    OAuth applications for each auth provider (Slack, GitHub, etc.) in the
    Arcade dashboard — the default shared OAuth apps cannot be used with a
    custom verifier. For local dev, use ngrok (`ngrok http 8000`) and set the
    ngrok URL as the verifier URL in the dashboard.

    See: https://docs.arcade.dev/en/guides/user-facing-agents/secure-auth-production
    """
    if not settings.arcade_custom_verifier:
        return JSONResponse(
            {
                "error": "Custom user verification is not enabled. "
                "Set ARCADE_CUSTOM_VERIFIER=true in your .env."
            },
            status_code=404,
        )

    if not settings.arcade_api_key:
        return RedirectResponse("/?error=verify_misconfigured", status_code=302)

    flow_id = request.query_params.get("flow_id")
    if not flow_id:
        return JSONResponse({"error": "Missing flow_id parameter"}, status_code=400)

    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse("/")

    try:
        async with httpx.AsyncClient() as http:
            resp = await http.post(
                ARCADE_CONFIRM_URL,
                headers={
                    "Authorization": f"Bearer {settings.arcade_api_key}",
                    "Content-Type": "application/json",
                },
                json={"flow_id": flow_id, "user_id": user.email},
            )

        if not resp.is_success:
            return RedirectResponse("/dashboard?error=verify_failed", status_code=302)

        data = resp.json()
        redirect_to = data.get("next_uri", "/dashboard")
        return RedirectResponse(redirect_to)

    except Exception:
        return RedirectResponse("/dashboard?error=verify_failed", status_code=302)
