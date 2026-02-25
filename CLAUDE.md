# create-arcade-agent

CLI scaffolding tool that generates Arcade-powered AI agent projects.

## Structure

- `src/` -- CLI source (TypeScript, compiled with `tsc` to `dist/`)
- `templates/` -- project templates copied/rendered during scaffolding
  - `ai-sdk/` -- Next.js + Vercel AI SDK
  - `mastra/` -- Next.js + Mastra
  - `langchain/` -- FastAPI + LangGraph (Python)
  - `_shared/` -- shared files injected into generated projects (Next.js UI, prompts, partials)

## Key Commands

```bash
npm run build          # Compile CLI
npm run dev            # Watch mode
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint (src/ + templates/ TS files)
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier format
npm run format:check   # Prettier check
```

For Python templates:

```bash
ruff check templates/langchain/     # Lint
ruff format templates/langchain/    # Format
```

## Linting & Formatting

- **ESLint v9** (flat config in `eslint.config.mjs`) + **Prettier** (`.prettierrc`) for TypeScript/JS
- **Ruff** (`templates/langchain/ruff.toml`) for Python
- `templates/_shared/nextjs-ui/` is excluded from root ESLint (has its own `eslint.config.mjs` for generated projects)
- `templates/langchain/` is excluded from ESLint (Python-only, covered by Ruff)
- Always run `npm run lint` and `npm run format:check` before committing

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs 3 jobs:

1. **lint-and-build** -- lint + format + typecheck + build on Node 18 & 22
2. **lint-python** -- Ruff on `templates/langchain/`
3. **smoke-test-templates** -- scaffolds each template and verifies it builds

## How the CLI Works

The CLI is fully non-interactive with both args: `node dist/index.js <name> --template <template>`

1. Reads project name from `argv[2]` and `--template` flag
2. Copies template files, rendering `.hbs` files with Handlebars
3. Copies shared files from `_shared/` per `template.json` mappings
4. Renames dotfiles (e.g., `_gitignore` -> `.gitignore`)
5. Runs install steps (`npm install` or `pip install`)
6. Runs migrations (Drizzle Kit or Alembic) -- failures are non-fatal
