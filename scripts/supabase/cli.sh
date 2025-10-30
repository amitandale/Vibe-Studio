#!/usr/bin/env bash
set -euo pipefail

__supabase_cli_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
__supabase_cli_env_helpers="$__supabase_cli_root/scripts/supabase/lib/env.sh"

if [[ -f "$__supabase_cli_env_helpers" ]]; then
  # shellcheck disable=SC1090
  source "$__supabase_cli_env_helpers"
fi

supabase_cli_require() {
  local bin="$1"
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "required command '$bin' not found in PATH" >&2
    return 1
  fi
}

supabase_cli_state_dir() {
  local lane="$1"
  if [[ -n "${SUPABASE_STATE_DIR:-}" ]]; then
    printf '%s' "$SUPABASE_STATE_DIR"
    return
  fi
  printf '%s/.supabase/%s' "$__supabase_cli_root" "$lane"
}

supabase_cli_env() {
  local lane="${1:?lane}";
  local repo_envfile="$__supabase_cli_root/ops/supabase/lanes/${lane}.env"
  if [[ ! -f "$repo_envfile" ]]; then
    echo "lane env file $repo_envfile missing; run scripts/supabase/provision_lane_env.sh $lane" >&2
    return 1
  fi
  supabase_cli_require supabase || return 1
  supabase_cli_require python3 || return 1

  # shellcheck disable=SC1090
  set -a; source "$repo_envfile"; set +a

  local db_url="${SUPABASE_DB_URL:-}" expected_db_url=""
  if command -v python3 >/dev/null 2>&1 && declare -f supabase_build_db_url >/dev/null 2>&1; then
    expected_db_url="$(supabase_build_db_url "${PGUSER:-postgres}" "${PGPASSWORD:-}" "${PGHOST:-127.0.0.1}" "${PGPORT:-${PGHOST_PORT:-5432}}" "${PGDATABASE:-postgres}")"
  fi
  if [[ -n "$expected_db_url" ]]; then
    db_url="$expected_db_url"
  elif [[ -z "$db_url" ]]; then
    db_url=$(python3 - <<'PY' "${PGUSER:-postgres}" "${PGPASSWORD:-}" "${PGHOST:-127.0.0.1}" "${PGPORT:-${PGHOST_PORT:-5432}}" "${PGDATABASE:-postgres}"
import sys
from urllib.parse import quote

user = quote(sys.argv[1]) if sys.argv[1] else ""
password = sys.argv[2]
host = sys.argv[3]
port = sys.argv[4]
database = quote(sys.argv[5]) if sys.argv[5] else ""

auth = ""
if user:
    if password:
        auth = f"{user}:{quote(password)}@"
    else:
        auth = f"{user}@"
elif password:
    auth = f":{quote(password)}@"

endpoint = host
if port:
    endpoint = f"{host}:{port}"

print(f"postgresql://{auth}{endpoint}/{database}")
PY
)
  fi
  export SUPABASE_DB_URL="$db_url"

  local lane_config="$__supabase_cli_root/supabase/config.${lane}.toml"
  if [[ ! -f "$lane_config" ]]; then
    echo "Supabase CLI config missing for lane '$lane' at $lane_config" >&2
    return 1
  fi

  export SUPABASE_CONFIG_PATH="$lane_config"
  export SUPABASE_INTERNAL_CONFIG="$lane_config"
  export SUPABASE_LANE_CONFIG="$lane_config"
  if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
    export SUPABASE_PROJECT_REF="${LANE:-$lane}"
  fi

  local state_dir
  state_dir="$(supabase_cli_state_dir "$lane")"
  mkdir -p "$state_dir"
  export SUPABASE_STATE_DIR="$state_dir"

  if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
    export SUPABASE_ACCESS_TOKEN
  elif [[ -n "${SUPABASE_SERVICE_KEY:-}" ]]; then
    export SUPABASE_ACCESS_TOKEN="${SUPABASE_SERVICE_KEY}"
  fi
}

supabase_cli_exec() {
  local lane="${1:?lane}"; shift
  supabase_cli_env "$lane"
  local args=("supabase" "--config" "$SUPABASE_CONFIG_PATH")
  if [[ $# -gt 0 ]]; then
    args+=("$@")
  fi
  exec "${args[@]}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  lane="${1:?lane}"; shift || true
  if [[ $# -eq 0 ]]; then
    echo "usage: cli.sh <lane> <supabase-args...>" >&2
    exit 2
  fi
  supabase_cli_exec "$lane" "$@"
fi
