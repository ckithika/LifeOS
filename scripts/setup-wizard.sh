#!/bin/bash
# LifeOS Interactive Setup Wizard
# Walks through the full setup process step by step.
#
# Usage: npm run setup

set -euo pipefail

# Colors
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

step() { echo -e "\n${BOLD}${CYAN}═══ Step $1: $2 ═══${NC}\n"; }
ok() { echo -e "  ${GREEN}✅ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "  ${RED}❌ $1${NC}"; }
info() { echo -e "  $1"; }

pause() {
  echo ""
  read -rp "  Press Enter to continue..." _
}

ask_yn() {
  local prompt=$1
  while true; do
    read -rp "  $prompt [y/n]: " yn
    case $yn in
      [Yy]*) return 0 ;;
      [Nn]*) return 1 ;;
    esac
  done
}

echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════╗"
echo "  ║       🧠 LifeOS Setup Wizard      ║"
echo "  ╚═══════════════════════════════════╝"
echo -e "${NC}"

# ─── Step 1: Prerequisites ───────────────────────────────
step 1 "Prerequisites"

PREREQ_OK=true

if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -ge 20 ]; then
    ok "Node.js $(node -v)"
  else
    fail "Node.js v20+ required (found v${NODE_VERSION})"
    PREREQ_OK=false
  fi
else
  fail "Node.js not found. Install v20+: https://nodejs.org"
  PREREQ_OK=false
fi

if command -v git &> /dev/null; then
  ok "Git $(git --version | awk '{print $3}')"
else
  fail "Git not found"
  PREREQ_OK=false
fi

if command -v gcloud &> /dev/null; then
  ok "Google Cloud SDK installed"
  GCLOUD_ACCOUNT=$(gcloud config get-value account 2>/dev/null || echo "")
  if [ -n "$GCLOUD_ACCOUNT" ]; then
    ok "Authenticated as: $GCLOUD_ACCOUNT"
  else
    warn "Not authenticated. Run: gcloud auth login"
  fi
else
  fail "gcloud CLI not found. Install: brew install google-cloud-sdk"
  PREREQ_OK=false
fi

if [ "$PREREQ_OK" = false ]; then
  echo ""
  fail "Fix the above issues and re-run this wizard."
  exit 1
fi

# ─── Step 2: Install Dependencies ────────────────────────
step 2 "Dependencies"

if [ -d node_modules ]; then
  ok "node_modules exists"
else
  info "Installing dependencies..."
  npm install
  ok "Dependencies installed"
fi

# ─── Step 3: Environment File ────────────────────────────
step 3 "Environment Configuration"

if [ ! -f .env ]; then
  cp .env.example .env
  ok "Created .env from .env.example"
else
  ok ".env exists"
fi

# Source current .env
set -a
source <(grep -v '^#' .env | grep -v '^$' | sed "s/'//g") 2>/dev/null || true
set +a

# Check key values
ENV_NEEDS_EDIT=false

if [ -z "${GITHUB_PAT:-}" ] || [[ "${GITHUB_PAT}" == *"your_"* ]] || [[ "${GITHUB_PAT}" == *"ghp_your"* ]]; then
  warn "GITHUB_PAT not configured"
  info "  Get one at: https://github.com/settings/personal-access-tokens/new"
  info "  Permissions: Contents (R+W), Metadata (Read) on your vault repo"
  ENV_NEEDS_EDIT=true
else
  ok "GITHUB_PAT configured"
fi

if [ -z "${GOOGLE_CLIENT_ID:-}" ] || [[ "${GOOGLE_CLIENT_ID}" == *"your-"* ]]; then
  warn "GOOGLE_CLIENT_ID not configured"
  info "  Create at: console.cloud.google.com → APIs & Services → Credentials"
  ENV_NEEDS_EDIT=true
else
  ok "GOOGLE_CLIENT_ID configured"
fi

if [ -z "${GOOGLE_CLIENT_SECRET:-}" ] || [[ "${GOOGLE_CLIENT_SECRET}" == *"your-"* ]]; then
  warn "GOOGLE_CLIENT_SECRET not configured"
  ENV_NEEDS_EDIT=true
else
  ok "GOOGLE_CLIENT_SECRET configured"
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ] || [[ "${ANTHROPIC_API_KEY}" == *"your-"* ]] || [[ "${ANTHROPIC_API_KEY}" == *"sk-ant-your"* ]]; then
  warn "ANTHROPIC_API_KEY not configured"
  info "  Get one at: console.anthropic.com → API Keys"
  ENV_NEEDS_EDIT=true
else
  ok "ANTHROPIC_API_KEY configured"
fi

if grep -q "^PORT=" .env 2>/dev/null; then
  warn "Global PORT found in .env — removing (each service uses its own port)"
  sed -i '' '/^PORT=/d' .env 2>/dev/null || sed -i '/^PORT=/d' .env
  ok "Removed PORT from .env"
fi

if [ "$ENV_NEEDS_EDIT" = true ]; then
  echo ""
  info "Edit .env with your credentials, then re-run this wizard."
  info "  Guide: docs/setup-guide.md"
  pause
  if ask_yn "Have you updated .env?"; then
    # Re-source
    set -a
    source <(grep -v '^#' .env | grep -v '^$' | sed "s/'//g") 2>/dev/null || true
    set +a
  else
    echo ""
    info "No problem. Run this wizard again after editing .env."
    exit 0
  fi
fi

# ─── Step 4: Vault Structure ─────────────────────────────
step 4 "Vault Structure"

info "LifeOS organizes your vault with a folder-per-project structure."
info "Default categories: Work, Personal, Archive"
echo ""

if grep -q "^VAULT_CATEGORIES=" .env 2>/dev/null; then
  ok "Vault structure already configured in .env"
else
  if ask_yn "Use default vault structure (Work/Personal/Archive)?"; then
    ok "Using default vault structure"
  else
    echo ""
    info "Enter your project categories (comma-separated):"
    read -rp "  Categories [Work,Personal,Archive]: " CUSTOM_CATS
    CUSTOM_CATS="${CUSTOM_CATS:-Work,Personal,Archive}"

    # Convert to JSON array
    IFS=',' read -ra CAT_ARRAY <<< "$CUSTOM_CATS"
    JSON_CATS=$(printf ',"%s"' "${CAT_ARRAY[@]}" | sed 's/^,//')
    JSON_CATS="[${JSON_CATS}]"

    echo "" >> .env
    echo "# Vault Structure" >> .env
    echo "VAULT_CATEGORIES='${JSON_CATS}'" >> .env
    echo "PROJECT_SUBFOLDERS='[\"files\"]'" >> .env
    echo "INBOX_STYLE=by-contact" >> .env
    ok "Vault structure saved to .env"
  fi
fi

info "See docs/vault-structure-guide.md for customization options."

# ─── Step 5: Google OAuth ────────────────────────────────
step 5 "Google OAuth Authorization"

TOKEN_VAR="GOOGLE_TOKEN_PERSONAL"
TOKEN_VAL="${!TOKEN_VAR:-}"

if [ -z "$TOKEN_VAL" ] || [[ "$TOKEN_VAL" == *"TODO"* ]]; then
  info "You need to authorize your Google account."
  info "This will open a browser window."
  echo ""
  if ask_yn "Run OAuth flow now?"; then
    npx tsx scripts/auth-google.ts
    ok "OAuth complete — token written to .env"
  else
    warn "Skipped. Run later: npm run auth"
  fi
else
  ok "Google token configured for personal account"
fi

# ─── Step 6: Build ───────────────────────────────────────
step 6 "Build"

info "Building all packages..."
npm run build 2>&1 || {
  fail "Build failed. Check the errors above."
  exit 1
}
ok "All packages built"

# ─── Step 7: GCP APIs ────────────────────────────────────
step 7 "GCP API Setup"

PROJECT="${GCP_PROJECT_ID:-}"
if [ -z "$PROJECT" ]; then
  warn "GCP_PROJECT_ID not set in .env"
  info "Skipping API enablement. Set it and re-run."
else
  info "Enabling required APIs for project: $PROJECT"
  for api in run.googleapis.com cloudbuild.googleapis.com cloudscheduler.googleapis.com \
             gmail.googleapis.com calendar-json.googleapis.com tasks.googleapis.com \
             drive.googleapis.com people.googleapis.com; do
    gcloud services enable "$api" --project "$PROJECT" --quiet 2>/dev/null && ok "$api" || warn "Could not enable $api"
  done
fi

# ─── Step 8: Deploy ──────────────────────────────────────
step 8 "Deploy to Cloud Run"

if ask_yn "Deploy all services to Cloud Run now?"; then
  bash scripts/deploy.sh
  ok "Deployment complete"
else
  warn "Skipped. Deploy later: npm run deploy"
fi

# ─── Step 9: Claude.ai Connection ────────────────────────
step 9 "Connect to Claude.ai"

echo ""
info "Add these MCP servers in Claude.ai → Settings → Connected Apps:"
echo ""

for service in "mcp-obsidian" "mcp-google"; do
  url=$(gcloud run services describe "lifeos-${service}" \
    --project "${GCP_PROJECT_ID}" --region "${GCP_REGION:-europe-west1}" \
    --format 'value(status.url)' 2>/dev/null || echo "not deployed")
  echo -e "  ${BOLD}${service}${NC}: ${url}"
done

echo ""
info "Also add to Claude.ai → Settings → Profile → Custom Instructions:"
info '  "Use LifeOS MCP tools instead of built-in Google connectors."'

# ─── Done ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}"
echo "  ╔═══════════════════════════════════╗"
echo "  ║     🎉 LifeOS Setup Complete!     ║"
echo "  ╚═══════════════════════════════════╝"
echo -e "${NC}"
echo "  Useful commands:"
echo "    npm run status     Check service health"
echo "    npm run preflight  Validate configuration"
echo "    npm run auth       Re-authorize Google account"
echo "    npm run deploy     Deploy/redeploy services"
echo ""
