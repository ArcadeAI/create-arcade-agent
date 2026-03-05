# create-arcade-agent

A starter kit for building AI agents powered by [Arcade](https://arcade.dev). Scaffold a working agent in one command, then customize it to fit your use case — by hand or with an AI coding agent.

The default template is a daily planning and triage assistant (Slack, Google Calendar, Linear, GitHub, Gmail), but every part is designed to be swapped out: the system prompt, the tools, the model, and the data layer.

## Prerequisites

- **Node.js >= 22** -- required for the CLI and all templates
- **Bun >= 1.x** -- required for the `ai-sdk` and `mastra` templates (install from [bun.sh](https://bun.sh))
- **Python >= 3.10** -- required only for the `langchain` template
- **An Arcade account** -- sign up at [arcade.dev](https://arcade.dev) and create an MCP Gateway at [app.arcade.dev/mcp-gateways](https://app.arcade.dev/mcp-gateways)
- **An LLM API key** -- either an [OpenAI API key](https://platform.openai.com) or an [Anthropic API key](https://console.anthropic.com) (if both are set, Anthropic takes priority)

## Quick start

### TypeScript templates (ai-sdk, mastra)

```bash
npm create @arcadeai/agent my-agent -- --template ai-sdk
cd my-agent
cp .env.example .env   # add your keys
bun run dev
```

> Or with `npx`: `npx @arcadeai/create-agent my-agent --template ai-sdk`

### Python template (langchain)

```bash
npm create @arcadeai/agent my-agent -- --template langchain
cd my-agent
cp .env.example .env   # add your keys
source .venv/bin/activate
uvicorn app.main:app --host localhost --port 8765
```

## Templates

| Template      | Flag value  | Tech stack                                                              | UI                            |
| ------------- | ----------- | ----------------------------------------------------------------------- | ----------------------------- |
| **AI SDK**    | `ai-sdk`    | Next.js 16 + Vercel AI SDK + `@ai-sdk/mcp` + Drizzle ORM + SQLite       | React 19 + Tailwind CSS       |
| **Mastra**    | `mastra`    | Next.js 16 + Mastra + `@mastra/mcp` + Drizzle ORM + SQLite              | React 19 + Tailwind CSS       |
| **LangChain** | `langchain` | FastAPI + LangGraph + `langchain-mcp-adapters` + SQLAlchemy + aiosqlite | Jinja2 templates + vanilla JS |

All three templates connect to Arcade's MCP Gateway for tool discovery and execution. The Next.js + TypeScript templates (`ai-sdk` and `mastra`) share a common frontend. The Python template (`langchain`) uses server-rendered HTML with SSE streaming.

## Make it yours

Each template marks extensibility points with `CUSTOMIZATION POINT` comments. Here's what you'd typically change:

**System prompt** -- edit `system-prompt.md` to redefine the agent's purpose. Swap in a different goal and the agent becomes something new: a GitHub PR reviewer, a calendar scheduling assistant, a support triage bot, or anything else.

**Tools** -- update which tools your agent can see by editing your gateway in [Arcade's dashboard](https://app.arcade.dev/mcp-gateways). No code changes needed — the agent discovers tools automatically at startup.

**Model** -- edit `agent.ts` (TypeScript templates) or `agent.py` (Python template) to change the LLM model or provider.

**Database schema** -- extend the Drizzle schema (TypeScript) or SQLAlchemy models (Python) to store additional data for your use case.

**Frontend** -- the React UI in the TypeScript templates is yours to modify. It's standard Next.js with Tailwind CSS.

> These projects work great with AI coding agents like Claude Code or Cursor — point them at the codebase and describe what you want to build.

## Key files

Rather than listing every generated file, here are the ones you'll actually touch when customizing:

| File                                | Purpose                       |
| ----------------------------------- | ----------------------------- |
| `system-prompt.md`                  | Agent personality and purpose |
| `agent.ts` / `agent.py`             | Model and provider config     |
| `lib/arcade.ts` / `arcade_oauth.py` | MCP client setup              |
| `app/api/chat/` / `routes/chat.py`  | Streaming chat endpoint       |
| `db/` schema files                  | Data layer                    |
| `.env`                              | Configuration                 |

The `mastra` template places agent and tool definitions under `src/mastra/` instead of `lib/`.

## What Is an MCP Gateway?

An MCP Gateway is a managed tool endpoint in Arcade that your agent connects to via one URL.

Benefits:

- **One connection point** -- use one `ARCADE_GATEWAY_URL` instead of wiring many tool servers
- **Managed auth** -- Arcade manages user verification, tool OAuth, and handling secrets
- **Tool curation** -- choose exactly which tools your agent can see
- **Faster iteration** -- update tool access in Arcade without changing integration code
- **Clean model context** -- smaller, focused toolsets improve tool selection reliability
- **Portable setup** -- same gateway pattern works across frameworks and MCP clients

## Configuration

After scaffolding, copy the example env file and fill in your values:

```bash
cd my-agent
cp .env.example .env
```

### Required environment variables

| Variable                                | Description                             | Where to get it                                                                                              |
| --------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ARCADE_GATEWAY_URL`                    | Your Arcade MCP Gateway URL             | [app.arcade.dev/mcp-gateways](https://app.arcade.dev/mcp-gateways)                                           |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | LLM provider API key (set at least one) | [platform.openai.com](https://platform.openai.com) or [console.anthropic.com](https://console.anthropic.com) |

### Optional environment variables

| Variable                 | Description                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `ARCADE_CUSTOM_VERIFIER` | Set to `true` to enable per-user token binding (COAT protection)                                              |
| `ARCADE_API_KEY`         | Required when custom verifier is enabled; get from [app.arcade.dev/settings](https://app.arcade.dev/settings) |
| `DATABASE_URL`           | SQLite file path (defaults to `local.db`)                                                                     |
| `PORT`                   | Server port (defaults to `8765` for all templates)                                                            |

### Arcade Gateway setup

For best agent performance, create a dedicated gateway for this starter and keep tool access narrow.

1. Create a gateway at [app.arcade.dev/mcp-gateways](https://app.arcade.dev/mcp-gateways).
2. Add only these minimum tools (exact names):
   - Slack: `Slack_ListConversations`, `Slack_GetMessages`, `Slack_GetConversationMetadata`, `Slack_WhoAmI`
   - Google Calendar: `GoogleCalendar_ListEvents`, `GoogleCalendar_ListCalendars`, `GoogleCalendar_WhoAmI`
   - Linear: `Linear_GetNotifications`, `Linear_GetRecentActivity`, `Linear_ListIssues`, `Linear_GetIssue`, `Linear_ListProjects`, `Linear_GetProject`, `Linear_WhoAmI`
   - GitHub: `Github_ListNotifications`, `Github_GetNotificationSummary`, `Github_ListPullRequests`, `Github_GetPullRequest`, `Github_GetUserOpenItems`, `Github_GetUserRecentActivity`, `Github_GetReviewWorkload`, `Github_GetIssue`, `Github_WhoAmI`
   - Gmail: `Gmail_ListEmails`, `Gmail_ListThreads`, `Gmail_GetThread`, `Gmail_SearchThreads`, `Gmail_WhoAmI`
3. Avoid enabling broad "all tools" access. Start small and add tools only when the agent needs them.

## Troubleshooting

### Port already in use

The default port is `8765` for all templates. If the port is occupied, either stop the other process or change the `PORT` variable in `.env`.

### `ARCADE_GATEWAY_URL` is missing

If the app says `ARCADE_GATEWAY_URL is missing`:

1. Create a gateway at [app.arcade.dev/mcp-gateways](https://app.arcade.dev/mcp-gateways)
2. Add the exact minimum tools listed in the **Arcade Gateway setup** section above
3. Copy the gateway URL into `.env` as `ARCADE_GATEWAY_URL`
4. Retry connection in the app

### Tool calls return authorization URLs

This is expected behavior. When a tool requires user authorization (e.g., Slack access), Arcade returns an authorization URL. The chat UI surfaces this link so the user can grant access in their browser.

## Production considerations

The generated project uses file-based storage for both the SQLite database and Arcade OAuth tokens (`.arcade-auth/`). This works for local development and single-user deployments, but has limitations in production:

- **OAuth token storage** -- tokens are stored per-machine in `.arcade-auth/`. In a multi-user deployment, you will need to implement a database-backed token store keyed by user ID.
- **SQLite** -- suitable for low-traffic use. For production workloads, consider migrating to PostgreSQL or another production database.
- **Custom user verification** -- enable `ARCADE_CUSTOM_VERIFIER=true` and set `ARCADE_API_KEY` in production to bind Arcade tool authorizations to your app's user sessions and prevent cross-origin authorization token (COAT) attacks.
- **Session secret** -- the langchain template uses `APP_SECRET_KEY` for session signing. Change the default value to a cryptographically random string in production.

## License

MIT

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development and release instructions.
