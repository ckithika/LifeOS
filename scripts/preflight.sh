#!/bin/bash
# LifeOS Preflight Validation
# Run before deployment to catch common setup issues.
#
# Usage:
#   ./scripts/preflight.sh

set -euo pipefail

FAILURES=0
WARNINGS=0

pass() {
  echo "  ✅ $1"
}

fail() {
  echo "  ❌ $1"
  if [ -n "${2:-}" ]; then
    echo "     ↳ Fix: $2"
  fi
  FAILURES=$((FAILURES + 1))
}

warn() {
  echo "  ⚠️  $1"
  if [ -n "${2:-}" ]; then
    echo "     ↳ $2"
  fi
  WARNINGS=$((WARNINGS + 1))
}

echo ""
echo "═══════════════════════════════════════"
echo "  LifeOS Preflight Check"
echo "═══════════════════════════════════════"
echo ""

# ─── 1. Check .env exists ──────────────────────────────────────
echo "Environment file:"

if [ ! -f .env ]; then
  fail ".env file not found" "cp .env.example .env && edit .env with your values"
  echo ""
  echo "Cannot continue without .env. Exiting."
  exit 1
fi

pass ".env file exists"

# Source .env (handles JSON values by stripping single quotes)
set -a
source <(grep -v '^#' .env | grep -v '^$' | sed "s/'//g")
set +a

# ─── 2. Check required env vars ────────────────────────────────
echo ""
echo "Required environment variables:"

REQUIRED_VARS=(
  "GITHUB_PAT"
  "GITHUB_REPO_OWNER"
  "GITHUB_REPO_NAME"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "ANTHROPIC_API_KEY"
  "GCP_PROJECT_ID"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    fail "${var} is not set" "Add ${var}=<value> to your .env file"
  else
    pass "${var} is set"
  fi
done

# ─── 3. Check GOOGLE_TOKEN_PERSONAL is not a TODO placeholder ──
echo ""
echo "Google token:"

if [ -z "${GOOGLE_TOKEN_PERSONAL:-}" ]; then
  fail "GOOGLE_TOKEN_PERSONAL is not set" "Run: npm run auth -- --alias=personal"
elif echo "$GOOGLE_TOKEN_PERSONAL" | grep -qi "TODO"; then
  fail "GOOGLE_TOKEN_PERSONAL still contains TODO placeholder" "Run: npm run auth -- --alias=personal"
else
  pass "GOOGLE_TOKEN_PERSONAL is configured"
fi

# ─── 4. Check for global PORT= in .env ─────────────────────────
echo ""
echo "Port configuration:"

if grep -qE '^PORT=' .env; then
  warn "Global PORT= found in .env" "This causes port conflicts. Each service uses its own default port (3001-3007). Remove the PORT= line."
else
  pass "No global PORT= override (services use their own defaults)"
fi

# ─── 5. Check gcloud is installed and authenticated ────────────
echo ""
echo "Google Cloud CLI:"

if ! command -v gcloud &>/dev/null; then
  fail "gcloud CLI is not installed" "Install from: https://cloud.google.com/sdk/docs/install"
else
  pass "gcloud CLI is installed"

  # Check authentication
  ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || echo "")
  if [ -z "$ACTIVE_ACCOUNT" ]; then
    fail "gcloud is not authenticated" "Run: gcloud auth login"
  else
    pass "gcloud authenticated as ${ACTIVE_ACCOUNT}"
  fi
fi

# ─── 6. Check GCP APIs are enabled ─────────────────────────────
echo ""
echo "GCP APIs:"

REQUIRED_APIS=(
  "run.googleapis.com"
  "cloudbuild.googleapis.com"
)

PROJECT="${GCP_PROJECT_ID:-}"
if [ -n "$PROJECT" ] && command -v gcloud &>/dev/null; then
  ENABLED_APIS=$(gcloud services list --enabled --project "$PROJECT" --format="value(config.name)" 2>/dev/null || echo "")

  for api in "${REQUIRED_APIS[@]}"; do
    if echo "$ENABLED_APIS" | grep -q "^${api}$"; then
      pass "${api} is enabled"
    else
      fail "${api} is not enabled" "Run: gcloud services enable ${api} --project ${PROJECT}"
    fi
  done
else
  if [ -z "$PROJECT" ]; then
    fail "Cannot check APIs: GCP_PROJECT_ID is not set" "Set GCP_PROJECT_ID in .env"
  else
    fail "Cannot check APIs: gcloud is not available" "Install gcloud CLI first"
  fi
fi

# ─── 7. Check Node.js 20+ ──────────────────────────────────────
echo ""
echo "Node.js:"

if ! command -v node &>/dev/null; then
  fail "Node.js is not installed" "Install Node.js 20+ from: https://nodejs.org/"
else
  NODE_VERSION=$(node -v | sed 's/^v//')
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

  if [ "$NODE_MAJOR" -ge 20 ]; then
    pass "Node.js v${NODE_VERSION} (>= 20)"
  else
    fail "Node.js v${NODE_VERSION} is too old (need 20+)" "Install Node.js 20+ from: https://nodejs.org/"
  fi
fi

# ─── Summary ───────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
if [ "$FAILURES" -gt 0 ]; then
  echo "  Result: ${FAILURES} failure(s), ${WARNINGS} warning(s)"
  echo "  Fix the issues above and re-run: ./scripts/preflight.sh"
  echo "═══════════════════════════════════════"
  echo ""
  exit 1
else
  if [ "$WARNINGS" -gt 0 ]; then
    echo "  Result: All checks passed with ${WARNINGS} warning(s)"
  else
    echo "  Result: All checks passed"
  fi
  echo "  Ready to deploy!"
  echo "═══════════════════════════════════════"
  echo ""
  exit 0
fi
