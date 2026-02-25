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
- **Frontend**: `@ai-sdk/react` `useChat` hook + Tailwind CSS

## Key Commands

```bash
npm run dev                    # Dev server
npm run build                  # Production build
npm run lint                   # ESLint
npx drizzle-kit generate       # Generate migrations
npx drizzle-kit migrate        # Run migrations
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
| `app/chat/page.tsx`                     | Chat UI with `useChat` hook                            |
| `lib/auth.ts`                           | Session + password helpers                             |
| `lib/db/schema.ts`                      | Database schema (users + sessions)                     |

## Auth Architecture

Three layers:

1. **App auth** — email/password with bcrypt, session cookies (7-day), SQLite storage
2. **Arcade Gateway OAuth** — MCP OAuth flow with file-based token persistence in `.arcade-auth/` (discovery → registration → PKCE → token exchange)
3. **Tool-level OAuth** — Arcade handles per-tool auth (Slack, GitHub, etc.); auth URLs surfaced in chat UI
4. **Custom verifier** (optional) — `/api/auth/arcade/verify` confirms user identity for COAT protection

## Constraints

- `serverExternalPackages: ["better-sqlite3"]` in next.config.ts for native module bundling
- No `@mastra/*` packages — pure AI SDK + MCP SDK
- OAuth tokens stored in `.arcade-auth/` (gitignored)
- `maxDuration = 60` on chat route for tool execution loops

## Customization Points

- `lib/system-prompt.md` — Agent purpose and behavior
- `lib/agent.ts` — Model selection
- `lib/db/schema.ts` — Database schema
