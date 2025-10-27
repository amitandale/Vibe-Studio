#!/usr/bin/env bash
set -euo pipefail
lane="${1:?lane}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
envfile="$root/ops/supabase/lanes/${lane}.env"
if [[ ! -f "$envfile" ]]; then
  echo "lane env file $envfile missing" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$envfile"; set +a
docker compose --env-file "$envfile" -f "$root/ops/supabase/docker-compose.yml" restart edge-runtime
