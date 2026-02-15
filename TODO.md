# TODO

## Tests
- [ ] Unit tests for `shared/config.ts` (account routing, project detection, draft/calendar resolution)
- [ ] Unit tests for `shared/contacts.ts` (contact search, email lookup, source priority)
- [ ] Unit tests for `shared/vault.ts` (file path construction, frontmatter parsing)
- [ ] Integration tests for MCP tool handlers (mock Google/GitHub APIs)
- [ ] Agent pipeline tests (mock Anthropic API, verify vault writes)
- [ ] Add test runner (vitest or jest) and CI config

## Granola Webhook Alternatives
- [ ] Implement polling-based Granola ingestion (GET /v1/notes) when Enterprise API available
- [ ] Evaluate Make.com free tier as Zapier alternative (1,000 ops/month)
- [ ] Evaluate n8n self-hosted on Cloud Run as free webhook relay
- [ ] Monitor Granola roadmap for native webhook support

## CLAUDE.md / agents.md
- [ ] Add `CLAUDE.md` with build commands, conventions, and project context for Claude Code
- [ ] Add `agents.md` documenting each background agent's purpose, triggers, and configuration

## Meeting Sources
- [ ] Support [Otter.ai](https://otter.ai) transcripts (webhook or API)
- [ ] Support [Fireflies.ai](https://fireflies.ai) meeting notes
- [ ] Support [Fathom](https://fathom.video) recordings
- [ ] Support [tl;dv](https://tldv.io) transcripts
- [ ] Support [Recall.ai](https://recall.ai) universal meeting bot API
- [ ] Abstract meeting ingestion into a shared interface so new sources are plug-and-play

## Completed
- [x] Fix port conflict — removed global `PORT=3000` from `.env`, each service uses its own default (3001–3007)
- [x] Fix deploy script — switch from `--set-env-vars` to `--env-vars-file` for JSON-safe env vars
- [x] Fix deploy script — copy per-package Dockerfile to root for `gcloud run deploy --source`
- [x] Fix deploy script — support concurrent deploys via temp source directories
- [x] Fix deploy script — source `.env` for GCP config variables
- [x] Remove stale `@ts-expect-error` directives across all packages (MCP SDK update made them unnecessary)
- [x] Fix MCP server connection reuse bug — create fresh McpServer per request for stateless Cloud Run
- [x] Add root `/` endpoint to MCP servers (Claude.ai sends requests to `/`, not `/mcp`)
- [x] Deploy all 7 services to Cloud Run (europe-west1)
- [x] Connect MCP Obsidian and MCP Google to Claude.ai
- [x] Google OAuth token refresh and redeploy
- [x] Update `.env.example` to remove `PORT=3000`

## Future
- [ ] Microsoft 365 / Outlook support
- [ ] Slack integration
- [ ] Alternative vault backends (S3, local filesystem)
- [ ] Alternative hosting (Fly.io, Railway, self-hosted Docker)
- [ ] Dockerfiles for all services
