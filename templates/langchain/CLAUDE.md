# Arcade Agent — LangGraph + FastAPI

## What This Is

A Slack triage agent built with LangGraph (LangChain's agent framework), FastAPI, and Arcade's MCP Gateway. Users log in, the agent connects to Slack via Arcade tools, and triages unread messages.

## Tech Stack

- **Agent**: LangGraph `create_react_agent` with LangChain tool adapters
- **MCP**: `langchain-mcp-adapters` MultiServerMCPClient connecting to Arcade Gateway
- **Web**: FastAPI + Jinja2 templates + vanilla JS
- **DB**: SQLAlchemy async + aiosqlite (SQLite)
- **Auth**: bcrypt + httpOnly session cookies
- **Streaming**: SSE via sse-starlette

## Key Commands

```bash
source .venv/bin/activate
uvicorn app.main:app --reload          # Dev server
ruff check app/                        # Lint
ruff format app/                       # Format
ty check .                             # Type check
alembic revision --autogenerate -m ""  # New migration
alembic upgrade head                   # Run migrations
```

## Key Files

| File                   | Purpose                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `app/agent.py`         | Agent definition — model selection                                       |
| `app/system-prompt.md` | System prompt (customization point)                                      |
| `app/arcade_oauth.py`  | MCP OAuth flow — discovery, PKCE, token exchange, file-based persistence |
| `app/routes/chat.py`   | SSE streaming chat endpoint                                              |
| `app/routes/arcade.py` | OAuth connect/callback + custom user verifier                            |
| `app/routes/auth.py`   | Login, register, logout                                                  |
| `app/auth.py`          | Session management (bcrypt, cookies)                                     |
| `app/models.py`        | SQLAlchemy models (User, Session)                                        |
| `app/static/chat.js`   | Chat UI — SSE streaming, tool calls, auth URLs                           |

## Auth Architecture

Three layers:

1. **App auth** — email/password with bcrypt, session cookies, SQLite storage
2. **Arcade Gateway OAuth** — MCP OAuth flow with file-based token persistence in `.arcade-auth/` (discovery → registration → PKCE → token exchange)
3. **Tool-level OAuth** — Arcade handles per-tool auth (Slack, GitHub, etc.); auth URLs surfaced in chat UI
4. **Custom verifier** (optional) — `/api/arcade/verify` confirms user identity for COAT protection

## Constraints

- `MultiServerMCPClient` is NOT a context manager in v0.2.x — call `await client.get_tools()` directly, do not use `async with`
- No `@arcadeai/arcadejs` — pure MCP protocol via `langchain-mcp-adapters`
- OAuth tokens stored in `.arcade-auth/` (gitignored)

## Customization Points

Marked with `# --- CUSTOMIZATION POINT ---` comments:

- `app/system-prompt.md` — Agent purpose and behavior
- `app/agent.py` — Model selection
- `app/models.py` — Database schema
