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

1. **lint-and-build** -- lint + format + typecheck + build on Node 22
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

## Notes for Agents

### Package managers

- The **CLI itself** uses `npm`.
- Generated `ai-sdk` and `mastra` projects use **`bun`** — `template.json` sets `bun install` and `bun run dev`. Don't substitute `npm` when writing commands for generated projects.
- The `langchain` template uses Python (`pip` / `uvicorn`).

### Template system

- `templates/_shared/nextjs-ui/` is the shared React frontend, injected into generated projects via the `sharedFiles` map in each `template.json`. It has its own `eslint.config.mjs` and is **excluded from root ESLint**.
- `templates/_shared/partials/` holds Handlebars partials included with `{{> partial-name.md}}`.
- `.hbs` files render with context `{ projectName, name }` where `name` is the template slug (e.g. `"ai-sdk"`).

### UI components

Generated Next.js templates use `@arcadeai/design-system` (not bare shadcn/ui). Import components from `@arcadeai/design-system` and brand icons from `@arcadeai/design-system/components/ui/atoms/icons`.

### End-to-end testing

```bash
npm run build
node dist/index.js test-proj --template ai-sdk
cd test-proj && bun run build && bun run lint
cd .. && node dist/index.js test-proj-py --template langchain
```

## Releasing

Releases are **manual and tag-triggered** — nothing publishes automatically on merge to `main`. You must explicitly push a version tag to trigger the release workflow (`.github/workflows/release.yml`).

### One-time setup (must be done before first release)

1. **Bootstrap the package on npm** — the package must exist before Trusted Publishers can be configured:

   ```bash
   npm run build
   npm publish --access public
   ```

   _(Requires being logged in as an org member: `npm login`)_

2. **Configure Trusted Publisher on npmjs.com**:
   - Go to `npmjs.com` → `@arcadeai/create-agent` → **Settings** → **Publishing access**
   - Add Trusted Publisher → GitHub Actions:
     - Owner: `ArcadeAI`
     - Repository: `create-arcade-agent`
     - Workflow filename: `release.yml`
     - Environment: `npm`

3. **Create a GitHub Environment** (optional, adds an approval gate):
   - Repo Settings → Environments → New environment → name it `npm`
   - Add required reviewers if desired

### How to release a new version

```bash
# 1. Make sure you're on main and it's clean
git checkout main && git pull

# 2. Bump the version in package.json (pick one)
npm version patch   # 0.1.0 → 0.1.1  (bug fixes)
npm version minor   # 0.1.0 → 0.2.0  (new features)
npm version major   # 0.1.0 → 1.0.0  (breaking changes)

# 3. Push the commit AND the tag
git push origin main --follow-tags
```

That's it. Pushing the `v*` tag fires the release workflow, which:

1. Builds the CLI (`npm run build`)
2. Publishes to npm with provenance (`npm publish --provenance --access public`)
3. Uses OIDC-based auth (no NPM_TOKEN secret required after Trusted Publishers is configured)

### Verifying a release

After the workflow completes:

- Check the Actions tab to confirm the publish job succeeded
- Run `npm view @arcadeai/create-agent version` to confirm the new version is live
- Run `npm audit signatures` to verify the provenance attestation
