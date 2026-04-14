# Arcade Agent Template

AI agent template: Mastra + Next.js + Arcade MCP Gateway.

## Key Commands

```bash
bun run dev                # Start development server
bun run build              # Production build
bun run lint               # ESLint
bun run doctor             # Environment + gateway setup checks
bun run format             # Prettier format
bun run format:check       # Prettier check
bunx drizzle-kit generate  # Generate DB migrations after schema changes
bunx drizzle-kit migrate   # Apply migrations to SQLite
```

## Architecture

- **Mastra** (`@mastra/core`) — agent framework. Agent defined in `src/mastra/agents/triage-agent.ts`.
- **MCPClient** (`@mastra/mcp`) — connects to Arcade MCP Gateway for tool discovery + execution. Uses Arcade OAuth (not header auth). Defined in `src/mastra/tools/arcade.ts`.
- **`@mastra/ai-sdk`** — bridges Mastra streams to Vercel AI SDK format. `handleChatStream` is used in the API route.
- **Drizzle ORM** + `better-sqlite3` — SQLite for auth storage (Better Auth tables).
- **[Better Auth](https://www.better-auth.com)** — email/password auth with session cookies (`lib/auth.ts`, `lib/auth-client.ts`).
- **`useChat`** from `@ai-sdk/react` — frontend streaming chat hook.

## Key Files

| File                                    | Purpose                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `src/mastra/agents/triage-agent.ts`     | Agent definition with system prompt + model + tools                |
| `src/mastra/tools/arcade.ts`            | MCPClient with custom OAuthClientProvider (file-based persistence) |
| `src/mastra/index.ts`                   | Mastra instance registration                                       |
| `app/api/chat/route.ts`                 | Streaming chat endpoint (auth-protected)                           |
| `app/api/auth/arcade/callback/route.ts` | OAuth callback for Arcade MCP authentication                       |
| `app/api/auth/arcade/connect/route.ts`  | Pre-flight connection check (surfaces auth URL to frontend)        |
| `app/api/auth/arcade/verify/route.ts`   | Custom user verifier for COAT protection (opt-in via env var)      |
| `lib/auth.ts`                           | Better Auth server config + `getSession()` helper                  |
| `lib/auth-client.ts`                    | Better Auth React client (signIn, signUp, signOut)                 |
| `lib/db/schema.ts`                      | Drizzle schema (Better Auth tables + custom tables)                |
| `app/dashboard/page.tsx`                | Daily triage dashboard (main UI entry point)                       |
| `app/page.tsx`                          | Login/register form                                                |

## Auth

Three auth layers:

1. **App auth** — [Better Auth](https://www.better-auth.com) email/password authentication with SQLite sessions via Drizzle adapter (`lib/auth.ts`). Configure `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in `.env`. Protects the chat endpoint so only registered users can access it.
2. **Arcade OAuth** — custom `OAuthClientProvider` implementation (`src/mastra/tools/arcade.ts`). Authenticates the MCP connection to Arcade Gateway. No API keys needed — the user authenticates via browser. Tokens persist in `.arcade-auth/` (gitignored). The OAuth callback is at `/api/auth/arcade/callback`.
3. **Custom user verifier** (optional) — `/api/auth/arcade/verify`. When `ARCADE_CUSTOM_VERIFIER=true`, binds Arcade tool authorizations to the app's user session, preventing COAT attacks. Requires `ARCADE_API_KEY`. Enabling the custom verifier also requires: (a) setting up custom OAuth applications with each auth provider (Slack, GitHub, etc.) in the Arcade dashboard — Arcade's default shared OAuth apps cannot be used with a custom verifier, and (b) exposing the local dev server via ngrok (`ngrok http 3000`) so Arcade can reach the verifier endpoint, then configuring the ngrok URL in the Arcade dashboard. When using ngrok: set `NEXT_PUBLIC_APP_URL` to the ngrok URL, delete `.arcade-auth/` (cached OAuth registration has the old callback URL), and restart the dev server.

## Constraints

- `next.config.ts` uses `serverExternalPackages` for `better-sqlite3` and `@mastra/core` (native modules).
- Tools are loaded lazily via a dynamic function (`async () => mcpClient.listTools()`) to avoid MCP connection at build time.
- No `@arcadeai/arcadejs` — all Arcade interaction goes through MCP Gateway via `@mastra/mcp`.

## Customization Points

Files with `// --- CUSTOMIZATION POINT ---` comments:

- `src/mastra/agents/triage-agent.ts` — agent purpose, model, system prompt
- `src/mastra/tools/arcade.ts` — gateway URL, OAuth config
- `src/mastra/index.ts` — agent registration

## Claude Code Notes

- **Main UI**: `app/dashboard/page.tsx` — layout, plan-run flow, and ChatPanel toggle. This is the primary entry point after login.
- **Agent logic**: `src/mastra/agents/triage-agent.ts` — system prompt, model, and tool list.
- **Component library**: import UI components from `@arcadeai/design-system`; import brand icons (Slack, GitHub, Gmail, etc.) from `@arcadeai/design-system/components/ui/atoms/icons`.
- **Startup checks**: add new env-var warnings in `app/api/health/route.ts` — push a new `ConfigWarning` object to the `warnings` array.
- **Safe to edit**: `src/mastra/agents/system-prompt.md`, `src/mastra/agents/triage-agent.ts` (model/prompt), `lib/db/schema.ts` (schema extensions).
- **Edit with care**: `src/mastra/tools/arcade.ts` — custom `OAuthClientProvider` for MCP OAuth. Token persistence (`.arcade-auth/`) and PKCE are stateful; read the full flow before changing it.
