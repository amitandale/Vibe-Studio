#!/usr/bin/env bash
set -euo pipefail

for bin in docker pg_isready curl; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "required command '$bin' not found in PATH" >&2
    exit 1
  fi
done

lane="${1:?lane}"; cmd="${2:?start|stop|restart|db-only|db-health|health|status}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
compose="$root/ops/supabase/docker-compose.yml"
envfile="$root/ops/supabase/lanes/${lane}.env"
if [[ ! -f "$envfile" ]]; then
  echo "lane env file $envfile missing; run scripts/supabase/provision_lane_env.sh $lane --random-pg-password" >&2
  exit 1
fi
export ENV_FILE="$envfile"
# shellcheck disable=SC1090
set -a; source "$envfile"; set +a
compose_cmd=(docker compose --env-file "$envfile" -f "$compose")

local_pg_host="127.0.0.1"
if [[ ${PGHOST:-} == "localhost" || ${PGHOST:-} == "127.0.0.1" ]]; then
  local_pg_host="$PGHOST"
fi
case "$cmd" in
  start)
    "${compose_cmd[@]}" up -d --remove-orphans
    ;;
  stop)
    "${compose_cmd[@]}" down
    ;;
  db-only)
    "${compose_cmd[@]}" up -d db
    ;;
  db-health)
    pg_isready -h "$local_pg_host" -p "$PGPORT" -d "$PGDATABASE" -U "$PGUSER"
    ;;
  restart)
    "${compose_cmd[@]}" down
    "${compose_cmd[@]}" up -d
    ;;
  health)
    pg_isready -h "$local_pg_host" -p "$PGPORT" -d "$PGDATABASE" -U "$PGUSER"
    curl -fsS "http://127.0.0.1:${KONG_HTTP_PORT}/" >/dev/null
    ;;
  status)
    if ! "${compose_cmd[@]}" ps >/dev/null 2>&1; then
      exit 1
    fi
    if command -v jq >/dev/null 2>&1; then
      ps_json=$("${compose_cmd[@]}" ps --format json 2>/dev/null || true)
      if [[ -n "$ps_json" ]]; then
        missing=0
        for svc in db kong; do
          if ! jq -e --arg svc "$svc" 'any(.[]; .Service == $svc and ((.State // "") | ascii_downcase | startswith("running") or (.State // "") | ascii_downcase | startswith("up")))' <<<"$ps_json" >/dev/null; then
            missing=1
            break
          fi
        done
        if [[ $missing -eq 0 ]]; then
          exit 0
        fi
      fi
    fi
    ps_output=$("${compose_cmd[@]}" ps 2>/dev/null || true)
    for svc in db kong; do
      if ! grep -qiE "\b${svc}\b.*(up|running)" <<<"$ps_output"; then
        exit 1
      fi
    done
    ;;
  *)
    echo "unknown command $cmd" >&2
    exit 2
    ;;
esac
