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
env_file="$root/ops/supabase/lanes/${lane}.env"

fail() {
  echo "❌ $1" >&2
  if [[ -n ${2:-} ]]; then
    echo "   → $2" >&2
  fi
  exit 1
}

if [[ ! -f "$env_file" ]]; then
  fail "Lane environment file $env_file not found." "Run scripts/supabase/provision_lane_env.sh $lane on the runner."
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
  STUDIO_IMAGE
  KONG_IMAGE
  AUTH_IMAGE
  REST_IMAGE
  REALTIME_IMAGE
  STORAGE_IMAGE
  IMGPROXY_IMAGE
  META_IMAGE
  EDGE_IMAGE
  ANALYTICS_IMAGE
  DB_IMAGE
  VECTOR_IMAGE
  SUPAVISOR_IMAGE
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

weak_regex='(changeme|password|test|example|temp|secret)'
if [[ "${PGPASSWORD,,}" =~ $weak_regex ]]; then
  echo "⚠️  PGPASSWORD appears weak (${PGPASSWORD}). Replace it with a strong unique password." >&2
fi

if [[ "${SUPABASE_SUPER_PASSWORD,,}" =~ $weak_regex ]]; then
  echo "⚠️  SUPABASE_SUPER_PASSWORD appears weak (${SUPABASE_SUPER_PASSWORD}). Replace it with a strong unique password." >&2
fi

images_lock="$root/ops/supabase/images.lock.json"
if command -v jq >/dev/null 2>&1 && [[ -f "$images_lock" ]]; then
  while IFS='=' read -r key expected; do
    current="${!key:-}"
    if [[ "$current" != "$expected" ]]; then
      fail "$key in $env_file does not match lock file." "Expected $expected"
    fi
  done < <(jq -r '.images | to_entries[] | "\(.key)=\(.value)"' "$images_lock")
fi

echo "✅ Lane '$lane' environment validated."
