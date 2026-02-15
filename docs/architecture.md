# LifeOS Architecture

## Overview

LifeOS is built as a TypeScript monorepo with two MCP (Model Context Protocol) servers and five background agents, all deployed to Google Cloud Run.

```
┌─────────────────────────────────────────────────────┐
│                    Claude.ai                         │
│            (Claude Projects / Chat)                  │
└──────────┬──────────────────┬───────────────────────┘
           │ MCP              │ MCP
           ▼                  ▼
┌──────────────────┐ ┌──────────────────────────────┐
│  mcp-obsidian    │ │      mcp-google              │
│  (GitHub API)    │ │  (Gmail, Calendar, Tasks,    │
│                  │ │   Drive, Contacts × N accts) │
│  7 tools         │ │  16 tools                    │
└──────────────────┘ └──────────────────────────────┘
           │                  │
           ▼                  ▼
┌──────────────────┐ ┌──────────────────────────────┐
│  Obsidian Vault  │ │     Google Workspace         │
│  (GitHub repo)   │ │  (multiple accounts)         │
└──────────────────┘ └──────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              Background Agents (Cloud Run)            │
│                                                       │
│  ┌─────────┐ ┌──────┐ ┌───────┐ ┌────────┐ ┌──────┐│
│  │ Granola │ │ Sync │ │ Drive │ │Briefing│ │Rsrch ││
│  │ Agent   │ │Agent │ │Organiz│ │ Agent  │ │Agent ││
│  └────┬────┘ └──┬───┘ └───┬───┘ └───┬────┘ └──┬───┘│
│       │         │         │         │          │     │
│  Zapier      Scheduler  Scheduler  Scheduler  HTTP  │
│  webhook     (3x/day)   (daily)   (6:30am)  (demand)│
└─────────────────────────────────────────────────────┘
```

## Design Principles

1. **Vault as source of truth.** Everything flows through the Obsidian vault (stored on GitHub). Emails, meetings, tasks, and files all get indexed in the vault as Markdown.

2. **Multi-account by default.** Every Google integration supports N accounts. Routing logic determines which account to use based on project context.

3. **Risk-based action classification.** Low-risk actions (create tasks, update notes) execute automatically. High-risk actions (send emails, create calendar invites) queue for human approval.

4. **Scale to zero.** All services run on Cloud Run with `minInstances=0`. No traffic = no cost. Cold starts (1-3s) are acceptable for the use cases.

5. **MCP-native.** The two core servers speak the MCP protocol, so they work directly with Claude.ai, Claude Desktop, or any MCP-compatible client.

## Package Dependencies

```
@lifeos/shared ──────────────────────────────────────────┐
  ├── google-auth.ts    Multi-account OAuth2 manager     │
  ├── vault.ts          GitHub API vault operations       │
  ├── contacts.ts       Unified contact lookup            │
  ├── config.ts         Account routing, action rules     │
  └── types.ts          Shared TypeScript interfaces      │
                                                          │
@lifeos/mcp-obsidian ← shared                            │
  └── 7 tools: read, write, search, projects, files      │
                                                          │
@lifeos/mcp-google ← shared                              │
  └── 16 tools: gmail(4), calendar(3), tasks(3),         │
      drive(4), contacts(2)                               │
                                                          │
@lifeos/agent-granola ← shared + @anthropic-ai/sdk       │
  └── Meeting pipeline: transcript → summary →            │
      tasks → email draft → suggestions                   │
                                                          │
@lifeos/agent-sync ← shared                              │
  └── Background: Gmail/Calendar/Tasks/Files sync         │
                                                          │
@lifeos/agent-briefing ← shared                          │
  └── Daily briefing generation                           │
                                                          │
@lifeos/agent-drive-org ← shared + @anthropic-ai/sdk     │
  └── Drive file classification and organization          │
                                                          │
@lifeos/agent-research ← shared + @anthropic-ai/sdk      │
  └── Deep research with web search                       │
```

## Data Flow

### Meeting → Vault (Granola Agent)

```
Granola → Zapier webhook → agent-granola
  │
  ├── Save transcript → GitHub (vault)
  ├── Save summary → GitHub (vault)
  ├── AI extract tasks → Google Tasks API
  ├── AI draft recap → Gmail Drafts API
  ├── Detect scheduling → Suggested actions
  └── Generate suggestions → Daily note (vault)
```

### Background Sync (Sync Agent)

```
Cloud Scheduler (3x/day) → agent-sync
  │
  ├── Scan Gmail → Count unread per account
  ├── Scan Calendar → Upcoming events per account
  ├── Scan Tasks → Active tasks per account
  ├── Scan Drive → Recently modified files
  │     └── Download text files → vault
  ├── Scan Gmail attachments → vault
  └── Update sync-log.md → vault
```

### Daily Briefing (Briefing Agent)

```
Cloud Scheduler (6:30am EAT) → agent-briefing
  │
  ├── Read Calendar → Today's events (all accounts)
  ├── Read Tasks → Active tasks (all accounts)
  ├── Read Gmail → Unread counts (all accounts)
  ├── Check sent emails → Unanswered follow-ups
  ├── Read vault → Active projects
  └── Write Daily/{date}.md → vault
```

## Authentication

### Google OAuth2

All Google API access uses OAuth2 with refresh tokens. The shared `google-auth.ts` module:

1. Reads `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from environment
2. For each account, reads `GOOGLE_TOKEN_{ALIAS}` refresh token
3. Creates an `OAuth2Client` with auto-refresh
4. Caches clients in memory

### GitHub

The vault is accessed via GitHub's REST API using a fine-grained Personal Access Token (PAT) with `Contents: Read and Write` scope on the vault repository only.

### API Keys

Background agents that call Claude use `ANTHROPIC_API_KEY` for AI operations (action extraction, file classification, email drafting, research).

## Deployment

All 7 services deploy as separate Cloud Run services from the same monorepo. Each service has its own Dockerfile that:

1. Copies shared + service-specific packages
2. Builds TypeScript
3. Creates a minimal production image
4. Runs on port 8080

Cloud Scheduler triggers the background agents on schedule. Zapier triggers the Granola agent via webhook.

## Security

- All secrets stored in GCP Secret Manager (production) or `.env` (development)
- MCP servers require authentication headers from Claude.ai
- Webhook endpoint validates `ZAPIER_WEBHOOK_SECRET`
- No credentials are stored in code or committed to git
- `.gitignore` blocks all token files, `.env`, and `client_secret*.json`
