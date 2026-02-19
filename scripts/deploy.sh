#!/bin/bash
# LifeOS Deploy Script
# Deploys all services (or a specific one) to Google Cloud Run.
#
# Usage:
#   ./scripts/deploy.sh            # Deploy all services
#   ./scripts/deploy.sh mcp-obsidian  # Deploy specific service

set -euo pipefail

# Load .env for GCP config (skip comments, handle quoted values)
if [ -f .env ]; then
  set -a
  source <(grep -v '^#' .env | grep -v '^$' | sed "s/'//g")
  set +a
fi

PROJECT_ID="${GCP_PROJECT_ID:-lifeos-487513}"
REGION="${GCP_REGION:-europe-west1}"

# ─── Auto-enable required GCP APIs ────────────────────────
ensure_apis() {
  local apis=("run.googleapis.com" "cloudbuild.googleapis.com" "cloudscheduler.googleapis.com")
  for api in "${apis[@]}"; do
    if ! gcloud services list --project "$PROJECT_ID" --filter="config.name=$api" --format="value(config.name)" 2>/dev/null | grep -q "$api"; then
      echo "  Enabling $api..."
      gcloud services enable "$api" --project "$PROJECT_ID" --quiet 2>/dev/null || true
    fi
  done
}

# All deployable services
SERVICES=(
  "mcp-obsidian"
  "mcp-google"
  "agent-granola"
  "agent-sync"
  "agent-briefing"
  "agent-drive-org"
  "agent-research"
  "channel-telegram"
)

# Map service name to package directory
get_package_dir() {
  echo "packages/$1"
}

# Deploy a single service
deploy_service() {
  local service=$1
  local package_dir
  package_dir=$(get_package_dir "$service")
  local service_name="lifeos-${service}"

  echo ""
  echo "═══════════════════════════════════════"
  echo "  Deploying: ${service_name}"
  echo "═══════════════════════════════════════"

  # Build env vars YAML file
  local env_file
  env_file=$(build_env_vars_file)

  # Create a temp source dir with Dockerfile at root (allows concurrent deploys)
  local tmpdir
  tmpdir=$(mktemp -d)
  cp -a . "$tmpdir/"
  cp "${package_dir}/Dockerfile" "$tmpdir/Dockerfile"

  local min_instances=0
  local cpu_throttling=""

  # Build and deploy using Cloud Build + Cloud Run
  gcloud run deploy "$service_name" \
    --source "$tmpdir" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --min-instances "$min_instances" \
    --max-instances 3 \
    --memory 512Mi \
    --cpu 1 \
    --timeout 300 \
    --env-vars-file "$env_file" \
    $cpu_throttling \
    --quiet

  rm -rf "$tmpdir" "$env_file"

  # Get the service URL
  local url
  url=$(gcloud run services describe "$service_name" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format 'value(status.url)')

  echo "✅ ${service_name} deployed: ${url}"
  echo ""
}

# Build a YAML env-vars file from .env (handles JSON values safely)
build_env_vars_file() {
  local tmpfile="/tmp/lifeos-env-$$.yaml"
  > "$tmpfile"
  if [ -f .env ]; then
    while IFS= read -r line; do
      # Skip comments and empty lines
      [[ -z "$line" || "$line" == \#* ]] && continue
      # Split on first '='
      local key="${line%%=*}"
      local value="${line#*=}"
      # Remove surrounding single quotes if present
      value="${value#\'}"
      value="${value%\'}"
      # Write as YAML (quote the value to handle JSON safely)
      printf '%s: "%s"\n' "$key" "${value//\"/\\\"}" >> "$tmpfile"
    done < .env
  else
    echo 'LOG_LEVEL: "info"' > "$tmpfile"
  fi
  echo "$tmpfile"
}

# Deploy scheduler jobs
deploy_schedulers() {
  echo ""
  echo "═══════════════════════════════════════"
  echo "  Setting up Cloud Scheduler jobs"
  echo "═══════════════════════════════════════"

  local sync_url briefing_url drive_url

  sync_url=$(gcloud run services describe "lifeos-agent-sync" \
    --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)' 2>/dev/null || echo "")
  briefing_url=$(gcloud run services describe "lifeos-agent-briefing" \
    --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)' 2>/dev/null || echo "")
  drive_url=$(gcloud run services describe "lifeos-agent-drive-org" \
    --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)' 2>/dev/null || echo "")

  if [ -n "$sync_url" ]; then
    # Sync: 3x daily (6am, 12pm, 9pm EAT = 3am, 9am, 6pm UTC)
    create_scheduler "lifeos-sync-morning" "0 3 * * *" "${sync_url}/sync" "POST"
    create_scheduler "lifeos-sync-midday" "0 9 * * *" "${sync_url}/sync" "POST"
    create_scheduler "lifeos-sync-evening" "0 18 * * *" "${sync_url}/sync" "POST"

    # File sync: 3x daily (8am, 2pm, 8pm EAT = 5am, 11am, 5pm UTC)
    create_scheduler "lifeos-filesync-1" "0 5 * * *" "${sync_url}/sync?mode=files" "POST"
    create_scheduler "lifeos-filesync-2" "0 11 * * *" "${sync_url}/sync?mode=files" "POST"
    create_scheduler "lifeos-filesync-3" "0 17 * * *" "${sync_url}/sync?mode=files" "POST"
  fi

  if [ -n "$briefing_url" ]; then
    # Briefing: daily at 6:30am EAT = 3:30am UTC
    create_scheduler "lifeos-briefing" "30 3 * * *" "${briefing_url}/briefing" "POST"
  fi

  if [ -n "$drive_url" ]; then
    # Drive organize: daily at 7am EAT = 4am UTC
    create_scheduler "lifeos-drive-organize" "0 4 * * *" "${drive_url}/organize" "POST"
  fi

  local telegram_url
  telegram_url=$(gcloud run services describe "lifeos-channel-telegram" \
    --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)' 2>/dev/null || echo "")

  if [ -n "$telegram_url" ]; then
    # Reminders: every 15 min during 6am-9pm EAT = 3am-6pm UTC
    create_scheduler "lifeos-telegram-reminders" "*/15 3-18 * * *" "${telegram_url}/reminders" "POST"
  fi

  echo "✅ Scheduler jobs configured"
}

create_scheduler() {
  local name=$1 schedule=$2 uri=$3 method=$4

  # Delete existing job if it exists
  gcloud scheduler jobs delete "$name" \
    --project "$PROJECT_ID" --location "$REGION" --quiet 2>/dev/null || true

  gcloud scheduler jobs create http "$name" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --schedule "$schedule" \
    --uri "$uri" \
    --http-method "$method" \
    --attempt-deadline 600s \
    --quiet

  echo "  📅 ${name}: ${schedule} → ${uri}"
}

# Print Claude.ai connection URLs
print_mcp_urls() {
  echo ""
  echo "═══════════════════════════════════════"
  echo "  Claude.ai MCP Connection URLs"
  echo "═══════════════════════════════════════"
  echo ""
  echo "  Add these in Claude.ai → Settings → Connected Apps:"
  echo ""

  for service in "mcp-obsidian" "mcp-google"; do
    local url
    url=$(gcloud run services describe "lifeos-${service}" \
      --project "$PROJECT_ID" --region "$REGION" \
      --format 'value(status.url)' 2>/dev/null || echo "")
    if [ -n "$url" ]; then
      echo "  ${service}:  ${url}"
    fi
  done
  echo ""
}

# Main
main() {
  echo "🚀 LifeOS Deployment"
  echo "   Project: ${PROJECT_ID}"
  echo "   Region:  ${REGION}"

  # Ensure GCP APIs are enabled
  ensure_apis

  if [ $# -gt 0 ]; then
    # Deploy specific service
    deploy_service "$1"
  else
    # Deploy all services
    for service in "${SERVICES[@]}"; do
      deploy_service "$service"
    done

    # Set up scheduler
    deploy_schedulers

    # Print MCP URLs for Claude.ai
    print_mcp_urls
  fi

  echo ""
  echo "═══════════════════════════════════════"
  echo "  🎉 Deployment complete!"
  echo "═══════════════════════════════════════"
}

main "$@"
