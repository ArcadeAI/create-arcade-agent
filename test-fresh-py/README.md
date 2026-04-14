# test-fresh-py

A reference AI agent template that ships with a working Slack triage use case. Built with [LangGraph](https://langchain-ai.github.io/langgraph/), [FastAPI](https://fastapi.tiangolo.com), and [Arcade](https://arcade.dev).

The agent connects to Arcade's MCP Gateway to call Slack tools (and any other tools you configure), with automatic OAuth handling and streaming responses.

## What Is an MCP Gateway?

An MCP Gateway is a managed tool endpoint in Arcade that your agent connects to via one URL.

Benefits:

- **One connection point** — use one `ARCADE_GATEWAY_URL` instead of wiring many tool servers
- **Tool curation** — choose exactly which tools your agent can see
- **Faster iteration** — update tool access in Arcade without changing integration code
- **Cleaner model context** — smaller, focused toolsets improve tool selection reliability
- **Portable setup** — same gateway pattern works across frameworks and MCP clients

## Prerequisites

- Python 3.11+
- [Arcade account](https://app.arcade.dev) + MCP Gateway URL
- [OpenAI API key](https://platform.openai.com) or [Anthropic API key](https://console.anthropic.com)

## Quick Start

1. **Activate the virtual environment:**
   ```bash
   source .venv/bin/activate
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Fill in your `ARCADE_GATEWAY_URL` and at least one LLM API key in `.env`.

3. **Run setup doctor:**
   ```bash
   python -m app.doctor
   ```

4. **Set up the database** (if not already done by the CLI):
   ```bash
   alembic upgrade head
   ```

5. **Start the dev server:**
   ```bash
   uvicorn app.main:app --reload
   ```

6. **Open [http://localhost:8765](http://localhost:8765)**, register an account, and start chatting.

When the agent first tries to use an Arcade tool that requires OAuth (e.g., Slack), it will return an authorization URL. Click the link to authorize in a new tab, then click "Continue After Authorization" in the chat to retry.

## Arcade Gateway Setup Checklist

1. Create a gateway at [app.arcade.dev/mcp-gateways](https://app.arcade.dev/mcp-gateways).
2. Add only these minimum tools (exact names):
   - Slack: `Slack_ListConversations`, `Slack_GetMessages`, `Slack_GetConversationMetadata`, `Slack_WhoAmI`
   - Google Calendar: `GoogleCalendar_ListEvents`, `GoogleCalendar_ListCalendars`, `GoogleCalendar_WhoAmI`
   - Linear: `Linear_GetNotifications`, `Linear_GetRecentActivity`, `Linear_ListIssues`, `Linear_GetIssue`, `Linear_ListProjects`, `Linear_GetProject`, `Linear_WhoAmI`
   - GitHub: `Github_ListNotifications`, `Github_GetNotificationSummary`, `Github_ListPullRequests`, `Github_GetPullRequest`, `Github_GetUserOpenItems`, `Github_GetUserRecentActivity`, `Github_GetReviewWorkload`, `Github_GetIssue`, `Github_WhoAmI`
   - Gmail: `Gmail_ListEmails`, `Gmail_ListThreads`, `Gmail_GetThread`, `Gmail_SearchThreads`, `Gmail_WhoAmI`
3. Avoid broad "all tools" access. Smaller toolsets improve tool selection quality.
4. Copy the gateway URL into `.env` as `ARCADE_GATEWAY_URL`.
5. Retry the connection check in the app.

If you see `ARCADE_GATEWAY_URL is missing`, your app cannot connect to Arcade until this value is set.

## Customization

### Change the agent's purpose

Edit `app/system-prompt.md` to change what the agent does (PR reviews, calendar management, email drafting, etc.). The agent configuration in `app/agent.py` has `# --- CUSTOMIZATION POINT ---` markers for model selection and other settings.

### Add or change Arcade tools

1. Go to [app.arcade.dev/mcp-gateways](https://app.arcade.dev/mcp-gateways)
2. Add tools to your gateway (Gmail, GitHub, Google Calendar, etc.)
3. Update `ARCADE_GATEWAY_URL` in `.env` if needed

The agent automatically discovers all tools available on your gateway.

### Switch LLM provider

The template auto-detects which provider to use based on which API key is set in `.env`:
- Set `ANTHROPIC_API_KEY` → uses Claude
- Set `OPENAI_API_KEY` → uses GPT-4o
- If both are set, Anthropic takes priority

You can also manually configure the model in `app/agent.py`.

### Modify the database

Edit `app/models.py` to add models, then create a new migration:

```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Production considerations

This template uses app-level token storage — all users share the same Arcade Gateway connection via a single `.arcade-auth/` directory. For production deployments:

- **Per-user tokens**: Store OAuth tokens in the database keyed by user ID
- **Per-session PKCE**: Associate PKCE verifiers with user sessions to prevent cross-session conflicts
- **Token refresh**: Implement automatic token refresh per-user

## Project Structure

```
├── app/
│   ├── main.py                 # FastAPI app entry point
│   ├── config.py               # Settings loaded from .env
│   ├── agent.py                # LangGraph agent + model selection (customization point)
│   ├── system-prompt.md        # System prompt (customization point)
│   ├── arcade_oauth.py         # MCP Gateway OAuth connection
│   ├── auth.py                 # get_current_user helper (FastAPI Users-backed)
│   ├── auth_manager.py         # FastAPI Users setup (UserManager, JWT strategy)
│   ├── database.py             # SQLAlchemy async engine
│   ├── models.py               # User model (extends FastAPI Users base)
│   ├── routes/
│   │   ├── auth.py             # Login, register, logout endpoints (FastAPI Users)
│   │   ├── chat.py             # Streaming chat endpoint (SSE)
│   │   └── arcade.py           # Connection check + OAuth callback + custom verifier
│   ├── static/
│   │   ├── chat.js             # Chat UI logic
│   │   └── styles.css          # Minimal custom styles
│   └── templates/
│       ├── base.html           # Layout with Tailwind CDN
│       ├── login.html          # Login/register page
│       └── chat.html           # Chat interface
├── alembic/
│   ├── env.py                  # Async migration config
│   └── versions/
│       └── 001_initial.py      # Users table (FastAPI Users schema)
├── .env.example                # Environment variable template
├── alembic.ini                 # Alembic configuration
└── pyproject.toml              # Python project metadata
```

## How It Works

1. **LangGraph agent** (`app/agent.py`) defines a ReAct agent with a system prompt and tools from Arcade
2. **OAuth client** (`app/arcade_oauth.py`) connects to Arcade's MCP Gateway using OAuth authentication with file-based token persistence
3. **Chat endpoint** (`app/routes/chat.py`) streams agent responses as SSE events
4. **Frontend** (`app/templates/chat.html` + `app/static/chat.js`) renders the chat with streaming, tool calls, and auth URL handling
5. **Auth layer** (`app/auth_manager.py`) uses [FastAPI Users](https://fastapi-users.github.io/fastapi-users/) for email/password authentication with stateless JWT sessions stored in httpOnly cookies

When Arcade tools require OAuth authorization (e.g., Slack access), the tool response includes an authorization URL. The chat UI displays it as a clickable link. After the user authorizes in a new tab, they click "Continue After Authorization" to retry.

## Production Security: Custom User Verification

By default, anyone who has the Arcade authorization link can complete the OAuth flow. In production with multiple users, this opens a [COAT attack](https://www.arcade.dev/blog/arcade-proactively-addressed-coat-vulnerability-in-agentic-ai) vector — an attacker could send an auth link to a victim, and if the victim completes it, the attacker gains access to the victim's account.

The **custom user verifier** solves this by confirming that the person completing the authorization is the same user who started it, using your app's session.

### Setup

1. **Enable in `.env`:**
   ```
   ARCADE_CUSTOM_VERIFIER=true
   ARCADE_API_KEY=your-arcade-api-key   # From https://app.arcade.dev/settings
   ```

2. **Configure in Arcade Dashboard:**
   - Go to your gateway settings at [app.arcade.dev/mcp-gateways](https://app.arcade.dev/mcp-gateways)
   - Under **Auth > Settings**, set the custom verifier URL to:
     ```
     {your-app-url}/api/arcade/verify
     ```

3. **Set up custom OAuth apps for each auth provider:**
   When you enable a custom user verifier, Arcade's default shared OAuth applications can no longer be used. You must register your own OAuth application with each provider you want to use (e.g., Slack, GitHub, Google) and configure them in the Arcade dashboard under your gateway's auth provider settings. See the [Arcade Custom Auth Provider docs](https://docs.arcade.dev/en/guides/user-facing-agents/secure-auth-production) for details.

4. **Expose your local server for development (ngrok):**
   Arcade must be able to reach your verifier endpoint over the internet, so `localhost` URLs won't work in the dashboard. Use [ngrok](https://ngrok.com/) to create a public tunnel:
   ```bash
   # Install ngrok: https://ngrok.com/download
   ngrok http 8765
   ```
   ngrok will print a forwarding URL like `https://abc123.ngrok-free.app`. Use that as your verifier URL in the Arcade dashboard:
   ```
   https://abc123.ngrok-free.app/api/arcade/verify
   ```
   > **Tip:** The free ngrok URL changes every time you restart it. Use `ngrok http 8765 --url=your-static-domain.ngrok-free.app` if you have a static domain configured in your ngrok account, so the dashboard URL stays stable.

5. **Test it:** When a tool requires authorization, Arcade will redirect the user through your verifier endpoint. The endpoint checks the user's session, confirms their identity with Arcade, and redirects them back.

### Troubleshooting

**`verify_session_required` error or redirect loop back to login:**
The session cookie doesn't match the host the verify request came in on. Make sure you logged in via `NEXT_PUBLIC_APP_URL` (the ngrok URL), not `localhost`.

**Repeated `400 Bad Request` from Arcade even after fixing the above:**
Arcade caches a pending auth flow server-side. After too many failed verify attempts, the same `flow_id` keeps being returned by WhoAmI but it's no longer valid. To get a fresh `flow_id`: delete `.arcade-auth/`, restart the dev server, re-authenticate the gateway, then try authorizing the tool again from the dashboard.

For full details, see the [Arcade Secure Auth Guide](https://docs.arcade.dev/en/guides/user-facing-agents/secure-auth-production).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ARCADE_GATEWAY_URL` | Yes | MCP Gateway URL from [app.arcade.dev/mcp-gateways](https://app.arcade.dev/mcp-gateways) |
| `OPENAI_API_KEY` | One of these | OpenAI API key |
| `ANTHROPIC_API_KEY` | One of these | Anthropic API key |
| `APP_URL` | No | App URL for verifier callback (default: `http://localhost:8765`) |
| `APP_SECRET_KEY` | No | Secret key for session security (change in production!) |
| `DATABASE_URL` | No | SQLAlchemy async URL (default: `sqlite+aiosqlite:///local.db`) |
| `ARCADE_CUSTOM_VERIFIER` | No | Set to `true` to enable COAT protection (see below) |
| `ARCADE_API_KEY` | When verifier enabled | Arcade API key for user verification |
