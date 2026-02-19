# TODO

## v2 Roadmap — Must-Have 🔴

### Messaging Channels
- [x] **Telegram bot** — webhook → Cloud Run endpoint, bidirectional messaging with all LifeOS agents
  - [x] Create Telegram bot via @BotFather
  - [x] New package: `channel-telegram` (TypeScript, Cloud Run, grammY)
  - [x] Webhook receiver for incoming messages
  - [x] Route messages to appropriate agent (briefing, research, general)
  - [x] Send proactive notifications (daily briefing, meeting reminders, action items)
  - [x] Support inline commands: `/briefing`, `/tasks`, `/schedule`, `/research <topic>`
  - [x] Rich formatting (Markdown → Telegram HTML)
  - [x] File/document sending via shared `sendTelegramDocument()`
  - [x] Claude AI chat with full tool parity (29 tools — all MCP + agent tools)
  - [x] Deploy to Cloud Run and set webhook
  - [x] Test end-to-end with real bot token
### Vault Semantic Search
- [ ] Add vector embeddings to `mcp-obsidian` server
  - [ ] Evaluate embedding providers: Voyage AI (Anthropic partner), OpenAI, Cohere
  - [ ] Index vault notes into vector store on sync
  - [ ] New MCP tool: `search_vault_semantic` — conceptual search alongside keyword search
  - [ ] Incremental re-indexing (only changed files since last sync)
  - [ ] Store embeddings in Cloud Storage or Firestore (persist across cold starts)

### Documentation & Community
- [x] **README.md** — compelling narrative rewrite with cost transparency, competitive comparison
- [ ] Architecture diagram (Mermaid or SVG) showing Cloud Run services, MCP flow, agent pipelines
- [x] **CLAUDE.md** — build commands, conventions, project context for Claude Code
- [x] **AGENTS.md** — each background agent's purpose, triggers, and configuration
- [x] **CONTRIBUTING.md** — how to add new tools, agents, channels + bot enforcement
- [ ] Screenshots / demo GIF of Claude.ai using LifeOS MCP tools
- [ ] Landing page (GitHub Pages or simple site)

---

## v2 Roadmap — Should-Have 🟡

### Granola Automation
- [ ] **n8n self-hosted on Cloud Run** — free, open-source webhook relay replacing Zapier
  - [ ] Deploy n8n container to Cloud Run
  - [ ] Configure Granola → n8n → `agent-granola` /process endpoint
  - [ ] Automatic meeting processing without manual trigger
- [ ] Evaluate Make.com free tier as alternative (1,000 ops/month)
- [ ] Polling via Granola Enterprise API (GET /v1/notes) — if Enterprise plan available
- [ ] Monitor Granola roadmap for native webhook support

### OpenClaw Integration
- [ ] Build LifeOS skill for OpenClaw's ClawHub marketplace
  - [ ] Expose vault read/write, calendar, email, tasks via OpenClaw skill format
  - [ ] Let OpenClaw users leverage LifeOS's structured multi-account routing
  - [ ] Document as cross-project integration example

### Multi-Model Fallback
- [ ] Abstract Claude dependency in agent packages
  - [ ] Agent config: `model: "claude-sonnet-4-20250514"` with fallback chain
  - [ ] Support Gemini 2.5 Pro as first fallback
  - [ ] Support GPT-4.1 as second fallback
  - [ ] Graceful degradation (some features may lose quality on non-Claude models)

### Additional Meeting Sources
- [ ] Support [Otter.ai](https://otter.ai) transcripts (webhook or API)
- [ ] Support [Fireflies.ai](https://fireflies.ai) meeting notes
- [ ] Support [Fathom](https://fathom.video) recordings
- [ ] Support [tl;dv](https://tldv.io) transcripts
- [ ] Support [Recall.ai](https://recall.ai) universal meeting bot API
- [ ] Abstract meeting ingestion into a shared interface so new sources are plug-and-play

---

## v3+ Roadmap — Nice-to-Have 🟢

### LifeOS as Framework
- [ ] Generalize multi-account config so others can fork + configure for their own life
- [ ] Template vault structure (PARA system, daily notes, project templates)
- [ ] One-command setup: `npx create-lifeos` → guided config → deploy
- [ ] Separate "core" from "personal" configuration

### Event-Driven Triggers
- [ ] Gmail push notifications (Google Pub/Sub) → instant email processing
- [ ] Calendar change webhooks → conflict detection + auto-suggest resolution
- [ ] VIP sender list → immediate notification on high-priority emails
- [ ] Task deadline approaching → proactive reminder via Telegram

### Team Mode
- [ ] Shared vault sections (read-only for collaborators)
- [ ] Coordinated calendars across team members
- [ ] Delegated tasks with status tracking
- [ ] Team briefing agent (aggregates across multiple vaults)

### Voice Interaction
- [ ] ElevenLabs or similar TTS for briefing audio delivery
- [ ] Speech-to-text for voice commands via Telegram voice messages
- [ ] Wake word on companion devices

### Platform Expansion
- [ ] Microsoft 365 / Outlook support
- [ ] Slack integration (workspace channel)
- [ ] Notion as alternative vault backend
- [ ] Local/offline fallback mode (local LLM + SQLite)
- [ ] Alternative hosting (Fly.io, Railway, self-hosted Docker)
- [ ] iOS/Android companion app (or PWA)

---

## Operational — Ongoing

### Tests
- [ ] Unit tests for `shared/config.ts` (account routing, project detection, draft/calendar resolution)
- [ ] Unit tests for `shared/contacts.ts` (contact search, email lookup, source priority)
- [ ] Unit tests for `shared/vault.ts` (file path construction, frontmatter parsing)
- [ ] Integration tests for MCP tool handlers (mock Google/GitHub APIs)
- [ ] Agent pipeline tests (mock Anthropic API, verify vault writes)
- [ ] Add test runner (vitest) and CI config (GitHub Actions)

### Google Accounts
- [ ] OAuth for Node account (account-3@example.com)
- [ ] OAuth for Vivo account (account-2@example.com) — try full OAuth, IMAP fallback
- [ ] OAuth for TailHQ account (account-1@example.com)

### Infrastructure
- [ ] Dockerfiles for all services (local development parity)
- [ ] GitHub Actions CI/CD (lint, test, build, deploy on push to main)
- [ ] Monitoring / alerting for agent failures (Cloud Logging → notification)
- [ ] Cost tracking dashboard (Claude API usage per agent)

---

## Completed ✅

- [x] Planning & design (3 sessions, all 9 open questions resolved)
- [x] Complete scenario catalog (63 scenarios across 9 categories)
- [x] Implementation spec written (CLAUDE-CODE-SPEC.md — 2,380 lines)
- [x] Claude Code built full system (7 TypeScript packages)
- [x] GCP project setup (APIs, OAuth credentials)
- [x] GitHub PAT for vault access
- [x] Google account OAuth (personal account)
- [x] Deploy all 7 services to Cloud Run (europe-west1)
- [x] Connect MCP Obsidian and MCP Google to Claude.ai
- [x] Cloud Scheduler jobs (8 cron jobs — all enabled)
- [x] DX improvements (setup wizard, preflight, status, auth auto-write, deploy enhancements)
- [x] Competitive analysis — OpenClaw, Khoj, Leon, COG, Obsidian Copilot, MCP ecosystem
- [x] Fix port conflict — removed global `PORT=3000`, each service uses own default (3001–3007)
- [x] Fix deploy script — `--env-vars-file` for JSON-safe env vars
- [x] Fix deploy script — copy per-package Dockerfile to root for `gcloud run deploy --source`
- [x] Fix deploy script — support concurrent deploys via temp source directories
- [x] Fix deploy script — source `.env` for GCP config variables
- [x] Remove stale `@ts-expect-error` directives (MCP SDK update)
- [x] Fix MCP server connection reuse bug — fresh McpServer per request (stateless Cloud Run)
- [x] Add root `/` endpoint to MCP servers (Claude.ai sends to `/`, not `/mcp`)
- [x] Google OAuth token refresh and redeploy
- [x] Update `.env.example` to remove `PORT=3000`
- [x] Account management CLI (`npm run add-account/remove-account/list-accounts`)
- [x] Vault restructure — folder-per-project migration + ongoing reorg CLI (`npm run vault`)
- [x] Vault structure guide documentation
- [x] PR template + bot-guard GitHub Action
- [x] Fix TS2589 deep type instantiation in MCP server.tool() calls
- [x] Git history scrub — redacted personal emails from all commits via `git-filter-repo`
- [x] Vault restructure — moved Projects under Areas, removed Inbox
- [x] Telegram bot package (`channel-telegram`) — grammY, commands, Claude AI chat, reminders
- [x] Shared `sendTelegramMessage()` / `sendTelegramDocument()` utilities
- [x] Agent-briefing Telegram notification integration
- [x] Telegram bot deployed to Cloud Run with webhook
- [x] Full tool parity in Telegram bot — 29 tools (all 27 MCP + 2 agent tools)
- [x] Telegram setup documentation in README and setup guide
