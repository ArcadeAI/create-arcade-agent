# Agent Playbook

This project is intentionally structured so coding agents can safely customize it.

## Safe Edit Zones

Look for these markers:

- `CUSTOMIZATION POINT` — expected user customization area
- `AI-EDIT-SAFE` — safe for automated edits
- `AI-EDIT-CAUTION` — integration-sensitive; edit carefully

## First Customization Steps

1. Edit `app/system-prompt.md` to change agent behavior.
2. Change model choice in `app/agent.py`.
3. Extend schema in `app/models.py` if you need app-specific data.
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
python -m app.doctor
ruff check app/
ty check .
```
