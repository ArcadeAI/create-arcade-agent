# Agent Playbook

This project is intentionally structured so coding agents can safely customize it.

## Safe Edit Zones

Look for these markers:

- `CUSTOMIZATION POINT` — expected user customization area
- `AI-EDIT-SAFE` — safe for automated edits
- `AI-EDIT-CAUTION` — integration-sensitive; edit carefully

## First Customization Steps

1. Edit `src/mastra/agents/system-prompt.md` to change agent behavior.
2. Change model choice in `src/mastra/agents/triage-agent.ts`.
3. Extend schema in `lib/db/schema.ts` if you need app-specific data.
4. Ensure `ARCADE_GATEWAY_URL` is set and the gateway has the expected tools.

## Gateway Checklist

Create/configure your gateway at `https://app.arcade.dev/mcp-gateways` and add:

- Slack
- Google Calendar
- Linear
- GitHub
- Gmail

## Verification Commands

```bash
bun run doctor
bun run typecheck
bun run lint
```
