#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: validate_lane_env.sh <lane>" >&2
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" || $# -eq 0 ]]; then
  usage
  exit $(( $# -eq 0 ? 1 : 0 ))
fi

lane="$1"
case "$lane" in
  main|work|codex) ;;
  *)
    echo "invalid lane '$lane' (expected main, work, codex)" >&2
    exit 2
    ;;
esac

root="$(cd "$(dirname "$0")/../.." && pwd)"
state_root="${SUPABASE_STATE_DIR:-$HOME/.config/vibe-studio/supabase}"
state_env_file="$state_root/lanes/${lane}.env"
working_env_file="$root/ops/supabase/lanes/${lane}.env"
if [[ -f "$state_env_file" ]]; then
  env_file="$state_env_file"
else
  env_file="$working_env_file"
fi

fail() {
  echo "❌ $1" >&2
  if [[ -n ${2:-} ]]; then
    echo "   → $2" >&2
  fi
  exit 1
}

if [[ ! -f "$env_file" ]]; then
  fail "Lane environment file $working_env_file not found." "Run scripts/supabase/provision_lane_env.sh $lane on the runner."
fi

if grep -q '{{' "$env_file"; then
  fail "Lane environment file still contains template placeholders." "Replace all {{PLACEHOLDER}} entries with real values."
fi

# shellcheck disable=SC1090
set -a; source "$env_file"; set +a

required_vars=(
  COMPOSE_PROJECT_NAME
  LANE
  VOL_NS
  PGHOST
  PGPORT
  PGDATABASE
  PGUSER
  PGPASSWORD
  SUPABASE_SUPER_ROLE
  SUPABASE_SUPER_PASSWORD
  KONG_HTTP_PORT
  EDGE_PORT
  EDGE_ENV_FILE
  JWT_SECRET
  ANON_KEY
  SERVICE_ROLE_KEY
)

missing=()
for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  fail "Missing required variables: ${missing[*]}" "Update $env_file with the required values."
fi

if [[ -z "${PGHOST_PORT:-}" ]]; then
  echo "ℹ️  PGHOST_PORT not set; host tooling will fall back to PGPORT (${PGPORT})." >&2
else
  if [[ "${PGPORT}" != "5432" ]]; then
    echo "⚠️  PGPORT is '${PGPORT}', but containers should listen on 5432. Provision the lane env again to normalize ports." >&2
  fi
fi

weak_regex='(changeme|password|test|example|temp|secret)'
if [[ "${PGPASSWORD,,}" =~ $weak_regex ]]; then
  echo "⚠️  PGPASSWORD appears weak (${PGPASSWORD}). Replace it with a strong unique password." >&2
fi

if [[ "${SUPABASE_SUPER_PASSWORD,,}" =~ $weak_regex ]]; then
  echo "⚠️  SUPABASE_SUPER_PASSWORD appears weak (${SUPABASE_SUPER_PASSWORD}). Replace it with a strong unique password." >&2
fi

echo "✅ Lane '$lane' environment validated."
