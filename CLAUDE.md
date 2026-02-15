# LifeOS — Claude Code Instructions

You are helping set up or develop LifeOS, a personal OS powered by Claude AI.

## Setup

If the user is setting up LifeOS for the first time, read `docs/setup-guide.md` for the full setup flow. Walk them through it conversationally — ask questions, validate each step, and adapt to their environment.

For vault structure customization, read `docs/vault-structure-guide.md`. Ask the user about their workflow and generate a personalized config.

## Architecture

- 7-package TypeScript monorepo (`packages/`)
- Two MCP servers (obsidian, google) connected to Claude.ai
- Five background agents (sync, granola, briefing, drive-org, research)
- All deployed to Google Cloud Run (scale-to-zero)
- Vault stored in a private GitHub repo, accessed via GitHub API

## Key Conventions

- Each service has its own default port (3001–3007) — never set global `PORT` in `.env`
- MCP servers must handle requests at both `/` and `/mcp` (Claude.ai sends to `/`)
- Each Cloud Run request needs a fresh `McpServer` instance (stateless)
- Vault uses folder-per-project structure: `Projects/{Category}/{slug}/README.md`
- Config is via environment variables (see `.env.example`)

## Vault Structure

```
Projects/{Category}/{slug}/     ← project folders with README.md
  README.md                     ← main project note
  meeting-notes.md              ← meeting log
  files/                        ← project attachments
Inbox/{contact}/{sent|received}/ ← email attachments by contact
Files/Meetings/                 ← transcripts and summaries
Files/Research/                 ← research reports
Files/Reports/                  ← generated reports
Daily/                          ← daily notes
Areas/                          ← ongoing responsibilities
Templates/                      ← note templates
```

## Commands

```bash
npm run setup      # Interactive setup wizard
npm run auth       # Google OAuth authorization
npm run build      # Build all packages
npm run deploy     # Deploy to Cloud Run
npm run status     # Check service health
npm run preflight  # Validate configuration
```
