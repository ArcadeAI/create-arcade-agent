# test-ai

A reference AI agent template that ships with a working Slack triage use case. Built with the [Vercel AI SDK](https://ai-sdk.dev), [Next.js](https://nextjs.org), and [Arcade](https://arcade.dev).

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

- [Bun](https://bun.sh) (or Node.js 18+)
- [Arcade account](https://app.arcade.dev) + MCP Gateway URL
- [OpenAI API key](https://platform.openai.com) or [Anthropic API key](https://console.anthropic.com)

## Quick Start

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Fill in your `ARCADE_GATEWAY_URL`, at least one LLM API key, and generate a `BETTER_AUTH_SECRET` in `.env`:
   ```bash
   echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" >> .env
   ```

3. **Run setup doctor:**
   ```bash
   bun run doctor
   ```

4. **Set up the database:**
   ```bash
   bunx drizzle-kit generate
   bunx drizzle-kit migrate
   ```

5. **Start the dev server:**
   ```bash
   bun run dev
   ```

6. **Open [http://localhost:8765](http://localhost:8765)**, register an account, and run your first plan from the dashboard.

When the agent scans your tools it will prompt you to authorize each one (Slack, GitHub, etc.) via OAuth in your browser. After authorizing each service, re-run the plan.

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

Edit `lib/system-prompt.md` to change what the agent does (PR reviews, calendar management, email drafting, etc.). The agent configuration in `lib/agent.ts` has model selection you can customize.

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

You can also manually configure the model in `lib/agent.ts`.

### Modify the database

Edit `lib/db/schema.ts` to add tables, then regenerate migrations:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

### Production considerations

This template uses app-level token storage — all users share the same Arcade Gateway connection via a single `.arcade-auth/` directory. For production deployments:

- **Per-user tokens**: Store OAuth tokens in the database keyed by user ID
- **Per-session PKCE**: Associate PKCE verifiers with user sessions to prevent cross-session conflicts
- **Token refresh**: Implement automatic token refresh per-user

## Project Structure

```
├── app/
│   ├── page.tsx                    # Login/register page
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Tailwind + CSS vars
│   ├── dashboard/
│   │   └── page.tsx                # Daily triage dashboard (main UI)
│   └── api/
│       ├── chat/route.ts           # Agent streaming endpoint (streamText + MCP tools)
│       ├── plan/route.ts           # Daily plan generation (SSE stream)
│       ├── sources/route.ts        # Tool auth status check
│       ├── health/route.ts         # Startup env-var validation
│       └── auth/
│           ├── arcade/
│           │   ├── callback/route.ts  # Arcade OAuth callback
│           │   ├── connect/route.ts   # Pre-flight connection check
│           │   └── verify/route.ts    # Custom user verifier (optional)
│           └── [...all]/route.ts   # Better Auth catch-all handler
├── lib/
│   ├── agent.ts                    # Model selection + system prompt loader
│   ├── arcade.ts                   # MCP Gateway connection + OAuth provider
│   ├── auth.ts                     # Better Auth server config + getSession helper
│   ├── auth-client.ts              # Better Auth React client (signIn, signUp, signOut)
│   ├── system-prompt.md            # System prompt (customization point)
│   └── db/
│       ├── index.ts                # Drizzle client
│       └── schema.ts               # Database schema
├── .env.example                    # Environment variable template
├── drizzle.config.ts               # Drizzle Kit configuration
└── next.config.ts                  # Next.js configuration
```

## How It Works

1. **AI SDK** (`lib/agent.ts`) selects the model (Claude or GPT-4o) based on which API key is set
2. **MCP client** (`lib/arcade.ts`) connects to Arcade's MCP Gateway using OAuth authentication via `@ai-sdk/mcp`
3. **Chat API route** (`app/api/chat/route.ts`) streams agent responses using `streamText` with MCP tools and multi-step tool execution
4. **Dashboard** (`app/dashboard/page.tsx`) displays the triage results; a slide-over `ChatPanel` uses `useChat` from `@ai-sdk/react` for follow-up questions
5. **Auth layer** (`lib/auth.ts`) uses [Better Auth](https://www.better-auth.com) for email/password authentication with httpOnly cookie sessions backed by SQLite

On first load the dashboard checks all tool permissions upfront. Any tools needing OAuth authorization are shown in a pre-flight gate — you can authorize each one (opens a new tab) or skip it. The dashboard only opens once every tool has been authorized or skipped. Returning to the tab after authorizing automatically re-checks the tool's status.

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
     {your-app-url}/api/auth/arcade/verify
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
   https://abc123.ngrok-free.app/api/auth/arcade/verify
   ```
   > **Tip:** The free ngrok URL changes every time you restart it. Use `ngrok http 8765 --url=your-static-domain.ngrok-free.app` if you have a static domain configured in your ngrok account, so the dashboard URL stays stable.

   After starting ngrok, update your `.env`:
   ```
   NEXT_PUBLIC_APP_URL=https://abc123.ngrok-free.app
   ```
   Then delete `.arcade-auth/` (the cached OAuth registration contains the old callback URL) and restart the dev server.

   > **Important:** You must also **open and log in to the app via the ngrok URL** (not `localhost`). Session cookies are scoped to the host that sets them. If you log in at `localhost` but Arcade redirects you to the ngrok verify URL, the browser won't send the `localhost` cookie — verification will silently fail and redirect you back to the dashboard with an error.

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
| `NEXT_PUBLIC_APP_URL` | No | App URL for OAuth redirects (default: `http://localhost:8765`). When using `ARCADE_CUSTOM_VERIFIER`, set this to your public URL (e.g. ngrok URL) and access the app from that URL — session cookies are scoped to this host. |
| `DATABASE_URL` | No | SQLite file path (default: `local.db`) |
| `ARCADE_CUSTOM_VERIFIER` | No | Set to `true` to enable COAT protection (see below) |
| `ARCADE_API_KEY` | When verifier enabled | Arcade API key for user verification |
