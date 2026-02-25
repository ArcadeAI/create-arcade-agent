# Arcade Agent Template

AI agent template: Mastra + Next.js + Arcade MCP Gateway.

## Key Commands

```bash
npm run dev                # Start development server
npm run build              # Production build
npm run lint               # ESLint
npm run doctor             # Environment + gateway setup checks
npm run format             # Prettier format
npm run format:check       # Prettier check
npx drizzle-kit generate   # Generate DB migrations after schema changes
npx drizzle-kit migrate    # Apply migrations to SQLite
```

## Architecture

- **Mastra** (`@mastra/core`) — agent framework. Agent defined in `src/mastra/agents/triage-agent.ts`.
- **MCPClient** (`@mastra/mcp`) — connects to Arcade MCP Gateway for tool discovery + execution. Uses Arcade OAuth (not header auth). Defined in `src/mastra/tools/arcade.ts`.
- **`@mastra/ai-sdk`** — bridges Mastra streams to Vercel AI SDK format. `handleChatStream` is used in the API route.
- **Drizzle ORM** + `better-sqlite3` — SQLite for auth only (users + sessions tables).
- **bcrypt** — password hashing in `lib/auth.ts`.
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
| `lib/auth.ts`                           | Password hashing, session management                               |
| `lib/db/schema.ts`                      | Drizzle schema (users, sessions)                                   |
| `app/chat/page.tsx`                     | Chat UI with OAuth URL handling                                    |
| `app/page.tsx`                          | Login/register form                                                |

## Auth

Three auth layers:

1. **App auth** — bcrypt + SQLite sessions (`lib/auth.ts`). Protects the chat endpoint so only registered users can access it.
2. **Arcade OAuth** — custom `OAuthClientProvider` implementation (`src/mastra/tools/arcade.ts`). Authenticates the MCP connection to Arcade Gateway. No API keys needed — the user authenticates via browser. Tokens persist in `.arcade-auth/` (gitignored). The OAuth callback is at `/api/auth/arcade/callback`.
3. **Custom user verifier** (optional) — `/api/auth/arcade/verify`. When `ARCADE_CUSTOM_VERIFIER=true`, binds Arcade tool authorizations to the app's user session, preventing COAT attacks. Requires `ARCADE_API_KEY`.

## Constraints

- `next.config.ts` uses `serverExternalPackages` for `better-sqlite3` and `@mastra/core` (native modules).
- Tools are loaded lazily via a dynamic function (`async () => mcpClient.listTools()`) to avoid MCP connection at build time.
- No `@arcadeai/arcadejs` — all Arcade interaction goes through MCP Gateway via `@mastra/mcp`.

## Customization Points

Files with `// --- CUSTOMIZATION POINT ---` comments:

- `src/mastra/agents/triage-agent.ts` — agent purpose, model, system prompt
- `src/mastra/tools/arcade.ts` — gateway URL, OAuth config
- `src/mastra/index.ts` — agent registration
