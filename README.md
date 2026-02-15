# LifeOS

**Your life, one conversation away.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/node-20%2B-green.svg)](https://nodejs.org)
[![Deploy: Cloud Run](https://img.shields.io/badge/deploy-Cloud%20Run-4285F4.svg)](https://cloud.google.com/run)

## The Problem

Your life runs on a dozen disconnected tools. Meeting notes in Granola, tasks in Google Tasks, emails across multiple Gmail accounts, files scattered across Drive, and project notes in Obsidian. No single tool sees the full picture.

AI assistants are powerful — but they can't access *your* data. They can't check your calendar, search your emails, read your project notes, or draft a follow-up from this morning's meeting. You're the middleware, copy-pasting context between tools and AI.

LifeOS fixes this.

## What It Looks Like

> **6:30am** — A daily briefing appears in your vault: today's calendar, open tasks, emails needing replies, and follow-ups from yesterday's meetings.
>
> **9:00am** — *"What's the status on the ESP project?"* — Claude reads your project note, checks recent emails, lists open tasks, and gives you a summary.
>
> **2:00pm** — *"Process my last meeting"* — Claude pulls the Granola transcript, writes a summary to your vault, extracts action items as tasks, and drafts a recap email.
>
> **5:00pm** — *"Is this business idea viable?"* — Claude runs deep research: market sizing, competitive analysis, and delivers a structured report with a go/no-go verdict.

All through conversation. All in Claude.ai — desktop, mobile, or voice.

## Perfect For

- **Founders and consultants** juggling multiple projects across multiple Google accounts — LifeOS routes emails, calendars, and files to the right project automatically
- **Obsidian power users** who want their vault to be a living system, not a static archive — synced with email, calendar, and meeting notes
- **MCP developers** looking for a real-world multi-tool, multi-account MCP implementation to learn from or extend
- **Anyone drowning in tool fragmentation** who wants one conversation interface for their entire digital life

## Get Running

```bash
git clone https://github.com/ckithika/lifeos.git
cd lifeos
npm install
npm run setup       # Interactive wizard walks you through everything
```

The setup wizard handles Google OAuth, vault configuration, and deployment. Budget **30-45 minutes** for first-time setup (most of that is Google Cloud project creation).

For manual setup or troubleshooting, see [docs/setup-guide.md](docs/setup-guide.md).

## What You Can Do

**Ask about your day**
- *"What's on my plate today?"* — calendar + tasks + emails + meeting follow-ups
- *"Am I free tomorrow at 2pm?"* — checks availability across accounts
- *"Search my emails for the invoice from Acme"* — searches Gmail across accounts

**Manage projects through conversation**
- *"Create a project for the new product launch"* — vault folder + README + meeting notes + dashboard entry
- *"What's the status on ESP?"* — reads project note, tasks, recent emails
- *"Find the contract in my Drive"* — searches across all Drive accounts

**Process meetings**
- *"Process my last meeting"* — transcript + summary + tasks + recap email draft + scheduling detection

**Schedule and communicate**
- *"Schedule a meeting with Kevin next Tuesday"* — checks freebusy, finds contact, creates invite
- *"Draft a follow-up email to the team"* — pulls meeting context, creates Gmail draft

**Research on demand**
- *"Is this business idea viable?"* — market sizing, competitive analysis, go/no-go verdict
- *"Compare Fly.io vs Railway vs Cloud Run"* — structured technology evaluation

**Automated background work**
- Daily briefing (6:30am) — calendar, tasks, emails, follow-ups compiled into a daily note
- Data sync (3x daily) — Gmail, Calendar, Tasks synced to vault as searchable Markdown
- Drive organizer (daily) — AI classifies and organizes files into project folders

## How It Works

**MCP Servers** give Claude direct access to your vault and Google accounts. When you chat in Claude.ai, it can read project notes, search emails, check your calendar, create tasks — all through natural conversation.

**Background Agents** run on Cloud Run schedules. They sync data, organize files, generate briefings, and process meetings. High-risk actions (sending emails, creating invites) are queued in your daily note for approval.

**Your Obsidian vault** is the single source of truth. Everything flows through it — meeting notes, email summaries, task lists, file links, daily briefings. It syncs to GitHub so Claude can access it from anywhere.

**Works everywhere** — Claude.ai desktop, mobile, voice mode, and Claude Projects all use the same MCP tools.

## What It Costs

| Component | Monthly Cost |
|-----------|-------------|
| Cloud Run (7 services, scale-to-zero) | $0 |
| Cloud Scheduler (8 cron jobs) | $0 |
| Claude Pro subscription | $20 |
| Anthropic API (background agents) | ~$2-5 |
| **Total** | **~$22-25/mo** |

No surprise bills. Cloud Run's free tier covers LifeOS usage comfortably. The API cost depends on how actively your background agents run.

## How LifeOS Compares

| Feature | LifeOS | [Khoj](https://khoj.dev) | [COG](https://github.com/cog-ai) | [OpenClaw](https://openclaw.com) |
|---------|--------|------|-----|----------|
| Multi-account Google | Yes (N accounts) | No | No | No |
| Obsidian vault integration | Yes (GitHub API) | Yes (local) | No | No |
| Meeting processing | Yes (Granola) | No | No | No |
| Background agents | Yes (5 agents) | Limited | Yes | No |
| MCP native | Yes | No | No | Yes |
| Self-hosted | Yes (Cloud Run) | Yes | Yes | Cloud |
| Open source | Yes (MIT) | Partial | Yes | No |
| Cost | ~$22/mo | Free-$10/mo | Free | Free-$20/mo |

**Honest positioning:** If you just need AI search over your notes, Khoj is simpler. If you want a marketplace of AI skills, OpenClaw is broader. If you want one system that connects your vault, email, calendar, tasks, meetings, and files across multiple accounts with autonomous agents — that's LifeOS.

<details>
<summary><strong>Architecture</strong></summary>

```
Claude.ai ──MCP──> mcp-obsidian (vault via GitHub)
           ──MCP──> mcp-google (Gmail, Calendar, Tasks, Drive, Contacts x N accounts)

Background:
  agent-granola     Manual trigger or future webhook -> process meeting notes
  agent-sync        3x daily -> sync all Google data to vault
  agent-drive-org   Daily -> classify & organize Drive files
  agent-briefing    6:30am -> generate daily briefing note
  agent-research    On demand -> deep research reports
```

### 23 MCP Tools

| Tool | What it does |
|------|-------------|
| `read_note` | Read any file from the Obsidian vault |
| `write_note` | Create or update vault files |
| `search_vault` | Full-text search across the vault |
| `list_projects` | List all projects with status |
| `create_project` | Create project folder with README, meeting-notes, files, dashboard entry |
| `list_files` | Browse vault directory tree |
| `daily_note` | Read or append to today's daily note |
| `gmail_search` | Search emails across accounts |
| `gmail_read` | Read full email content |
| `gmail_draft` | Create email drafts |
| `gmail_attachments` | Download email attachments |
| `calendar_list` | List upcoming events |
| `calendar_create` | Create calendar events |
| `calendar_freebusy` | Check availability |
| `tasks_list` | List Google Tasks |
| `tasks_create` | Create tasks |
| `tasks_update` | Update task status |
| `drive_list` | List Drive files |
| `drive_download` | Download files from Drive |
| `drive_upload` | Upload files to Drive |
| `drive_organize` | Move/organize Drive files |
| `contacts_search` | Search contacts across accounts |
| `contacts_lookup` | Look up a specific person |

### Package Dependencies

```
shared (Google auth, vault access, contacts, config, project paths)
  <- mcp-obsidian (7 vault tools)
  <- mcp-google (16 Google tools)
  <- agent-granola (meeting pipeline)
  <- agent-sync (data sync)
  <- agent-drive-org (file organization)
  <- agent-briefing (daily briefing)
  <- agent-research (research reports)
```

</details>

<details>
<summary><strong>Project Structure</strong></summary>

```
lifeos/
├── packages/
│   ├── shared/              # Google auth, vault access, contacts, config, project paths
│   ├── mcp-obsidian/        # MCP server: Obsidian vault via GitHub (7 tools)
│   ├── mcp-google/          # MCP server: multi-account Google access (16 tools)
│   ├── agent-granola/       # Post-meeting automation pipeline
│   ├── agent-sync/          # Background sync (Gmail, Calendar, Tasks, Files)
│   ├── agent-drive-org/     # Drive cleanup & organization
│   ├── agent-briefing/      # Daily briefing generator
│   └── agent-research/      # Deep research on demand
├── scripts/                 # Setup, deploy, auth, account management, vault tools
├── docs/                    # Architecture, setup guide, vault structure guide
└── infrastructure/          # Cloud Run & Scheduler config
```

</details>

<details>
<summary><strong>Vault Structure</strong></summary>

The Obsidian vault uses a folder-per-project layout with configurable categories:

```
Projects/
├── Consulting/{slug}/       # Client consulting projects
│   ├── README.md            # Main project note (frontmatter tags)
│   ├── meeting-notes.md     # Chronological meeting log
│   └── files/               # Project attachments (synced from Drive/email)
├── SaaS/{slug}/             # SaaS products
├── Business/{slug}/         # Business operations
└── Archive/{slug}/          # Completed/inactive projects

Inbox/{contact-name}/        # Email attachments organized by contact
├── received/
└── sent/

Files/                       # System-generated files only
├── Meetings/                # Transcripts & summaries
├── Research/                # Research reports
└── Reports/                 # Generated reports

Daily/                       # Daily notes (YYYY-MM-DD.md)
Areas/                       # Ongoing responsibilities
Templates/                   # Note templates
```

Categories, subfolders, and tags are configurable via environment variables.
See [docs/vault-structure-guide.md](docs/vault-structure-guide.md) for customization.

</details>

## Roadmap

**In Progress**
- Account management CLI (`npm run add-account`) — interactive multi-provider setup
- Vault reorganization tooling — move projects, validate structure, archive

**Planned**
- Telegram bot — bidirectional messaging with all LifeOS agents
- WhatsApp integration — proactive notifications and conversational access
- Vault semantic search — vector embeddings for conceptual search alongside keyword search
- n8n self-hosted — free webhook relay replacing manual Granola triggers

**Future**
- Microsoft 365 / Outlook support
- Multi-model fallback (Gemini, GPT as alternatives)
- Event-driven triggers (Gmail push, calendar webhooks)
- `npx create-lifeos` — one-command setup for new users
- Slack, Notion, and additional meeting source integrations

See [TODO.md](TODO.md) for the full roadmap.

## Contributing

Contributions welcome! This is a solo project and I appreciate thoughtful help.

**Humans only.** Do not send AI-generated pull requests. I want contributions from people who understand what they're changing and why. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas where help is especially welcome:
- Additional MCP tools
- Alternative vault backends (beyond GitHub)
- Alternative hosting (beyond Cloud Run)
- Microsoft 365 / Outlook support
- Slack integration

## License

MIT — see [LICENSE](LICENSE).

Built by [Charles Kithika](https://github.com/ckithika).
