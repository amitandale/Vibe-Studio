#!/usr/bin/env bash
set -euo pipefail
lane="${1:?lane}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
state_root="${SUPABASE_STATE_DIR:-$HOME/.config/vibe-studio/supabase}"
state_envfile="$state_root/lanes/${lane}.env"
repo_envfile="$root/ops/supabase/lanes/${lane}.env"
if [[ -f "$state_envfile" ]]; then
  envfile="$state_envfile"
elif [[ -f "$repo_envfile" ]]; then
  envfile="$repo_envfile"
else
  echo "lane env file $repo_envfile missing" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$envfile"; set +a
docker compose --env-file "$envfile" -f "$root/ops/supabase/docker-compose.yml" restart edge-runtime
