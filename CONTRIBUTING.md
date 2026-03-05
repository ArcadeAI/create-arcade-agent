# Contributing to create-arcade-agent

## Development setup

```bash
git clone <repo-url>
cd create-arcade-agent
npm install
```

## Scripts

| Command                | Description                                  |
| ---------------------- | -------------------------------------------- |
| `npm run build`        | Compile TypeScript CLI to `dist/`            |
| `npm run dev`          | Watch mode (`tsc --watch`)                   |
| `npm run lint`         | ESLint check (`src/` + `templates/` TS)      |
| `npm run lint:fix`     | ESLint auto-fix                              |
| `npm run format`       | Prettier format all files                    |
| `npm run format:check` | Prettier check (CI mode)                     |
| `npm run typecheck`    | Type check without emitting (`tsc --noEmit`) |

## Linting & formatting

- **TypeScript/JS** -- [ESLint](https://eslint.org/) v9 (flat config) + [Prettier](https://prettier.io/). Covers `src/` (CLI source) and `templates/` (TS/JS template files). Config: `eslint.config.mjs`, `.prettierrc`.
- **Python** -- [Ruff](https://docs.astral.sh/ruff/) for `templates/langchain/`. Config: `templates/langchain/ruff.toml`. Run with `ruff check templates/langchain/` and `ruff format templates/langchain/`.
- **Ignored** -- `dist/`, `templates/_shared/nextjs-ui/` (has its own ESLint config for generated projects), `.hbs` files, and `*.lock` files are excluded from linting/formatting.

Always run `npm run lint` and `npm run format:check` before committing.

## CI

GitHub Actions runs on PRs to `main` and pushes to `main`:

1. **lint-and-build** -- ESLint + Prettier + typecheck + build (Node 22)
2. **lint-python** -- Ruff lint + format check on Python templates
3. **smoke-test-templates** -- Scaffolds each template and verifies the generated project builds and lints

## Testing locally

```bash
# Build the CLI
npm run build

# Scaffold a template
node dist/index.js test-project --template ai-sdk

# Verify the generated project
cd test-project
cp .env.example .env
bun run build
bun run lint
```

## What happens during scaffolding

1. Template files are copied to a new directory named after your project
2. Handlebars templates (`.hbs` files) are rendered with your project name and template config
3. Dependencies are installed (`npm install` for TypeScript, `python3 -m venv` + `pip install` for Python)
4. Database migrations run automatically (Drizzle Kit for TypeScript, Alembic for Python)

## Releasing a new version

> Releases are automatic — bump the version in `package.json`, merge to `main`, and the workflow handles the rest.

1. Bump `version` in `package.json` on your branch (patch / minor / major)
2. Merge the PR to `main`

The release workflow (`.github/workflows/release.yml`) automatically:

1. Creates a `v*` git tag
2. Builds the CLI and publishes to npm with provenance
3. Creates a GitHub Release with auto-generated notes

**Verify:**

```bash
npm view @arcadeai/create-agent version   # confirm version is live
npm audit signatures                      # verify provenance attestation
```

## One-time setup (before first release)

Before the workflow can publish, the package must exist on npm and npm Trusted Publishers must be configured.

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
