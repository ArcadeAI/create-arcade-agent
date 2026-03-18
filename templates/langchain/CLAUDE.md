# Arcade Agent — LangGraph + FastAPI

## What This Is

A Slack triage agent built with LangGraph (LangChain's agent framework), FastAPI, and Arcade's MCP Gateway. Users log in, the agent connects to Slack via Arcade tools, and triages unread messages.

## Tech Stack

- **Agent**: LangGraph `create_react_agent` with LangChain tool adapters
- **MCP**: `langchain-mcp-adapters` MultiServerMCPClient connecting to Arcade Gateway
- **Web**: FastAPI + Jinja2 templates + vanilla JS
- **DB**: SQLAlchemy async + aiosqlite (SQLite)
- **Auth**: [FastAPI Users](https://fastapi-users.github.io/fastapi-users/) + httpOnly JWT session cookies
- **Streaming**: SSE via sse-starlette

## Key Commands

```bash
source .venv/bin/activate
uvicorn app.main:app --reload          # Dev server
python -m app.doctor                   # Environment + gateway setup checks
ruff check app/                        # Lint
ruff format app/                       # Format
ty check .                             # Type check
alembic revision --autogenerate -m ""  # New migration
alembic upgrade head                   # Run migrations
```

## Key Files

| File                   | Purpose                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `app/agent.py`         | Agent definition — model selection                                           |
| `app/system-prompt.md` | System prompt (customization point)                                          |
| `app/arcade_oauth.py`  | MCP OAuth flow — discovery, PKCE, token exchange, file-based persistence     |
| `app/routes/chat.py`   | SSE streaming chat endpoint                                                  |
| `app/routes/arcade.py` | OAuth connect/callback + custom user verifier                                |
| `app/routes/auth.py`   | Login, register, logout                                                      |
| `app/auth.py`          | `get_current_user()` helper (FastAPI Users JWT-backed)                       |
| `app/auth_manager.py`  | FastAPI Users setup (UserManager, JWT strategy, cookie transport)            |
| `app/models.py`        | User model (extends FastAPI Users base)                                      |
| `app/static/chat.js`   | Chat UI — SSE streaming, tool calls, auth URLs                               |
| `app/routes/plan.py`   | Plan/triage endpoint — filters out write tools + unknown services by default |

## Auth Architecture

Three layers:

1. **App auth** — email/password via [FastAPI Users](https://fastapi-users.github.io/fastapi-users/), stateless JWT stored in an httpOnly `session_id` cookie, SQLite storage. Configure `APP_SECRET_KEY` in `.env`.
2. **Arcade Gateway OAuth** — MCP OAuth flow with file-based token persistence in `.arcade-auth/` (discovery → registration → PKCE → token exchange)
3. **Tool-level OAuth** — Arcade handles per-tool auth (Slack, GitHub, etc.); auth URLs surfaced in chat UI. Write tools (send, create, reply, etc.) may require additional OAuth authorization beyond read tools. The app handles this automatically — when a write tool needs auth, users see an inline prompt to grant access.
4. **Custom verifier** (optional) — `/api/arcade/verify` confirms user identity for COAT protection. Enabling the custom verifier also requires: (a) setting up custom OAuth applications with each auth provider (Slack, GitHub, etc.) in the Arcade dashboard — Arcade's default shared OAuth apps cannot be used with a custom verifier, and (b) exposing the local dev server via ngrok (`ngrok http 8000`) so Arcade can reach the verifier endpoint, then configuring the ngrok URL in the Arcade dashboard

## Constraints

- `MultiServerMCPClient` is NOT a context manager in v0.2.x — call `await client.get_tools()` directly, do not use `async with`
- No `@arcadeai/arcadejs` — pure MCP protocol via `langchain-mcp-adapters`
- OAuth tokens stored in `.arcade-auth/` (gitignored)

## Customization Points

Marked with `# --- CUSTOMIZATION POINT ---` comments:

- `app/system-prompt.md` — Agent purpose and behavior
- `app/agent.py` — Model selection
- `app/models.py` — Database schema
