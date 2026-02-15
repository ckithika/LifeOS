# LifeOS

> An open-source personal operating system powered by Claude AI.

LifeOS connects your Obsidian vault, Gmail, Google Calendar, Tasks, Drive, and Granola meeting notes into a unified system that Claude can read, write, and act on — across multiple Google accounts, with background agents that sync, organize, and brief you autonomously.

## Why

Most productivity tools don't talk to each other. Your meeting notes live in one app, tasks in another, emails in a third, and files scattered across Drive accounts. LifeOS fixes this by giving Claude structured access to everything through MCP servers, so you can say things like:

- *"What's on my plate today?"* → calendar + tasks + emails + meeting follow-ups
- *"Summarize my meeting with Kevin and draft a follow-up"* → pulls Granola transcript, writes summary, creates Gmail draft
- *"Is this business idea viable?"* → deep research with market sizing, competitive analysis, and a go/no-go verdict
- *"Create a project for the new product launch"* → vault note + file directory + Claude Project prompt + dashboard entry

## Architecture

```
Claude.ai ──MCP──▶ mcp-obsidian (vault via GitHub)
           ──MCP──▶ mcp-google (Gmail, Calendar, Tasks, Drive, Contacts × N accounts)

Background:
  agent-granola     Manual trigger or future webhook → process meeting notes
  agent-sync        3x daily → sync all Google data to vault
  agent-drive-org   Daily → classify & organize Drive files
  agent-briefing    6:30am → generate daily briefing note
  agent-research    On demand → deep research reports
```

All services run on Google Cloud Run with scale-to-zero ($0 infrastructure).

## Project Structure

```
lifeos/
├── packages/
│   ├── shared/              # Google auth, vault access, contacts, config
│   ├── mcp-obsidian/        # MCP server: Obsidian vault via GitHub (7 tools)
│   ├── mcp-google/          # MCP server: multi-account Google access (16 tools)
│   ├── agent-granola/       # Post-meeting automation pipeline
│   ├── agent-sync/          # Background sync (Gmail, Calendar, Tasks, Files)
│   ├── agent-drive-org/     # Drive cleanup & organization
│   ├── agent-briefing/      # Daily briefing generator
│   └── agent-research/      # Deep research on demand
├── templates/               # Starter vault & Claude Project prompts
├── scripts/                 # Setup, deploy, auth helpers
├── docs/                    # Architecture, setup guide, scenarios
└── infrastructure/          # Cloud Run & Scheduler config
```

## Quick Start

```bash
git clone https://github.com/ckithika/lifeos.git
cd lifeos
npm install
cp .env.example .env
# Fill in your credentials (see docs/setup-guide.md)
npm run auth         # Authorize your Google account(s)
npm run build        # Build all packages
npm run deploy       # Deploy all services to Cloud Run
```

### Local Development

```bash
npm run dev:obsidian # Start Obsidian MCP server (port 3001)
npm run dev:google   # Start Google MCP server (port 3002)
```

Each service has its own default port (3001–3007). Do not set a global `PORT` in `.env`.

## Requirements

- Node.js 20+
- A Google Cloud project with APIs enabled
- One or more Google accounts
- A GitHub account (for vault sync)
- An Anthropic API key (for background agents)
- [Granola](https://granola.ai) (optional, for meeting automation — no webhook support yet, use manual trigger)
- [Obsidian](https://obsidian.md) with obsidian-git plugin (for local vault access)

## What You Can Do

### Ask Claude anything about your day
- *"What's on my plate today?"* — pulls calendar, tasks, emails, and meeting follow-ups
- *"Am I free tomorrow at 2pm?"* — checks freebusy across accounts
- *"Search my emails for the invoice from Acme"* — searches Gmail
- *"What tasks do I have open?"* — lists Google Tasks

### Manage projects through conversation
- *"Create a project for the new product launch"* — vault note + files directory + dashboard entry
- *"What's the status on ESP?"* — reads project note, tasks, and recent emails
- *"List my active projects"* — pulls from vault
- *"Find the contract in my Drive"* — searches across Drive accounts

### Process meetings (via Granola)
- *"Process my last meeting"* — saves transcript + summary to vault, extracts tasks, drafts recap email, detects scheduling requests, adds suggested actions to daily note

### Schedule and communicate
- *"Schedule a meeting with Kevin next Tuesday"* — checks freebusy, looks up contact, creates invite
- *"Draft a follow-up email to the team"* — pulls meeting context, creates Gmail draft
- *"Find Sarah's email"* — unified contact lookup across accounts

### Research on demand
- *"Is this business idea viable?"* — deep research with market sizing, competitive analysis, go/no-go verdict
- *"Compare Fly.io vs Railway vs Cloud Run"* — technology evaluation
- *"What do we know about Acme Corp?"* — company background research

### Automated background work
- **Daily briefing** (6:30am) — calendar, tasks, emails, follow-ups compiled into a daily note
- **Data sync** (3x daily) — Gmail, Calendar, Tasks synced to vault as searchable Markdown
- **File sync** (3x daily) — Drive files indexed and linked in vault
- **Drive organizer** (daily) — AI classifies and organizes files into project folders

### Works everywhere
- Claude.ai (desktop and mobile), voice mode, Claude Projects — all use the same MCP tools

## How It Works

**MCP Servers** give Claude direct access to your vault and Google accounts. When you chat with Claude in claude.ai, it can read your project notes, search emails, check your calendar, and create tasks — all through natural conversation.

**Background Agents** run on schedules without your involvement. They sync your data, organize Drive files, generate daily briefings, and process meeting notes. High-risk actions (sending emails, creating invites) are queued in your daily note for approval.

**Your Obsidian vault** is the single source of truth. Everything flows through it: meeting notes, email summaries, task lists, file links, daily briefings, and suggested actions. It syncs to GitHub so Claude can access it from anywhere.

### 23 MCP Tools

| Tool | What it does |
|------|-------------|
| `read_note` | Read any file from the Obsidian vault |
| `write_note` | Create or update vault files |
| `search_vault` | Full-text search across the vault |
| `list_projects` | List all projects with status |
| `create_project` | Create project with note, files, dashboard entry |
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

## Contributing

Contributions welcome! See [docs/architecture.md](docs/architecture.md) for the system design.

Areas where help is especially welcome:
- Additional MCP tools
- Alternative vault backends (beyond GitHub)
- Alternative hosting (beyond Cloud Run)
- Microsoft 365 / Outlook support
- Slack integration
- Additional meeting capture sources (beyond Granola)

## License

MIT — see [LICENSE](LICENSE).
