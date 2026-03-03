# Arcade Agent — AI SDK + Next.js

## What This Is

A Slack triage agent built with the Vercel AI SDK, Next.js, and Arcade's MCP Gateway. Users log in, the agent connects to Slack via Arcade tools, and triages unread messages.

## Tech Stack

- **Agent**: Vercel AI SDK `streamText` with multi-step tool execution (`maxSteps`)
- **MCP**: `@ai-sdk/mcp` `createMCPClient` connecting to Arcade Gateway via SSE
- **OAuth**: `@modelcontextprotocol/sdk` `auth()` for MCP OAuth flow (discovery, registration, PKCE, token exchange)
- **Web**: Next.js 16 App Router + React 19
- **DB**: Drizzle ORM + better-sqlite3
- **Auth**: bcrypt + httpOnly session cookies
- **Frontend**: `@arcadeai/design-system` components + Tailwind CSS 4; `@ai-sdk/react` `useChat` for the chat panel

## Key Commands

```bash
bun run dev                    # Dev server
bun run build                  # Production build
bun run lint                   # ESLint
bun run doctor                 # Environment + gateway setup checks
bun run format                 # Prettier format
bun run format:check           # Prettier check
bunx drizzle-kit generate       # Generate migrations
bunx drizzle-kit migrate        # Run migrations
```

## Key Files

| File                                    | Purpose                                                |
| --------------------------------------- | ------------------------------------------------------ |
| `lib/agent.ts`                          | Model selection (Claude/GPT-4o) + system prompt loader |
| `lib/system-prompt.md`                  | System prompt (customization point)                    |
| `lib/arcade.ts`                         | MCP OAuth provider + `createMCPClient` factory         |
| `app/api/chat/route.ts`                 | Streaming chat endpoint (`streamText` + MCP tools)     |
| `app/api/auth/arcade/connect/route.ts`  | Pre-flight Arcade connection check                     |
| `app/api/auth/arcade/callback/route.ts` | OAuth callback (code → tokens)                         |
| `app/api/auth/arcade/verify/route.ts`   | Custom user verifier (COAT protection)                 |
| `app/dashboard/page.tsx`                | Daily triage dashboard (main UI entry point)           |
| `lib/auth.ts`                           | Session + password helpers                             |
| `lib/db/schema.ts`                      | Database schema (users + sessions)                     |

## Auth Architecture

Three layers:

1. **App auth** — email/password with bcrypt, session cookies (7-day), SQLite storage
2. **Arcade Gateway OAuth** — MCP OAuth flow with file-based token persistence in `.arcade-auth/` (discovery → registration → PKCE → token exchange)
3. **Tool-level OAuth** — Arcade handles per-tool auth (Slack, GitHub, etc.); auth URLs surfaced in chat UI
4. **Custom verifier** (optional) — `/api/auth/arcade/verify` confirms user identity for COAT protection. Enabling the custom verifier also requires: (a) setting up custom OAuth applications with each auth provider (Slack, GitHub, etc.) in the Arcade dashboard — Arcade's default shared OAuth apps cannot be used with a custom verifier, and (b) exposing the local dev server via ngrok (`ngrok http 3000`) so Arcade can reach the verifier endpoint, then configuring the ngrok URL in the Arcade dashboard. When using ngrok: set `NEXT_PUBLIC_APP_URL` to the ngrok URL, delete `.arcade-auth/` (cached OAuth registration has the old callback URL), and restart the dev server

## Constraints

- `serverExternalPackages: ["better-sqlite3"]` in next.config.ts for native module bundling
- No `@mastra/*` packages — pure AI SDK + MCP SDK
- OAuth tokens stored in `.arcade-auth/` (gitignored)
- `maxDuration = 60` on chat route for tool execution loops

## Customization Points

- `lib/system-prompt.md` — Agent purpose and behavior
- `lib/agent.ts` — Model selection
- `lib/db/schema.ts` — Database schema

## Claude Code Notes

- **Main UI**: `app/dashboard/page.tsx` — layout, plan-run flow, and ChatPanel toggle. This is the primary entry point after login.
- **Component library**: import UI components from `@arcadeai/design-system`; import brand icons (Slack, GitHub, Gmail, etc.) from `@arcadeai/design-system/components/ui/atoms/icons`.
- **Startup checks**: add new env-var warnings in `app/api/health/route.ts` — push a new `ConfigWarning` object to the `warnings` array.
- **Safe to edit**: `lib/system-prompt.md`, `lib/agent.ts` (model choice), `lib/db/schema.ts` (schema extensions).
- **Edit with care**: anything under `app/api/auth/arcade/` — the OAuth flow is stateful (PKCE verifier, token exchange, `.arcade-auth/` persistence). Read the full flow before making changes.
- **Do not touch**: `lib/arcade.ts` unless you understand the `OAuthClientProvider` contract expected by `@ai-sdk/mcp`.
