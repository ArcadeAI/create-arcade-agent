# Arcade Chat Bot — Development Notes

This is a multi-platform chat bot built with Chat SDK + AI SDK + Arcade MCP.

## Architecture

- **Chat SDK** (`chat` package) handles platform adapters and event routing
- **AI SDK** (`ai` package) handles LLM calls with tool use
- **Arcade MCP** provides tools (GitHub, Gmail, Calendar, etc.) via MCP Gateway
- **Next.js** serves the webhook endpoint and OAuth callback

## Key Files

- `src/bot.ts` — Chat instance, event handlers (`onNewMention`, `onSubscribedMessage`)
- `src/agent.ts` — Model selection and system prompt loading
- `src/arcade.ts` — MCP client with OAuth for Arcade Gateway
- `app/api/chat-webhook/route.ts` — Webhook endpoint (just re-exports `bot.handler`)
- `system-prompt.md` — Bot personality and instructions

## Adding Features

- To add a new event handler, use `bot.onReaction()`, `bot.onAction()`, etc. in `src/bot.ts`
- To add a new platform, install its adapter and add to the `adapters` object in `src/bot.ts`
- To change tools, update your Arcade MCP Gateway at https://app.arcade.dev/mcp-gateways
