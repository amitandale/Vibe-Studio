#!/usr/bin/env bash
set -euo pipefail

for bin in docker curl; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "required command '$bin' not found in PATH" >&2
    exit 1
  fi
done

pg_isready_bin=""
if command -v pg_isready >/dev/null 2>&1; then
  pg_isready_bin="$(command -v pg_isready)"
fi

psql_bin=""
if command -v psql >/dev/null 2>&1; then
  psql_bin="$(command -v psql)"
fi

lane="${1:?lane}"; cmd="${2:?start|stop|restart|db-only|db-health|health|status}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
compose="$root/ops/supabase/docker-compose.yml"
repo_envfile="$root/ops/supabase/lanes/${lane}.env"
credentials_file="$root/ops/supabase/lanes/credentials.env"

if [[ ! -f "$repo_envfile" ]]; then
  echo "lane env file $repo_envfile missing; run scripts/supabase/provision_lane_env.sh $lane --pg-password <password>" >&2
  exit 1
fi

if [[ ! -f "$credentials_file" ]]; then
  echo "credentials file $credentials_file missing; populate it with ${lane^^}_PG_PASSWORD before continuing." >&2
  exit 1
fi

envfile_source="$repo_envfile"

cleanup_envfiles=()
cleanup() {
  local file
  for file in "${cleanup_envfiles[@]}"; do
    [[ -f "$file" ]] && rm -f "$file"
  done
}
trap cleanup EXIT

lane_upper="${lane^^}"
# shellcheck disable=SC1090
source "$credentials_file"

credentials_pg_password_var="${lane_upper}_PG_PASSWORD"
credentials_super_role_var="${lane_upper}_SUPER_ROLE"
credentials_super_password_var="${lane_upper}_SUPER_PASSWORD"

injected_pg_password="${!credentials_pg_password_var:-}"
injected_super_role="${!credentials_super_role_var:-}" 
injected_super_password="${!credentials_super_password_var:-}"

if [[ -z "$injected_pg_password" ]]; then
  echo "${credentials_pg_password_var} missing in $credentials_file; cannot continue." >&2
  exit 1
fi

if [[ -z "$injected_super_role" ]]; then
  injected_super_role="supabase_admin"
fi
if [[ "$injected_super_role" == supabase_admin_${lane} ]]; then
  injected_super_role="supabase_admin"
fi

if [[ -z "$injected_super_password" ]]; then
  echo "${credentials_super_password_var} missing in $credentials_file; cannot continue." >&2
  exit 1
fi

prepare_envfile() {
  local src="$1"
  local tmp

  mapfile -t env_lines <"$src"

  local pg_port="" host_port="" host_index=-1
  local idx line
  for idx in "${!env_lines[@]}"; do
    line="${env_lines[$idx]}"
    case "$line" in
      PGPORT=*)
        pg_port="${line#PGPORT=}"
        ;;
      PGHOST_PORT=*)
        host_port="${line#PGHOST_PORT=}"
        host_index=$idx
        ;;
    esac
  done

  if [[ -z "$pg_port" ]]; then
    pg_port="5432"
  fi
  if [[ -z "$host_port" ]]; then
    host_port="$pg_port"
  fi

  local new_lines=()
  for line in "${env_lines[@]}"; do
    case "$line" in
      PGPORT=*)
        new_lines+=("PGPORT=5432")
        ;;
      PGHOST_PORT=*)
        local new_line="PGHOST_PORT=${host_port}"
        new_lines+=("$new_line")
        ;;
      PGPASSWORD=*|SUPABASE_SUPER_PASSWORD=*|SUPABASE_SUPER_ROLE=*)
        ;;
      *)
        new_lines+=("$line")
        ;;
    esac
  done

  if (( host_index < 0 )); then
    local insert_index=-1
    for idx in "${!new_lines[@]}"; do
      if [[ "${new_lines[$idx]}" == PGDATABASE=* ]]; then
        insert_index=$((idx + 1))
        break
      fi
    done
    if (( insert_index >= 0 )); then
      new_lines=("${new_lines[@]:0:$insert_index}" "PGHOST_PORT=${host_port}" "${new_lines[@]:$insert_index}")
    else
      new_lines+=("PGHOST_PORT=${host_port}")
    fi
  fi

  tmp="$(mktemp)"
  cleanup_envfiles+=("$tmp")
  {
    for line in "${new_lines[@]}"; do
      printf '%s\n' "$line"
    done
    printf 'PGPASSWORD=%s\n' "$injected_pg_password"
    printf 'SUPABASE_SUPER_ROLE=%s\n' "$injected_super_role"
    printf 'SUPABASE_SUPER_PASSWORD=%s\n' "$injected_super_password"
  } >"$tmp"

  echo "$tmp"
}

envfile="$(prepare_envfile "$repo_envfile")"
echo "ℹ️  Prepared ephemeral env file for Supabase lane '$lane' (source: $envfile_source, credentials: $credentials_file)" >&2

export ENV_FILE="$envfile"
# shellcheck disable=SC1090
set -a; source "$envfile"; set +a
compose_cmd=(docker compose --env-file "$envfile" -f "$compose")

pg_host_port="${PGHOST_PORT:-${PGPORT:-5432}}"
export PGHOST_PORT="$pg_host_port"
export PGPORT="${PGPORT:-5432}"

local_pg_host="127.0.0.1"
if [[ ${PGHOST:-} == "localhost" || ${PGHOST:-} == "127.0.0.1" ]]; then
  local_pg_host="$PGHOST"
fi

super_role="${SUPABASE_SUPER_ROLE:-${PGUSER:-}}"
if [[ "$super_role" == supabase_admin_${lane} ]]; then
  super_role="supabase_admin"
fi
super_password="${SUPABASE_SUPER_PASSWORD:-}"

pg_probe_last_origin=""
pg_probe_last_status=1
pg_probe_last_output=""
pg_probe_last_host_status=""
pg_probe_last_host_output=""
pg_probe_last_host_attempted=0

indent_lines() {
  local prefix="$1"
  while IFS= read -r line; do
    printf '%s%s\n' "$prefix" "$line"
  done
}

warn_superuser_config() {
  cat >&2 <<MSG
⚠️  Unable to connect with the configured Supabase superuser credentials for lane '$lane'.
   Provide the correct values with:
     scripts/supabase/provision_lane_env.sh $lane \\
       --pg-super-role <role> --pg-super-password <password>
   See docs/SUPABASE_SETUP.md#restore-existing-superusers for recovery steps on reused volumes.
MSG
}

run_pg_isready_host() {
  local user="$1"
  local password="$2"

  if [[ -z "$user" ]]; then
    pg_probe_last_origin="host"
    pg_probe_last_status=1
    pg_probe_last_output="missing Postgres role name"
    pg_probe_last_host_status=1
    pg_probe_last_host_output="$pg_probe_last_output"
    return 1
  fi

  if [[ -z "$pg_isready_bin" ]]; then
    pg_probe_last_origin="host"
    pg_probe_last_status=127
    pg_probe_last_output="pg_isready not found on host PATH"
    pg_probe_last_host_status=127
    pg_probe_last_host_output="$pg_probe_last_output"
    return 127
  fi

  local cmd=("$pg_isready_bin" -h "$local_pg_host" -p "$pg_host_port" -d "$PGDATABASE" -U "$user")
  local output status
  set +e
  if [[ -n "$password" ]]; then
    output=$(PGPASSWORD="$password" "${cmd[@]}" 2>&1)
    status=$?
  else
    output=$("${cmd[@]}" 2>&1)
    status=$?
  fi
  set -e
  pg_probe_last_origin="host"
  pg_probe_last_status=$status
  pg_probe_last_output="$output"
  pg_probe_last_host_status=$status
  pg_probe_last_host_output="$output"
  printf '%s' "$output"
  return "$status"
}

run_pg_isready_inside() {
  local user="$1"
  local password="$2"
  local database="${3:-$PGDATABASE}"
  local host="${4:-/var/run/postgresql}"
  local port="${5:-5432}"

  if [[ -z "$user" ]]; then
    pg_probe_last_origin="container"
    pg_probe_last_status=1
    pg_probe_last_output="missing Postgres role name"
    return 1
  fi

  local exec_cmd=("${compose_cmd[@]}" exec -T db)
  if [[ -n "$password" ]]; then
    exec_cmd+=(env PGPASSWORD="$password")
  fi
  exec_cmd+=(pg_isready -h "$host" -p "$port" -d "$database" -U "$user")
  local output status
  set +e
  output=$("${exec_cmd[@]}" 2>&1)
  status=$?
  set -e
  pg_probe_last_origin="container"
  pg_probe_last_status=$status
  pg_probe_last_output="$output"
  printf '%s' "$output"
  return "$status"
}

run_pg_isready() {
  local user="$1"
  local password="$2"

  if [[ -z "$user" ]]; then
    return 1
  fi

  if [[ -n "$pg_isready_bin" ]]; then
    local status
    if run_pg_isready_host "$user" "$password"; then
      return 0
    else
      status=$?
      if [[ $status -ne 127 ]]; then
        return $status
      fi
    fi
  fi

  run_pg_isready_inside "$user" "$password"
}

run_psql_login_host() {
  local user="$1"
  local password="$2"

  if [[ -z "$user" ]]; then
    pg_probe_last_origin="host-login"
    pg_probe_last_status=1
    pg_probe_last_output="missing Postgres role name"
    pg_probe_last_host_status=1
    pg_probe_last_host_output="$pg_probe_last_output"
    return 1
  fi

  if [[ -z "$psql_bin" ]]; then
    pg_probe_last_origin="host-login"
    pg_probe_last_status=127
    pg_probe_last_output="psql not found on host PATH"
    pg_probe_last_host_status=127
    pg_probe_last_host_output="$pg_probe_last_output"
    return 127
  fi

  local cmd=("$psql_bin" -v ON_ERROR_STOP=1 -h "$local_pg_host" -p "$pg_host_port" -d "$PGDATABASE" -U "$user" -c "SELECT 1")
  local output status
  set +e
  if [[ -n "$password" ]]; then
    output=$(PGPASSWORD="$password" "${cmd[@]}" 2>&1)
    status=$?
  else
    output=$("${cmd[@]}" 2>&1)
    status=$?
  fi
  set -e

  pg_probe_last_origin="host-login"
  pg_probe_last_status=$status
  pg_probe_last_output="$output"
  pg_probe_last_host_status=$status
  pg_probe_last_host_output="$output"
  printf '%s' "$output"
  return "$status"
}

run_psql_login_inside() {
  local user="$1"
  local password="$2"
  local database="${3:-$PGDATABASE}"
  local host="${4:-/var/run/postgresql}"
  local port="${5:-5432}"

  if [[ -z "$user" ]]; then
    pg_probe_last_origin="container-login"
    pg_probe_last_status=1
    pg_probe_last_output="missing Postgres role name"
    return 1
  fi

  local exec_cmd=("${compose_cmd[@]}" exec -T db)
  if [[ -n "$password" ]]; then
    exec_cmd+=(env PGPASSWORD="$password")
  fi
  exec_cmd+=(psql -v ON_ERROR_STOP=1 -h "$host" -p "$port" -d "$database" -U "$user" -c "SELECT 1")

  local output status
  set +e
  output=$("${exec_cmd[@]}" 2>&1)
  status=$?
  set -e

  pg_probe_last_origin="container-login"
  pg_probe_last_status=$status
  pg_probe_last_output="$output"
  printf '%s' "$output"
  return "$status"
}

check_pg_login() {
  local user="$1"
  local password="$2"
  local host_status=127
  local host_failed=0

  if [[ -z "$user" ]]; then
    return 1
  fi

  pg_probe_last_host_attempted=0

  if [[ -n "$psql_bin" ]]; then
    pg_probe_last_host_attempted=1
    local status
    if run_psql_login_host "$user" "$password"; then
      return 0
    fi
    status=$?
    host_status=$status
    if [[ $status -ne 127 ]]; then
      host_failed=1
    else
      pg_probe_last_host_attempted=0
    fi
  fi

  if run_psql_login_inside "$user" "$password"; then
    if (( pg_probe_last_host_attempted == 0 )); then
      pg_probe_last_host_status=0
      pg_probe_last_host_output="$pg_probe_last_output"
      return 0
    fi
    if (( host_failed )); then
      return "$host_status"
    fi
    return 0
  fi

  local inside_status=$?
  if (( pg_probe_last_host_attempted == 0 )); then
    pg_probe_last_host_status=$inside_status
    pg_probe_last_host_output="$pg_probe_last_output"
    return "$inside_status"
  fi

  if (( host_failed )); then
    return "$host_status"
  fi

  return "$inside_status"
}

wait_for_user() {
  local user="$1"
  local password="$2"
  local attempts="${3:-30}"
  local delay="${4:-2}"
  local last_login_status=""

  if [[ -z "$user" ]]; then
    return 1
  fi

  local i login_status
  for ((i = 1; i <= attempts; i++)); do
    if run_pg_isready "$user" "$password" >/dev/null 2>&1; then
      check_pg_login "$user" "$password" >/dev/null 2>&1
      login_status=$?
      if [[ $login_status -eq 0 ]]; then
        return 0
      fi
      last_login_status=$login_status
    fi
    sleep "$delay"
  done

  if run_pg_isready "$user" "$password" >/dev/null 2>&1; then
    check_pg_login "$user" "$password" >/dev/null 2>&1
    login_status=$?
    if [[ $login_status -eq 0 ]]; then
      return 0
    fi
    last_login_status=$login_status
    return "$login_status"
  fi

  if [[ -n "$last_login_status" ]]; then
    return "$last_login_status"
  fi

  return "${pg_probe_last_status:-1}"
}

should_attempt_credential_repair() {
  if [[ -z "$super_role" || -z "$super_password" ]]; then
    return 1
  fi

  local status output lower host_attempted
  host_attempted="${pg_probe_last_host_attempted:-0}"

  if [[ "$host_attempted" -eq 1 ]]; then
    status="${pg_probe_last_host_status:-}"
    output="${pg_probe_last_host_output:-}"
  else
    status="${pg_probe_last_status:-}"
    output="${pg_probe_last_output:-}"
  fi

  if [[ -z "$status" || "$status" -eq 0 || "$status" -eq 127 ]]; then
    return 1
  fi

  if [[ -z "$output" ]]; then
    return 1
  fi

  lower="${output,,}"
  if [[ "$lower" == *"authentication"* || "$lower" == *"password"* || "$lower" == *"role"* ]]; then
    return 0
  fi

  return 1
}

wait_for_superuser_inside() {
  local attempts="${1:-30}"
  local delay="${2:-2}"

  local i
  for ((i = 1; i <= attempts; i++)); do
    if run_pg_isready_inside supabase_admin "" postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done

  run_pg_isready_inside supabase_admin "" postgres >/dev/null 2>&1
}

repair_credentials() {
  local attempts="${1:-30}"
  local delay="${2:-2}"

  if [[ -z "$super_role" || -z "$super_password" ]]; then
    warn_superuser_config
    return 2
  fi

  wait_for_superuser_inside "$attempts" "$delay" || true

  local escaped_super_role escaped_super_password escaped_lane_role escaped_lane_password
  escaped_super_role="$(printf "%s" "$super_role" | sed "s/'/''/g")"
  escaped_super_password="$(printf "%s" "$super_password" | sed "s/'/''/g")"
  escaped_lane_role="$(printf "%s" "$PGUSER" | sed "s/'/''/g")"
  escaped_lane_password="$(printf "%s" "$PGPASSWORD" | sed "s/'/''/g")"

  repair_credentials_secret_status() {
    local value="$1"
    if [[ -z "$value" ]]; then
      printf '<empty>'
    else
      printf 'length=%d' "${#value}"
    fi
  }

  {
    echo "Attempting Supabase credential repair for lane '$lane':"
    echo "  super role...........: $super_role"
    echo "  super password status: $(repair_credentials_secret_status "$super_password")"
    echo "  lane role............: $PGUSER"
    echo "  lane password status.: $(repair_credentials_secret_status "$PGPASSWORD")"
  } >&2

  local sql
  sql=$(cat <<SQL
DO $$
DECLARE
  v_super_role text := nullif('${escaped_super_role}', '');
  v_super_password text := nullif('${escaped_super_password}', '');
  v_lane_role text := nullif('${escaped_lane_role}', '');
  v_lane_password text := nullif('${escaped_lane_password}', '');
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
)

  local psql_output
  if ! psql_output=$(env PGPASSWORD="$super_password" "${compose_cmd[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "$sql" 2>&1); then
    echo "❌ Supabase credential repair failed for lane '$lane'." >&2
    echo "   Command: docker compose exec -T db psql -U supabase_admin -d postgres" >&2
    echo "   Output:" >&2
    printf '%s\n' "$psql_output" | indent_lines '     ' >&2
    warn_superuser_config
    return 2
  fi

  printf '%s\n' "$psql_output" | indent_lines '   ' >&2
  echo "✅ Supabase credentials repaired for lane '$lane'" >&2

  return 0
}

ensure_lane_role() {
  local attempts="${1:-30}"
  local delay="${2:-2}"

  if wait_for_user "$PGUSER" "$PGPASSWORD" "$attempts" "$delay" >/dev/null 2>&1; then
    return 0
  fi

  if should_attempt_credential_repair; then
    echo "Detected authentication failure for lane role '$PGUSER'; attempting credential repair." >&2
    if ! repair_credentials "$attempts" "$delay"; then
      return 2
    fi

    wait_for_user "$PGUSER" "$PGPASSWORD" "$attempts" "$delay"
  else
    return 2
  fi
}

wait_for_pg() {
  local attempts="${1:-30}"
  local delay="${2:-2}"

  echo "Waiting for Postgres for lane '$lane' on ${local_pg_host}:${pg_host_port} (user: ${PGUSER})" >&2

  if ! ensure_lane_role "$attempts" "$delay"; then
    return 2
  fi

  wait_for_user "$PGUSER" "$PGPASSWORD" "$attempts" "$delay"
}

diagnose_pg_failure() {
  local context="$1"

  {
    echo "❌ [$context] Unable to connect to Postgres for Supabase lane '$lane'."
    echo "   Host: ${local_pg_host}  Port: ${pg_host_port:-<unset>} (container: ${PGPORT:-<unset>})  Database: ${PGDATABASE:-<unset>}  Role: ${PGUSER:-<unset>}"
    if [[ -n "$pg_probe_last_host_output" ]]; then
      echo "   Last host pg_isready exit code ${pg_probe_last_host_status:-?}:"
      printf '%s\n' "$pg_probe_last_host_output" | indent_lines '      '
    elif [[ -n "$pg_probe_last_output" ]]; then
      echo "   Last pg_isready attempt (${pg_probe_last_origin:-unknown}) exit code ${pg_probe_last_status:-?}:"
      printf '%s\n' "$pg_probe_last_output" | indent_lines '      '
    fi
    if [[ -n "$envfile_source" ]]; then
      if [[ "$envfile" != "$envfile_source" ]]; then
        echo "   Env file: $envfile_source (normalized copy: $envfile)"
      else
        echo "   Env file: $envfile"
      fi
    fi
    if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
      echo "   Compose project: ${COMPOSE_PROJECT_NAME}"
    fi
  } >&2

  ("${compose_cmd[@]}" ps >&2) || true

  local port_info
  port_info=$("${compose_cmd[@]}" port db 5432 2>/dev/null || true)
  if [[ -n "$port_info" ]]; then
    echo "   Published db port: $port_info" >&2
  fi

  local container_name
  container_name="${COMPOSE_PROJECT_NAME:-supa-${lane}}-db-1"
  if docker ps --format '{{.Names}}' --filter "name=${container_name}" | grep -q "${container_name}"; then
    docker ps --filter "name=${container_name}" --format '   Container {{.Names}}: {{.Status}} (ports: {{.Ports}})' >&2 || true
    docker inspect -f '   Network mode: {{.HostConfig.NetworkMode}}' "$container_name" >&2 || true
    docker inspect -f '   Port bindings: {{json .NetworkSettings.Ports}}' "$container_name" >&2 || true
    echo "---- recent db logs (${container_name}) ----" >&2
    docker logs --tail 60 "$container_name" >&2 || true
    echo "---- end db logs ----" >&2
  else
    echo "   Container ${container_name} not found for diagnostics." >&2
  fi
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
      diagnose_pg_failure "wait_for_pg"
      exit 2
    fi
    if ! check_pg_login "$PGUSER" "$PGPASSWORD"; then
      diagnose_pg_failure "db-health"
      exit 2
    fi
    ;;
  restart)
    "${compose_cmd[@]}" down
    "${compose_cmd[@]}" up -d
    ;;
  health)
    if ! wait_for_pg; then
      diagnose_pg_failure "wait_for_pg"
      exit 2
    fi
    if ! check_pg_login "$PGUSER" "$PGPASSWORD"; then
      diagnose_pg_failure "health"
      exit 2
    fi
    curl -fsS "http://127.0.0.1:${KONG_HTTP_PORT}/" >/dev/null
    ;;
  status)
    if ! "${compose_cmd[@]}" ps >/dev/null 2>&1; then
      exit 1
    fi
    if command -v jq >/dev/null 2>&1; then
      ps_json=""
      if ps_json=$("${compose_cmd[@]}" ps --format json 2>/dev/null); then
        if [[ -z "$ps_json" ]]; then
          echo "ℹ️  docker compose ps --format json returned no data; falling back to text parsing." >&2
        elif [[ "$ps_json" =~ ^[[:space:]]*[\{\[] ]]; then
          services_json=""
          jq_err_file="$(mktemp)"
          cleanup_envfiles+=("$jq_err_file")
          if ! services_json=$(jq -ec '
            if type=="array" then
              .
            elif type=="object" then
              if has("Services") then
                (.Services // [])
              elif has("Service") then
                [.] # docker compose v2.30+ may emit a single service object
              else
                error("compose ps output is not an array of services")
              end
            else
              error("compose ps output is not an array of services")
            end
          ' <<<"$ps_json" 2>"$jq_err_file"); then
            echo "docker compose ps --format json produced unexpected payload; aborting status check." >&2
            if [[ -s "$jq_err_file" ]]; then
              echo "  jq error:" >&2
              indent_lines "    " <"$jq_err_file" >&2
            fi
            if [[ -n "${ps_json//[[:space:]]/}" ]]; then
              echo "  raw payload preview (first 400 chars):" >&2
              payload_preview="$ps_json"
              if (( ${#payload_preview} > 400 )); then
                payload_preview="${payload_preview:0:400}…"
              fi
              printf '%s\n' "$payload_preview" | indent_lines "    " >&2
            else
              echo "  raw payload was empty" >&2
            fi
            exit 1
          fi

          missing=0
          for svc in db kong; do
            if ! jq -e --arg svc "$svc" 'any(.[]; (.Service // "") == $svc and (((.State // "") | ascii_downcase | startswith("running")) or ((.State // "") | ascii_downcase | startswith("up"))))' <<<"$services_json" >/dev/null; then
              missing=1
              break
            fi
          done
          if [[ $missing -eq 0 ]]; then
            exit 0
          fi
        else
          if [[ -n "${ps_json//[[:space:]]/}" ]]; then
            echo "ℹ️  docker compose ps --format json returned non-JSON output; falling back to text parsing." >&2
          fi
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
