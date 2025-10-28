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
state_root="${SUPABASE_STATE_DIR:-$HOME/.config/vibe-studio/supabase}"
state_envfile="$state_root/lanes/${lane}.env"
repo_envfile="$root/ops/supabase/lanes/${lane}.env"
if [[ -f "$state_envfile" ]]; then
  envfile="$state_envfile"
elif [[ -f "$repo_envfile" ]]; then
  envfile="$repo_envfile"
else
  echo "lane env file $repo_envfile missing; run scripts/supabase/provision_lane_env.sh $lane --interactive --pg-super-role supabase_admin" >&2
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
if [[ "$super_role" == supabase_admin_${lane} ]]; then
  super_role="supabase_admin"
fi
super_password="${SUPABASE_SUPER_PASSWORD:-}"

warn_superuser_config() {
  cat >&2 <<MSG
⚠️  Unable to connect with the configured Supabase superuser credentials for lane '$lane'.
   Provide the correct values with:
     scripts/supabase/provision_lane_env.sh $lane \\
       --pg-super-role <role> --pg-super-password <password>
   See docs/SUPABASE_SETUP.md#restore-existing-superusers for recovery steps on reused volumes.
MSG
}

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

wait_for_user() {
  local user="$1"
  local password="$2"
  local attempts="${3:-30}"
  local delay="${4:-2}"

  if [[ -z "$user" ]]; then
    return 1
  fi

  local i
  for ((i = 1; i <= attempts; i++)); do
    if run_pg_isready "$user" "$password" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done

  run_pg_isready "$user" "$password"
}

wait_for_superuser_inside() {
  local attempts="${1:-30}"
  local delay="${2:-2}"

  local i
  for ((i = 1; i <= attempts; i++)); do
    if "${compose_cmd[@]}" exec -T db pg_isready -h 127.0.0.1 -p 5432 -d postgres -U supabase_admin >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done

  "${compose_cmd[@]}" exec -T db pg_isready -h 127.0.0.1 -p 5432 -d postgres -U supabase_admin
}

repair_credentials() {
  local attempts="${1:-30}"
  local delay="${2:-2}"

  if [[ -z "$super_role" || -z "$super_password" ]]; then
    warn_superuser_config
    return 2
  fi

  if ! wait_for_superuser_inside "$attempts" "$delay"; then
    warn_superuser_config
    return 2
  fi

  if ! "${compose_cmd[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
      -v desired_super_role="$super_role" \
      -v desired_super_password="$super_password" \
      -v desired_lane_role="$PGUSER" \
      -v desired_lane_password="$PGPASSWORD" <<'SQL'; then
DO $$
DECLARE
  v_super_role text := nullif(:'desired_super_role', '');
  v_super_password text := nullif(:'desired_super_password', '');
  v_lane_role text := nullif(:'desired_lane_role', '');
  v_lane_password text := nullif(:'desired_lane_password', '');
BEGIN
  IF v_super_role IS NOT NULL AND v_super_password IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_super_role) THEN
      EXECUTE format('CREATE ROLE %I WITH LOGIN SUPERUSER PASSWORD %L', v_super_role, v_super_password);
    ELSE
      EXECUTE format('ALTER ROLE %I WITH LOGIN SUPERUSER PASSWORD %L', v_super_role, v_super_password);
    END IF;
  END IF;

  IF v_lane_role IS NOT NULL AND v_lane_password IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_lane_role) THEN
      EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', v_lane_role, v_lane_password);
    ELSE
      EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', v_lane_role, v_lane_password);
    END IF;
  END IF;
END;
$$;
SQL
    warn_superuser_config
    return 2
  fi

  return 0
}

ensure_lane_role() {
  local attempts="${1:-30}"
  local delay="${2:-2}"

  if wait_for_user "$PGUSER" "$PGPASSWORD" "$attempts" "$delay" >/dev/null 2>&1; then
    return 0
  fi

  if ! repair_credentials "$attempts" "$delay"; then
    return 2
  fi

  wait_for_user "$PGUSER" "$PGPASSWORD" "$attempts" "$delay"
}

wait_for_pg() {
  local attempts="${1:-30}"
  local delay="${2:-2}"

  if ! ensure_lane_role "$attempts" "$delay"; then
    return 2
  fi

  wait_for_user "$PGUSER" "$PGPASSWORD" "$attempts" "$delay"
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
    if ! wait_for_pg; then
      exit 2
    fi
    run_pg_isready "$PGUSER" "$PGPASSWORD"
    ;;
  restart)
    "${compose_cmd[@]}" down
    "${compose_cmd[@]}" up -d
    ;;
  health)
    if ! wait_for_pg; then
      exit 2
    fi
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
