#!/usr/bin/env bash
set -euo pipefail

lane="${1:?lane}"
shift || true

root="$(cd "$(dirname "$0")/../.." && pwd)"
cli_helper="$root/scripts/supabase/cli.sh"

if [[ ! -f "$cli_helper" ]]; then
  echo "Supabase CLI helper missing at $cli_helper" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$cli_helper"

if ! supabase_cli_env "$lane"; then
  echo "Unable to prepare Supabase CLI environment for lane '$lane'" >&2
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "required command 'supabase' not found in PATH" >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  set -- functions deploy --all
fi

echo "ℹ️  Deploying Supabase Edge resources for lane '$lane' via Supabase CLI" >&2
exec supabase "$@"
