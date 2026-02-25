# AGENTS.md

Guidance for AI coding agents working in this repository.

## Repo Purpose

`create-arcade-agent` scaffolds starter projects that teach Arcade MCP Gateway concepts and produce working, customizable agent apps.

## High-Signal Workflow

1. Edit source templates in `templates/**` and CLI logic in `src/**`.
2. Run quality checks:
   - `npm run lint`
   - `npm run format:check`
   - `npm run typecheck`
   - `npm run build`
3. Validate scaffolding behavior via CI-equivalent smoke flow:
   - `node dist/index.js <name> --template <ai-sdk|mastra|langchain>`

## Editing Rules

- Keep generated templates simple and beginner-friendly.
- Prefer MCP Gateway patterns over direct SDK-specific concepts.
- Preserve/extend `CUSTOMIZATION POINT` and `AI-EDIT-SAFE` markers.
- Avoid introducing framework-specific complexity unless required.
- Keep OAuth/security guidance aligned with Arcade docs (custom verifier for production user-facing apps).
- Maintain cross-template UX parity for core flows (`ai-sdk`, `mastra`, `langchain`), especially auth, connection status, planning gates, and recovery actions.
- If a UX behavior changes in one template, update the equivalent behavior in the other two templates (or document why parity is intentionally not possible).

## Important Locations

- `src/` — generator runtime logic
- `templates/_shared/` — shared assets injected into generated projects
- `templates/ai-sdk/`, `templates/mastra/`, `templates/langchain/` — template-specific code
- `.github/workflows/ci.yml` — source of truth for validation gates
