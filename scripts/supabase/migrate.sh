#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage: migrate.sh <lane> [--reset]

Run Supabase migrations for the given lane using the Supabase CLI. Pass
--reset to run `supabase db reset` instead of `supabase db push`.
USAGE
}

lane=""
reset=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --reset)
      reset=true
      shift
      ;;
    *)
      if [[ -z "$lane" ]]; then
        lane="$1"
        shift
      else
        echo "unexpected argument '$1'" >&2
        usage
        exit 2
      fi
      ;;
  esac
done

if [[ -z "$lane" ]]; then
  usage
  exit 1
fi

root="$(cd "$(dirname "$0")/../.." && pwd)"
cli_helper="$root/scripts/supabase/cli.sh"

if [[ ! -f "$cli_helper" ]]; then
  echo "Supabase CLI helper missing at $cli_helper" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$cli_helper"

if ! supabase_cli_env "$lane"; then
  echo "failed to prepare Supabase CLI environment for lane '$lane'" >&2
  exit 1
fi

migrations_dir="$root/supabase/migrations"
if [[ ! -d "$migrations_dir" ]]; then
  echo "Supabase migrations directory missing at $migrations_dir" >&2
  exit 1
fi

command -v supabase >/dev/null 2>&1 || {
  echo "required command 'supabase' not found in PATH" >&2
  exit 1
}

action="push"
if [[ "$reset" == true ]]; then
  action="reset"
fi

echo "ℹ️  Running supabase db $action for lane '$lane' (config: $SUPABASE_CONFIG_PATH)" >&2
cli_db_url="${SUPABASE_CLI_DB_URL:-$SUPABASE_DB_URL}"
cli_db_label="SUPABASE_DB_URL"
if [[ -n "${SUPABASE_CLI_DB_URL:-}" ]]; then
  cli_db_label="SUPABASE_CLI_DB_URL"
fi
echo "ℹ️  ${cli_db_label}=${cli_db_url}" >&2

supabase_project_dir="$root/supabase"
if [[ ! -d "$supabase_project_dir" ]]; then
  echo "Supabase project directory missing at $supabase_project_dir" >&2
  exit 1
fi

args=(
  "supabase"
  "--workdir" "$supabase_project_dir"
  "db" "$action"
  "--db-url" "$cli_db_url"
  "--non-interactive"
  "--debug"
)

display_args=("${args[@]}")
for i in "${!display_args[@]}"; do
  if [[ "${display_args[$i]}" == "--db-url" && $((i + 1)) -lt ${#display_args[@]} ]]; then
    display_args[$((i + 1))]="***"
    break
  fi
done

formatted_command=""
printf -v formatted_command '%q ' "${display_args[@]}"
formatted_command="${formatted_command% }"
printf 'ℹ️  Executing: %s\n' "$formatted_command" >&2

PGSSLMODE="${PGSSLMODE:-disable}" "${args[@]}"
