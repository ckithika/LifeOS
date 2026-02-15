# LifeOS Setup Guide

This guide walks you through setting up LifeOS from scratch. Total setup time: ~30-45 minutes.

## Prerequisites

- **Node.js 20+** — `node --version` should show v20 or higher
- **Git** — for vault syncing
- **Google Cloud SDK** — `brew install google-cloud-sdk` (macOS) or [install guide](https://cloud.google.com/sdk/docs/install)
- **Obsidian** — [download](https://obsidian.md) (optional, for local vault viewing)
- **Claude Pro** subscription — for MCP server connections
- **Granola** — [granola.ai](https://granola.ai) (optional, for meeting automation)

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

# Anthropic (for background agents)
ANTHROPIC_API_KEY=sk-ant-your-key

# GCP
GCP_PROJECT_ID=lifeos-prod
GCP_REGION=europe-west1
```

## Step 6: Authorize Google Accounts

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

## Step 7: Build and Test Locally

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

## Step 8: Deploy to Cloud Run

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

## Step 9: Connect to Claude.ai

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

## Step 10: Set Up Background Agents

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
