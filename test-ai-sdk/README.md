# test-ai-sdk

A reference AI agent template that ships with a working Slack triage use case. Built with the [Vercel AI SDK](https://ai-sdk.dev), [Next.js](https://nextjs.org), and [Arcade](https://arcade.dev).

The agent connects to Arcade's MCP Gateway to call Slack tools (and any other tools you configure), with automatic OAuth handling and streaming responses.

## Prerequisites

- Node.js 18+
- [Arcade account](https://app.arcade.dev) + MCP Gateway URL
- [OpenAI API key](https://platform.openai.com) or [Anthropic API key](https://console.anthropic.com)

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Fill in your `ARCADE_GATEWAY_URL` and at least one LLM API key in `.env`.

3. **Set up the database:**
   ```bash
   npx drizzle-kit generate
   npx drizzle-kit migrate
   ```

4. **Start the dev server:**
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)**, register an account, and start chatting.

When the agent first tries to use an Arcade tool, you'll be prompted to authenticate with Arcade via OAuth in your browser. After authorizing, click "Continue After Authorization" in the chat to retry.

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

## Project Structure

```
├── app/
│   ├── page.tsx                    # Login/register page
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Tailwind + CSS vars
│   ├── chat/
│   │   └── page.tsx                # Chat interface
│   └── api/
│       ├── chat/route.ts           # Agent streaming endpoint (streamText + MCP tools)
│       └── auth/
│           ├── arcade/
│           │   ├── callback/route.ts  # Arcade OAuth callback
│           │   ├── connect/route.ts   # Pre-flight connection check
│           │   └── verify/route.ts    # Custom user verifier (optional)
│           ├── login/route.ts      # Login endpoint
│           ├── register/route.ts   # Registration endpoint
│           └── logout/route.ts     # Logout endpoint
├── lib/
│   ├── agent.ts                    # Model selection + system prompt loader
│   ├── arcade.ts                   # MCP Gateway connection + OAuth provider
│   ├── auth.ts                     # Session + password helpers
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
4. **Frontend** (`app/chat/page.tsx`) renders the chat with `useChat` from `@ai-sdk/react`, including OAuth authorization URL handling
5. **Auth layer** (`lib/auth.ts`) provides bcrypt password hashing + httpOnly cookie sessions backed by SQLite

When Arcade tools require OAuth authorization (e.g., Slack access), the gateway returns an authorization URL. The agent relays it to the user, who authorizes in a new tab, then clicks "Continue After Authorization" to retry.

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
     For local development: `http://localhost:3000/api/auth/arcade/verify`

3. **Test it:** When a tool requires authorization, Arcade will redirect the user through your verifier endpoint. The endpoint checks the user's session, confirms their identity with Arcade, and redirects them back.

For full details, see the [Arcade Secure Auth Guide](https://docs.arcade.dev/en/guides/user-facing-agents/secure-auth-production).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ARCADE_GATEWAY_URL` | Yes | MCP Gateway URL from [app.arcade.dev/mcp-gateways](https://app.arcade.dev/mcp-gateways) |
| `OPENAI_API_KEY` | One of these | OpenAI API key |
| `ANTHROPIC_API_KEY` | One of these | Anthropic API key |
| `NEXT_PUBLIC_APP_URL` | No | App URL for OAuth callback (default: `http://localhost:3000`) |
| `DATABASE_URL` | No | SQLite file path (default: `local.db`) |
| `ARCADE_CUSTOM_VERIFIER` | No | Set to `true` to enable COAT protection (see below) |
| `ARCADE_API_KEY` | When verifier enabled | Arcade API key for user verification |
