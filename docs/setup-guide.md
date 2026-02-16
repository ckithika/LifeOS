# LifeOS Setup Guide

> **For AI assistants:** This guide is the source of truth for walking users through LifeOS setup. Follow each step in order, validate before proceeding, and adapt to the user's environment. Works with Claude Code, Cursor, Codex, or any AI coding assistant.
>
> **For humans:** Run `npm run setup` for an interactive wizard, or follow these steps manually.

This guide walks you through setting up LifeOS from scratch. Total setup time: ~30-45 minutes.

## Prerequisites

You'll need the following installed before starting. If any are missing, follow the official install links below.

### Required

| Tool | Check | Install |
|------|-------|---------|
| **Homebrew** (macOS) | `brew --version` | [brew.sh](https://brew.sh) |
| **Node.js 20+** | `node --version` | [nodejs.org/en/download](https://nodejs.org/en/download) |
| **npm** | `npm --version` (included with Node.js) | Comes with Node.js |
| **Git** | `git --version` | [git-scm.com/downloads](https://git-scm.com/downloads) |
| **GitHub account** | — | [github.com/signup](https://github.com/signup) |
| **Google Cloud SDK** | `gcloud --version` | [cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install) |
| **Google account** | — | At least one Gmail or Google Workspace account |

### Optional

| Tool | What for | Install |
|------|----------|---------|
| **Gemini API key** | Free-tier AI for Telegram bot (1,500 req/day) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **Claude Pro** | MCP server connections via Claude.ai | [claude.ai/upgrade](https://claude.ai/upgrade) |
| **Obsidian** | Local vault viewing and editing | [obsidian.md/download](https://obsidian.md/download) |
| **Granola** | Meeting automation (transcript → tasks) | [granola.ai](https://granola.ai) |

> **macOS quickstart with Homebrew:**
> ```bash
> # Install Homebrew (if not installed)
> /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
>
> # Then install prerequisites
> brew install node git
> brew install --cask google-cloud-sdk
> ```
>
> **Windows:** Use the official installers linked above, or install via [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/):
> ```powershell
> winget install OpenJS.NodeJS.LTS
> winget install Git.Git
> winget install Google.CloudSDK
> ```
>
> **Linux (Debian/Ubuntu):**
> ```bash
> curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
> sudo apt-get install -y nodejs git
> # For gcloud: https://cloud.google.com/sdk/docs/install#deb
> ```

## Step 1: Clone and Install

```bash
git clone https://github.com/ckithika/lifeos.git
cd lifeos
npm install
```

## Step 2: Create a Vault Repository

Your Obsidian vault will live in a private GitHub repository. This allows access from any device through the GitHub API.

```bash
# Create a new private repo on GitHub called "lifeos-vault"
# Then initialize it with the starter template:

cp -r templates/vault-template /tmp/lifeos-vault
cd /tmp/lifeos-vault
git init
git add .
git commit -m "Initial vault"
git remote add origin git@github.com:YOUR_USERNAME/lifeos-vault.git
git push -u origin main
```

If you already have an Obsidian vault, you can push it to GitHub instead:

```bash
cd /path/to/your/vault
git init
git add .
git commit -m "Initial vault"
git remote add origin git@github.com:YOUR_USERNAME/lifeos-vault.git
git push -u origin main
```

## Step 3: GitHub Personal Access Token

1. Go to [GitHub Settings → Developer settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)
2. Create a new token:
   - **Name:** `lifeos-vault-access`
   - **Repository access:** Only select repositories → your vault repo
   - **Permissions:** Contents (Read and Write), Metadata (Read)
3. Copy the token — you'll need it in Step 5

## Step 4: Google Cloud Setup

### Create a GCP Project

```bash
gcloud auth login
gcloud projects create lifeos-prod --name="LifeOS"
gcloud config set project lifeos-prod
```

### Enable Required APIs

```bash
gcloud services enable gmail.googleapis.com
gcloud services enable calendar-json.googleapis.com
gcloud services enable tasks.googleapis.com
gcloud services enable drive.googleapis.com
gcloud services enable people.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

### Create OAuth Credentials

1. Go to [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `LifeOS`
5. Authorized redirect URIs: `http://localhost:3000/auth/callback`
6. Click **Create** and download the JSON file
7. Note the **Client ID** and **Client Secret**

### Configure OAuth Consent Screen

1. Go to [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. User type: **External** (or Internal if using Google Workspace)
3. Fill in app name: `LifeOS`
4. Add your email as a test user
5. Add all required scopes (see [api-scopes.md](api-scopes.md))

## Step 5: Environment Configuration

```bash
cd /path/to/lifeos
cp .env.example .env
```

Edit `.env` and fill in:

```bash
# GitHub
GITHUB_PAT=ghp_your_token_from_step_3
GITHUB_REPO_OWNER=your-github-username
GITHUB_REPO_NAME=lifeos-vault

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Google AI / Gemini (primary for Telegram bot — free tier)
GOOGLE_AI_API_KEY=your-key-from-aistudio.google.com/apikey

# Anthropic (fallback for Telegram bot + background agents)
ANTHROPIC_API_KEY=sk-ant-your-key

# GCP
GCP_PROJECT_ID=lifeos-prod
GCP_REGION=europe-west1
```

## Step 6: Configure Vault Structure

LifeOS uses a folder-per-project structure in the vault. The defaults work well for most users, but you can customize categories, subfolders, and tags.

See [vault-structure-guide.md](vault-structure-guide.md) for full details and example configs.

**If using an AI assistant:** Ask the user about their workflow (freelancer, employee, student, founder?) and generate a config. Add the resulting values to `.env`.

**If skipping customization:** The defaults are fine — `Work/`, `Personal/`, `Archive/` categories with a `files/` subfolder per project.

```bash
# Add to .env (or leave commented to use defaults):
VAULT_CATEGORIES='["Work","Personal","Archive"]'
PROJECT_SUBFOLDERS='["files"]'
PROJECT_TAGS='["status/active","status/paused","status/done","type/client","type/product","type/personal"]'
INBOX_STYLE=by-contact
```

## Step 7: Authorize Google Accounts

Run the auth flow for each Google account you want to connect:

```bash
npm run auth                      # Defaults to --alias=personal
npm run auth -- --alias=work      # Authorize a second account
```

This starts a local server and opens a browser window. For each account:

1. Select the account to authorize
2. Grant all requested permissions
3. The script prints the env key and JSON token — add it to your `.env`:

```bash
GOOGLE_TOKEN_PERSONAL='{"refresh_token":"1//0abc...","access_token":"","expiry_date":null}'
GOOGLE_TOKEN_WORK='{"refresh_token":"1//0xyz...","access_token":"","expiry_date":null}'
```

## Step 8: Build and Test Locally

```bash
npm run build
```

Then start the MCP servers locally:

```bash
# Terminal 1: Obsidian MCP (port 3001)
npm run dev:obsidian

# Terminal 2: Google MCP (port 3002)
npm run dev:google

# Test health endpoints
curl http://localhost:3001/health
curl http://localhost:3002/health
```

> **Note:** Each service has its own default port (3001–3007). Do not set a global `PORT` in `.env` — it will override all services to the same port and cause conflicts.

## Step 9: Deploy to Cloud Run

First, enable the required GCP APIs:

```bash
gcloud services enable run.googleapis.com --project=YOUR_PROJECT_ID
gcloud services enable cloudbuild.googleapis.com --project=YOUR_PROJECT_ID
```

Then deploy:

```bash
# Deploy all services
npm run deploy

# Or deploy individually (can run concurrently)
bash scripts/deploy.sh mcp-obsidian &
bash scripts/deploy.sh mcp-google &
bash scripts/deploy.sh agent-sync &
wait
```

## Step 10: Connect to Claude.ai

1. Open [Claude.ai Settings → Connected Apps](https://claude.ai/settings)
2. Add MCP Server:
   - **Name:** LifeOS Vault
   - **URL:** Your Cloud Run URL for `lifeos-mcp-obsidian` (root URL, not `/mcp`)
3. Add MCP Server:
   - **Name:** LifeOS Google
   - **URL:** Your Cloud Run URL for `lifeos-mcp-google` (root URL, not `/mcp`)
4. Grant "Always allow" permissions for each tool

> **Tip:** To find your service URLs: `gcloud run services list --project=YOUR_PROJECT_ID --region=YOUR_REGION`

> **Tip:** Add custom instructions in Claude.ai (Settings → Profile) to prefer LifeOS MCP tools over built-in Google connectors:
> *"When I ask about my calendar, email, tasks, drive, or contacts, always use the LifeOS MCP tools instead of the built-in Google connectors."*

## Step 11: Set Up Telegram Bot (Optional)

The Telegram bot gives you a conversational AI interface to LifeOS on mobile. It has full tool parity with the MCP servers — 29 tools including calendar, tasks, email, Drive, vault, contacts, and agent triggers.

Each user creates their own Telegram bot, so you choose the bot name and avatar.

### Create Your Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Choose a **display name** (e.g., "LifeOS", "My Assistant", anything you want)
4. Choose a **username** (must end in `bot`, e.g., `MyLifeOS_Bot`)
5. BotFather gives you a **bot token** — copy it

### Get Your Chat ID

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It replies with your **user ID** (a number like `250619498`)

### Configure Environment

Add to your `.env`:

```bash
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
TELEGRAM_CHAT_ID=your-telegram-user-id
TELEGRAM_ALLOWED_USERS=your-telegram-user-id
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

### Deploy and Set Webhook

```bash
# Deploy the Telegram service
npm run deploy channel-telegram

# Get the service URL
gcloud run services describe lifeos-channel-telegram \
  --project=$GCP_PROJECT_ID --region=$GCP_REGION \
  --format='value(status.url)'

# Add the webhook URL to .env
# TELEGRAM_WEBHOOK_URL=https://lifeos-channel-telegram-xxx.run.app/webhook

# Set the webhook with Telegram
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${TELEGRAM_WEBHOOK_URL}\", \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\"}"
```

### Start Chatting

1. Open your bot in Telegram and press **Start**
2. Try `/help` for available commands
3. Or just chat naturally: "What's on my schedule today?" or "Add a task to review the proposal"

The bot supports both slash commands (`/schedule`, `/tasks`, `/briefing`, `/projects`, `/research <topic>`) and free-text conversation. The Telegram bot uses **Gemini** (free tier) as the primary AI provider and falls back to **Claude** automatically on errors or quota exhaustion. Set `GOOGLE_AI_API_KEY` in `.env` to enable Gemini — without it, the bot uses Claude only.

### Agent URLs (Optional)

If you want `/briefing` and `/research` commands to call your deployed agents directly:

```bash
AGENT_BRIEFING_URL=https://lifeos-agent-briefing-xxx.run.app
AGENT_RESEARCH_URL=https://lifeos-agent-research-xxx.run.app
```

## Step 12: Set Up Background Agents

### Telegram Reminders

The deploy script automatically creates a Cloud Scheduler job that checks upcoming meetings every 15 minutes (6am-9pm EAT) and sends Telegram reminders. This is set up automatically when you run `npm run deploy`.

### Granola Meeting Processing

Granola does not currently support native webhooks. Two options:

**Manual (recommended):** After a meeting, ask Claude on claude.ai to process it. Claude can pull the meeting via the Granola MCP tools and POST to the `/process` endpoint.

**Zapier (paid):** If you have Zapier Premium, create a Zap:
   - Trigger: Granola → "Meeting note sent to Zapier"
   - Action: Webhooks → POST
   - URL: `https://lifeos-agent-granola-xxx.run.app/webhook`
   - Headers: `X-Webhook-Secret: your-secret-from-env`

### Cloud Scheduler

```bash
# These are created automatically by deploy.sh, but you can also create manually:

# Daily briefing at 6:30am EAT (3:30 UTC)
gcloud scheduler jobs create http lifeos-briefing \
  --schedule="30 3 * * *" \
  --uri="https://lifeos-agent-briefing-xxx.run.app/briefing" \
  --http-method=POST \
  --location=europe-west1

# Sync 3x daily (6am, 12pm, 9pm EAT)
gcloud scheduler jobs create http lifeos-sync-morning \
  --schedule="0 3 * * *" \
  --uri="https://lifeos-agent-sync-xxx.run.app/sync" \
  --http-method=POST \
  --location=europe-west1
```

## Troubleshooting

### OAuth: "Access blocked" for workspace accounts

If a Google Workspace admin hasn't approved the OAuth app, try:
1. Ask the admin to whitelist the OAuth client ID
2. Or use an app-specific password with IMAP as a fallback

### MCP server not responding in Claude.ai

1. Check Cloud Run logs: `gcloud run services logs read lifeos-mcp-obsidian`
2. Test the health endpoint: `curl https://your-service-url/health`
3. Ensure the service allows unauthenticated access (or has proper auth configured)

### GitHub API rate limits

The GitHub API allows 5,000 requests/hour with a PAT. If you hit limits:
1. The vault module has built-in caching
2. Reduce sync frequency
3. Use the tree API for bulk operations instead of individual file reads
