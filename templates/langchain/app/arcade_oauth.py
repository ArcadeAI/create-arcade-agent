"""Arcade MCP Gateway OAuth2 authentication.

Implements the same OAuth flow as the TypeScript/Mastra template:
1. Discovery (Protected Resource Metadata + OAuth Server Metadata)
2. Dynamic Client Registration
3. Authorization URL generation with PKCE
4. Code exchange for tokens
5. File-based token persistence in .arcade-auth/

This is app-level auth (not per-user) — all users of this app share
the same Arcade gateway connection once authenticated.
"""

import contextlib
import json
import logging
import secrets
import time
from pathlib import Path
from urllib.parse import urlencode, urlparse

import httpx
from mcp.client.auth.oauth2 import PKCEParameters
from mcp.client.auth.utils import (
    build_oauth_authorization_server_metadata_discovery_urls,
    build_protected_resource_metadata_discovery_urls,
    create_client_registration_request,
    create_oauth_metadata_request,
    extract_resource_metadata_from_www_auth,
    extract_scope_from_www_auth,
    get_client_metadata_scopes,
    handle_auth_metadata_response,
    handle_protected_resource_response,
    handle_registration_response,
    handle_token_response_scopes,
)
from mcp.shared.auth import OAuthClientMetadata

from app.config import settings


# Suppress false-positive "Session termination failed: 202" warnings from the
# MCP SDK. Arcade's gateway returns HTTP 202 (Accepted) for async session
# teardown, which is a success — but the SDK only treats 200 as success.
class _McpTermination202Filter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not ("session termination failed" in msg.lower() and "202" in msg)


for _logger_name in (None, "mcp", "mcp.client", "mcp.client.streamable_http", "httpx"):
    logging.getLogger(_logger_name).addFilter(_McpTermination202Filter())

# --- File-based persistence (.arcade-auth/, gitignored) ---

AUTH_DIR = Path(".arcade-auth")
CLIENT_FILE = AUTH_DIR / "client.json"
TOKENS_FILE = AUTH_DIR / "tokens.json"
VERIFIER_FILE = AUTH_DIR / "verifier.txt"
STATE_FILE = AUTH_DIR / "state.txt"
METADATA_FILE = AUTH_DIR / "oauth_metadata.json"
PENDING_AUTH_URL_FILE = AUTH_DIR / "pending_auth_url.txt"

_pending_auth_url: str | None = None
_pending_auth_url_time: float = 0

_PENDING_AUTH_TTL = 300  # 5 minutes


def _ensure_dir():
    AUTH_DIR.mkdir(exist_ok=True)
    AUTH_DIR.chmod(0o700)


def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _write_json(path: Path, data: dict):
    _ensure_dir()
    path.write_text(json.dumps(data, indent=2))
    path.chmod(0o600)


# --- Token / client persistence ---


def get_tokens() -> dict | None:
    """Load stored OAuth tokens."""
    return _read_json(TOKENS_FILE)


def save_tokens(tokens: dict):
    """Persist OAuth tokens."""
    _write_json(TOKENS_FILE, tokens)


def get_client_info() -> dict | None:
    """Load stored dynamic client registration info."""
    return _read_json(CLIENT_FILE)


def save_client_info(info: dict):
    """Persist dynamic client registration info."""
    _write_json(CLIENT_FILE, info)


def get_oauth_metadata() -> dict | None:
    """Load cached OAuth server metadata."""
    return _read_json(METADATA_FILE)


def save_oauth_metadata(metadata: dict):
    """Cache OAuth server metadata."""
    _write_json(METADATA_FILE, metadata)


# --- Pending auth URL (consumed by the connect endpoint) ---


def get_pending_auth_url() -> str | None:
    """Return the pending authorization URL (without clearing it). Checks TTL."""
    global _pending_auth_url, _pending_auth_url_time

    if _pending_auth_url and (time.time() - _pending_auth_url_time <= _PENDING_AUTH_TTL):
        return _pending_auth_url

    # Try file fallback
    try:
        data = json.loads(PENDING_AUTH_URL_FILE.read_text())
        if time.time() - data.get("createdAt", 0) <= _PENDING_AUTH_TTL:
            return data["url"]
        # Expired
        clear_pending_auth_url()
        return None
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return None


def clear_pending_auth_url():
    """Explicitly clear the pending authorization URL."""
    global _pending_auth_url, _pending_auth_url_time
    _pending_auth_url = None
    _pending_auth_url_time = 0
    with contextlib.suppress(OSError):
        PENDING_AUTH_URL_FILE.unlink(missing_ok=True)


def get_state() -> str | None:
    """Read and delete the stored OAuth state parameter."""
    try:
        state = STATE_FILE.read_text().strip()
        STATE_FILE.unlink(missing_ok=True)
        return state or None
    except FileNotFoundError:
        return None


def _callback_url() -> str:
    """Build the OAuth callback URL."""
    return f"{settings.app_url}/api/auth/arcade/callback"


def _base_url(url: str) -> str:
    """Extract scheme + host from a URL."""
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


# --- OAuth flow steps ---


async def discover_and_authorize() -> str:
    """Run full OAuth discovery + registration + PKCE. Returns the authorization URL.

    Uses MCP SDK utilities for spec-compliant discovery (SEP-985, RFC 8414),
    PKCE generation, dynamic client registration, and scope selection.

    Flow:
    1. Hit gateway → get 401 → extract PRM hint from WWW-Authenticate
    2. Discover Protected Resource Metadata → auth server URL
    3. Discover OAuth Authorization Server Metadata → endpoints
    4. Dynamic client registration (if needed)
    5. Generate PKCE + state
    6. Build and return authorization URL
    """
    global _pending_auth_url
    gateway_url = settings.arcade_gateway_url
    if not gateway_url:
        raise RuntimeError("ARCADE_GATEWAY_URL is missing. Add it to your .env and retry.")

    async with httpx.AsyncClient(timeout=30) as http:
        # Step 1: Probe gateway for 401 and WWW-Authenticate header
        probe_resp = await http.get(gateway_url)

        # Step 2: Discover Protected Resource Metadata (SEP-985 with fallback)
        # SDK builds ordered fallback list: WWW-Auth hint → path-based → root
        www_auth_url = extract_resource_metadata_from_www_auth(probe_resp)
        prm = None
        auth_server_url = _base_url(gateway_url)
        for url in build_protected_resource_metadata_discovery_urls(www_auth_url, gateway_url):
            resp = await http.send(create_oauth_metadata_request(url))
            prm = await handle_protected_resource_response(resp)
            if prm:
                if prm.authorization_servers:
                    auth_server_url = str(prm.authorization_servers[0])
                break

        # Step 3: Discover OAuth Authorization Server Metadata (RFC 8414)
        # SDK handles path-aware discovery + OIDC fallback
        oauth_meta = None
        cached_meta = get_oauth_metadata()
        if cached_meta:
            try:
                from mcp.shared.auth import OAuthMetadata

                oauth_meta = OAuthMetadata.model_validate(cached_meta)
            except Exception:
                oauth_meta = None

        if not oauth_meta:
            for url in build_oauth_authorization_server_metadata_discovery_urls(
                auth_server_url, gateway_url
            ):
                resp = await http.send(create_oauth_metadata_request(url))
                ok, asm = await handle_auth_metadata_response(resp)
                if not ok:
                    break  # Non-4xx error, stop trying
                if asm:
                    oauth_meta = asm
                    save_oauth_metadata(
                        asm.model_dump(mode="json", by_alias=True, exclude_none=True)
                    )
                    break

        # Extract endpoints (with fallbacks)
        auth_endpoint = (
            str(oauth_meta.authorization_endpoint)
            if oauth_meta and oauth_meta.authorization_endpoint
            else f"{auth_server_url}/authorize"
        )
        token_endpoint = (
            str(oauth_meta.token_endpoint)
            if oauth_meta and oauth_meta.token_endpoint
            else f"{auth_server_url}/token"
        )

        # Step 4: Dynamic Client Registration (if no stored client)
        client_info = get_client_info()
        if not client_info:
            client_metadata = OAuthClientMetadata(
                redirect_uris=[_callback_url()],
                client_name="Arcade Agent",
                grant_types=["authorization_code", "refresh_token"],
                response_types=["code"],
                token_endpoint_auth_method="none",
            )
            reg_req = create_client_registration_request(
                oauth_meta, client_metadata, _base_url(auth_server_url)
            )
            reg_resp = await http.send(reg_req)
            client_info_model = await handle_registration_response(reg_resp)
            client_info = client_info_model.model_dump(
                mode="json", by_alias=True, exclude_none=True
            )
            save_client_info(client_info)

        # Step 5: Generate PKCE + state
        pkce = PKCEParameters.generate()
        state = secrets.token_urlsafe(32)

        _ensure_dir()
        VERIFIER_FILE.write_text(pkce.code_verifier)
        VERIFIER_FILE.chmod(0o600)
        STATE_FILE.write_text(state)
        STATE_FILE.chmod(0o600)

        # Persist metadata for exchange_code()
        if oauth_meta:
            save_oauth_metadata(
                oauth_meta.model_dump(mode="json", by_alias=True, exclude_none=True)
            )
        else:
            _write_json(METADATA_FILE, {"token_endpoint": token_endpoint})

        # Step 6: Build authorization URL
        params: dict[str, str] = {
            "response_type": "code",
            "client_id": client_info["client_id"],
            "redirect_uri": _callback_url(),
            "state": state,
            "code_challenge": pkce.code_challenge,
            "code_challenge_method": "S256",
        }

        # Add resource from PRM (required to scope token to specific gateway)
        if prm and prm.resource:
            params["resource"] = str(prm.resource)

        # Scope selection using MCP spec priority order
        scope = get_client_metadata_scopes(extract_scope_from_www_auth(probe_resp), prm, oauth_meta)
        if scope:
            params["scope"] = scope

        auth_url = f"{auth_endpoint}?{urlencode(params)}"
        _pending_auth_url = auth_url
        _pending_auth_url_time = time.time()
        _ensure_dir()
        PENDING_AUTH_URL_FILE.write_text(json.dumps({"url": auth_url, "createdAt": time.time()}))
        PENDING_AUTH_URL_FILE.chmod(0o600)
        return auth_url


async def exchange_code(code: str) -> dict:
    """Exchange an authorization code for OAuth tokens.

    Uses the stored PKCE verifier and client registration info.
    """
    client_info = get_client_info()
    if not client_info:
        raise RuntimeError("No client registration found — run connect first")

    try:
        code_verifier = VERIFIER_FILE.read_text()
    except FileNotFoundError as err:
        raise RuntimeError("No PKCE verifier found — run connect first") from err

    # Get token endpoint from cached metadata
    oauth_meta = get_oauth_metadata()
    if oauth_meta and oauth_meta.get("token_endpoint"):
        token_endpoint = oauth_meta["token_endpoint"]
    else:
        # Fallback
        gateway_base = _base_url(settings.arcade_gateway_url)
        token_endpoint = f"{gateway_base}/token"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            token_endpoint,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": _callback_url(),
                "client_id": client_info["client_id"],
                "code_verifier": code_verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        token_model = await handle_token_response_scopes(resp)
        tokens = token_model.model_dump(mode="json", exclude_none=True)
        save_tokens(tokens)
        invalidate_tools_cache()
        return tokens


# --- MCP Client factory ---


def create_mcp_client():
    """Create a MultiServerMCPClient using stored OAuth tokens.

    After OAuth is complete, the stored access_token is sent as a
    Bearer token to authenticate with the Arcade MCP Gateway.
    """
    from langchain_mcp_adapters.client import MultiServerMCPClient

    if not settings.arcade_gateway_url:
        raise RuntimeError("ARCADE_GATEWAY_URL is missing. Add it to your .env and retry.")

    tokens = get_tokens()
    headers = {}
    if tokens and tokens.get("access_token"):
        headers["Authorization"] = f"Bearer {tokens['access_token']}"

    # Auto-detect transport: /sse endpoints use SSE, others use Streamable HTTP
    transport = "sse" if settings.arcade_gateway_url.rstrip("/").endswith("/sse") else "http"

    return MultiServerMCPClient(
        {
            "arcade": {
                "transport": transport,
                "url": settings.arcade_gateway_url,
                "headers": headers,
            }
        }
    )


# --- Cached MCP client (avoids "Session termination failed" spam) ---

_cached_mcp_client = None
_cached_token: str | None = None


def get_mcp_client():
    """Return a cached MultiServerMCPClient, recreating only when the token changes.

    Reusing the client avoids opening/closing an MCP session on every chat
    request, which eliminates the "Session termination failed: 202" log spam.
    """
    global _cached_mcp_client, _cached_token

    tokens = get_tokens()
    current_token = tokens.get("access_token") if tokens else None

    if _cached_mcp_client is not None and current_token == _cached_token:
        return _cached_mcp_client

    _cached_mcp_client = create_mcp_client()
    _cached_token = current_token
    return _cached_mcp_client


# --- Cached tools (avoids creating a new MCP session per request) ---

_cached_tools: list | None = None
_cached_tools_time: float = 0
_TOOLS_CACHE_TTL = 300  # 5 minutes


async def get_cached_tools(mcp_client=None):
    """Return cached MCP tools, refreshing only when the cache expires."""
    global _cached_tools, _cached_tools_time
    now = time.time()
    if _cached_tools is not None and (now - _cached_tools_time) < _TOOLS_CACHE_TTL:
        return _cached_tools
    if mcp_client is None:
        mcp_client = get_mcp_client()
    _cached_tools = await mcp_client.get_tools()
    _cached_tools_time = now
    return _cached_tools


def invalidate_tools_cache():
    """Clear the tools cache (e.g. after token refresh)."""
    global _cached_tools, _cached_tools_time
    _cached_tools = None
    _cached_tools_time = 0
