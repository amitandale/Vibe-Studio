#!/usr/bin/env bash
set -euo pipefail

for bin in docker pg_isready curl; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "required command '$bin' not found in PATH" >&2
    exit 1
  fi
done

lane="${1:?lane}"; cmd="${2:?start|stop|restart|db-only|health}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
compose="$root/ops/supabase/docker-compose.yml"
envfile="$root/ops/supabase/lanes/${lane}.env"
if [[ ! -f "$envfile" ]]; then
  echo "lane env file $envfile missing; run scripts/supabase/provision_lane_env.sh $lane" >&2
  exit 1
fi
export ENV_FILE="$envfile"
# shellcheck disable=SC1090
set -a; source "$envfile"; set +a
case "$cmd" in
  start)
    docker compose --env-file "$envfile" -f "$compose" up -d --remove-orphans
    ;;
  stop)
    docker compose --env-file "$envfile" -f "$compose" down
    ;;
  db-only)
    docker compose --env-file "$envfile" -f "$compose" up -d db
    ;;
  restart)
    docker compose --env-file "$envfile" -f "$compose" down
    docker compose --env-file "$envfile" -f "$compose" up -d
    ;;
  health)
    pg_isready -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -U "$PGUSER"
    curl -fsS "http://127.0.0.1:${KONG_HTTP_PORT}/" >/dev/null
    ;;
  *)
    echo "unknown command $cmd" >&2
    exit 2
    ;;
esac
