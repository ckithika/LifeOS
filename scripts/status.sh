#!/bin/bash
# LifeOS Status Check
# Checks health of all deployed LifeOS services, scheduler jobs, and last sync.
#
# Usage:
#   ./scripts/status.sh

set -euo pipefail

# ─── Load environment ──────────────────────────────────────
if [ -f .env ]; then
  set -a
  source <(grep -v '^#' .env | grep -v '^$' | sed "s/'//g")
  set +a
fi

PROJECT_ID="${GCP_PROJECT_ID:-lifeos-487513}"
REGION="${GCP_REGION:-europe-west1}"

# Services to check (Cloud Run name → health endpoint)
SERVICES=(
  "lifeos-mcp-obsidian"
  "lifeos-mcp-google"
  "lifeos-agent-granola"
  "lifeos-agent-sync"
  "lifeos-agent-briefing"
  "lifeos-agent-drive-org"
  "lifeos-agent-research"
)

# ─── Helpers ────────────────────────────────────────────────

# Column widths
COL_NAME=22
COL_URL=55

pad() {
  local str="$1" width="$2"
  printf "%-${width}s" "$str"
}

# ─── Collect service URLs ──────────────────────────────────

declare -A SERVICE_URLS

fetch_service_urls() {
  local output
  output=$(gcloud run services list \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format='value(metadata.name, status.url)' 2>/dev/null) || true

  while IFS=$'\t' read -r name url; do
    [[ -z "$name" ]] && continue
    SERVICE_URLS["$name"]="$url"
  done <<< "$output"
}

# ─── Health check a single service ─────────────────────────

check_health() {
  local url="$1"
  local health_url="${url}/health"

  # Allow 10s for cold-start (scale-to-zero)
  local http_code
  http_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$health_url" 2>/dev/null) || http_code="000"

  if [[ "$http_code" =~ ^2 ]]; then
    echo "ok"
  else
    echo "fail:${http_code}"
  fi
}

# ─── Print services table ──────────────────────────────────

print_services() {
  echo ""
  echo "═══ Services ═══════════════════════════════════════════════════════════════"
  echo ""

  for service in "${SERVICES[@]}"; do
    # Short name without "lifeos-" prefix
    local short_name="${service#lifeos-}"
    local url="${SERVICE_URLS[$service]:-}"

    if [[ -z "$url" ]]; then
      printf "  ❌ %-${COL_NAME}s %s\n" "$short_name" "Not deployed"
      continue
    fi

    local result
    result=$(check_health "$url")

    if [[ "$result" == "ok" ]]; then
      printf "  ✅ %-${COL_NAME}s %s\n" "$short_name" "$url"
    else
      local code="${result#fail:}"
      if [[ "$code" == "000" ]]; then
        printf "  ❌ %-${COL_NAME}s %s\n" "$short_name" "Not responding (timeout)"
      else
        printf "  ❌ %-${COL_NAME}s %s (HTTP %s)\n" "$short_name" "$url" "$code"
      fi
    fi
  done

  echo ""
}

# ─── Print scheduler jobs table ────────────────────────────

print_scheduler() {
  echo "═══ Scheduler Jobs ═════════════════════════════════════════════════════════"
  echo ""

  local output
  output=$(gcloud scheduler jobs list \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --format='value(name.basename(), schedule, state)' 2>/dev/null) || true

  if [[ -z "$output" ]]; then
    echo "  (no scheduler jobs found)"
    echo ""
    return
  fi

  while IFS=$'\t' read -r name schedule state; do
    [[ -z "$name" ]] && continue

    local icon="✅"
    if [[ "${state^^}" != "ENABLED" ]]; then
      icon="⏸️ "
    fi

    printf "  %s %-${COL_NAME}s %-18s %s\n" "$icon" "$name" "$schedule" "$state"
  done <<< "$output"

  echo ""
}

# ─── Last sync timestamp ──────────────────────────────────

print_last_sync() {
  echo "═══ Last Sync ══════════════════════════════════════════════════════════════"
  echo ""

  local obsidian_url="${SERVICE_URLS[lifeos-mcp-obsidian]:-}"

  if [[ -z "$obsidian_url" ]]; then
    echo "  (obsidian MCP not deployed — cannot read sync log)"
    echo ""
    return
  fi

  # Try to read the sync log via the obsidian MCP's read endpoint
  local sync_log
  sync_log=$(curl -s --max-time 10 \
    "${obsidian_url}/read?path=Daily/sync-log.md" 2>/dev/null) || sync_log=""

  if [[ -z "$sync_log" ]]; then
    # Fallback: try POST-based file read (MCP-style)
    sync_log=$(curl -s --max-time 10 \
      -X POST \
      -H "Content-Type: application/json" \
      -d '{"path":"Daily/sync-log.md"}' \
      "${obsidian_url}/read" 2>/dev/null) || sync_log=""
  fi

  if [[ -n "$sync_log" ]]; then
    # Extract the last timestamp line (look for ISO dates or common timestamp patterns)
    local last_ts
    last_ts=$(echo "$sync_log" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2})?' | tail -1)

    if [[ -n "$last_ts" ]]; then
      echo "  🕐 Last sync: ${last_ts}"
    else
      echo "  🕐 Sync log found but no timestamp detected"
    fi
  else
    echo "  (could not read Daily/sync-log.md)"
  fi

  echo ""
}

# ─── Main ──────────────────────────────────────────────────

main() {
  echo ""
  echo "🔍 LifeOS Status"
  echo "   Project: ${PROJECT_ID}"
  echo "   Region:  ${REGION}"

  fetch_service_urls
  print_services
  print_scheduler
  print_last_sync
}

main "$@"
