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

super_role="${SUPABASE_SUPER_ROLE:-${PGUSER:-}}"
super_password="${SUPABASE_SUPER_PASSWORD:-${PGPASSWORD:-}}"

run_pg_isready() {
  local user="$1"
  local password="$2"
  if [[ -z "$user" ]]; then
    return 1
  fi
  if [[ -n "$password" ]]; then
    PGPASSWORD="$password" pg_isready -h "$local_pg_host" -p "$PGPORT" -d "$PGDATABASE" -U "$user"
  else
    pg_isready -h "$local_pg_host" -p "$PGPORT" -d "$PGDATABASE" -U "$user"
  fi
}

ensure_pg_role() {
  local target_role="$PGUSER"
  if [[ -z "$target_role" ]]; then
    return 0
  fi
  if [[ "$super_role" == "$target_role" ]]; then
    return 0
  fi
  if [[ -z "$super_role" || -z "$super_password" ]]; then
    echo "⚠️  Cannot verify role '$target_role' because SUPABASE_SUPER_ROLE or SUPABASE_SUPER_PASSWORD is unset." >&2
    return 1
  fi
  local result
  result=$("${compose_cmd[@]}" exec -T db env PGPASSWORD="$super_password" \
    psql -v ON_ERROR_STOP=1 -U "$super_role" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${target_role}'" 2>/dev/null || true)
  if [[ "$result" == "1" ]]; then
    return 0
  fi
  "${compose_cmd[@]}" exec -T db env PGPASSWORD="$super_password" \
    psql -v ON_ERROR_STOP=1 -U "$super_role" -d postgres \
    -v target_role="$target_role" -v target_password="$PGPASSWORD" <<'SQL'
DO $$
DECLARE
  role_name text := :'target_role';
  role_password text := :'target_password';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L SUPERUSER', role_name, role_password);
  END IF;
END
$$;
SQL
  echo "ℹ️  Ensured Postgres role '$target_role' exists using superuser '$super_role'." >&2
}

wait_for_pg() {
  local attempts="${1:-30}"
  local delay="${2:-2}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if run_pg_isready "$PGUSER" "$PGPASSWORD" >/dev/null 2>&1; then
      return 0
    fi
    if [[ -n "$super_role" && "$super_role" != "$PGUSER" && -n "$super_password" ]]; then
      if run_pg_isready "$super_role" "$super_password" >/dev/null 2>&1; then
        if ensure_pg_role; then
          if run_pg_isready "$PGUSER" "$PGPASSWORD" >/dev/null 2>&1; then
            return 0
          fi
        fi
      fi
    fi
    sleep "$delay"
  done
  run_pg_isready "$PGUSER" "$PGPASSWORD"
}
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
    wait_for_pg
    ensure_pg_role
    run_pg_isready "$PGUSER" "$PGPASSWORD"
    ;;
  restart)
    "${compose_cmd[@]}" down
    "${compose_cmd[@]}" up -d
    ;;
  health)
    wait_for_pg
    ensure_pg_role
    run_pg_isready "$PGUSER" "$PGPASSWORD"
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
