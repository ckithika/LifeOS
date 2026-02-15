# LifeOS — AI Agent Instructions

You are helping set up or develop LifeOS, a personal OS powered by AI.

## Setup

Read `docs/setup-guide.md` for the full setup flow. Walk the user through it conversationally.
For vault customization, read `docs/vault-structure-guide.md`.

## Architecture

- 7-package TypeScript monorepo (`packages/`)
- Two MCP servers (obsidian, google) + five background agents
- All deployed to Google Cloud Run (scale-to-zero)
- Vault in private GitHub repo, accessed via GitHub API

## Key Conventions

- Each service has its own default port (3001–3007) — never set global `PORT` in `.env`
- Vault uses folder-per-project: `Projects/{Category}/{slug}/README.md`
- Config is via environment variables (see `.env.example`)

## Commands

```bash
npm run setup      # Interactive setup wizard
npm run auth       # Google OAuth authorization
npm run build      # Build all packages
npm run deploy     # Deploy to Cloud Run
```
