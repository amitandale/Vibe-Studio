#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: validate_lane_env.sh <lane>" >&2
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" || $# -eq 0 ]]; then
  usage
  if [[ $# -eq 0 ]]; then
    exit 1
  fi
  exit 0
fi

lane="$1"
case "$lane" in
  main|work|codex) ;;
  *)
    echo "invalid lane '$lane' (expected main, work, codex)" >&2
    exit 2
    ;;
esac

root="$(cd "$(dirname "$0")/../.." && pwd)"
env_file="$root/ops/supabase/lanes/${lane}.env"
credentials_file="$root/ops/supabase/lanes/credentials.env"
official_docker_dir="$root/ops/supabase/lanes/latest-docker"
official_compose="$official_docker_dir/docker-compose.yml"
lib_env_helpers="$root/scripts/supabase/lib/env.sh"

fail() {
  echo "❌ $1" >&2
  if [[ -n ${2:-} ]]; then
    echo "   → $2" >&2
  fi
  exit 1
}

if [[ ! -f "$env_file" ]]; then
  fail "Lane environment file $env_file not found." "Run scripts/supabase/provision_lane_env.sh $lane on the runner."
fi

if [[ ! -s "$env_file" ]]; then
  fail "Lane environment file $env_file is empty." "Regenerate it with scripts/supabase/provision_lane_env.sh $lane."
fi

if [[ ! -d "$official_docker_dir" ]]; then
  fail "Supabase docker assets missing at $official_docker_dir." "Fetch the docker directory from the Supabase repository before validating."
fi

if [[ ! -f "$official_compose" ]]; then
  fail "Supabase compose definition missing at $official_compose." "Re-fetch the docker directory from Supabase."
fi

if grep -q '{{' "$env_file"; then
  fail "Lane environment file still contains template placeholders." "Replace all {{PLACEHOLDER}} entries with real values."
fi

# shellcheck disable=SC1090
set -a; source "$env_file"; set +a

if [[ ! -f "$credentials_file" ]]; then
  fail "Credentials file $credentials_file not found." "Populate ops/supabase/lanes/credentials.env with lane secrets."
fi

if ! command -v python3 >/dev/null 2>&1; then
  fail "python3 is required to validate SUPABASE_DB_URL." "Install python3 on the runner."
fi

if [[ ! -f "$lib_env_helpers" ]]; then
  fail "Supabase env helper missing at $lib_env_helpers." "Ensure the repository is up to date."
fi

# shellcheck disable=SC1090
source "$lib_env_helpers"

lane_upper="${lane^^}"
# shellcheck disable=SC1090
source "$credentials_file"

pg_password_var="${lane_upper}_PG_PASSWORD"
super_role_var="${lane_upper}_SUPER_ROLE"
super_password_var="${lane_upper}_SUPER_PASSWORD"

pg_password="${!pg_password_var:-}"
if [[ -z "$pg_password" ]]; then
  fail "${pg_password_var} missing in credentials file." "Add the password to ops/supabase/lanes/credentials.env."
fi

super_role="${!super_role_var:-supabase_admin}"
if [[ "$super_role" == supabase_admin_${lane} ]]; then
  super_role="supabase_admin"
fi

super_password="${!super_password_var:-}"
if [[ -z "$super_password" ]]; then
  echo "⚠️  ${super_password_var} missing in credentials file; continuing under passwordless mode." >&2
fi

compose_base_args=(
  docker compose
  --project-directory "$official_docker_dir"
  --env-file "$env_file"
  -f "$official_compose"
)

compose_db_args=("${compose_base_args[@]}" --profile db-only)

attempt_supabase_permission_repair() {
  if [[ "${SUPABASE_SKIP_PERMISSION_REPAIR:-}" == "1" ]]; then
    echo "⚠️  Automatic Supabase permission repair explicitly disabled via SUPABASE_SKIP_PERMISSION_REPAIR=1." >&2
    return 1
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "⚠️  Docker CLI not available; cannot attempt Supabase permission repair automatically." >&2
    return 1
  fi

  echo "ℹ️  Attempting automatic Supabase Postgres permission repair." >&2

  local output status

  set +e
  output=$("${compose_db_args[@]}" up -d db 2>&1)
  status=$?
  set -e
  if (( status != 0 )); then
    echo "❌ Failed to start Supabase db container for permission repair." >&2
    [[ -n "$output" ]] && printf '%s\n' "$output" >&2
    return "$status"
  fi

  set +e
  output=$("${compose_db_args[@]}" exec -T db chown -R postgres:postgres /var/lib/postgresql/data 2>&1)
  status=$?
  set -e
  if (( status != 0 )); then
    echo "❌ Unable to reset Supabase Postgres data directory ownership automatically." >&2
    [[ -n "$output" ]] && printf '%s\n' "$output" >&2
    return "$status"
  fi

  local desired_password="${super_password:-}" sql escaped_password
  if [[ -z "$desired_password" ]]; then
    desired_password="$pg_password"
  fi

  if [[ -n "$desired_password" ]]; then
    local readiness_attempt=0
    local readiness_status=1
    local readiness_output=""
    while (( readiness_attempt < 15 )); do
      set +e
      readiness_output=$("${compose_db_args[@]}" exec -T db pg_isready -h 127.0.0.1 -p "${POSTGRES_PORT:-5432}" -d postgres -U postgres 2>&1)
      readiness_status=$?
      set -e
      if (( readiness_status == 0 )); then
        break
      fi
      sleep 2
      ((readiness_attempt++))
    done

    if (( readiness_status != 0 )); then
      echo "❌ Postgres never became ready to reset the Supabase superuser password." >&2
      if [[ -n "$readiness_output" ]]; then
        printf '    %s\n' "$readiness_output" >&2
      fi
      return "$readiness_status"
    fi

    if ! escaped_password=$(python3 - "$desired_password" <<'PY'
import sys
value = sys.argv[1]
print(value.replace("'", "''"))
PY
); then
      echo "⚠️  Unable to prepare password for Supabase permission repair; skipping password reset." >&2
    else
      sql="ALTER ROLE \"${super_role}\" WITH PASSWORD '${escaped_password}';"
      set +e
      output=$("${compose_db_args[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)
      status=$?
      set -e
      if (( status != 0 )); then
        if [[ "$output" =~ [Rr]eserved[[:space:]]+[Rr]ole ]]; then
          echo "⚠️  Supabase refused to reset password for reserved role '${super_role}'; continuing with repaired permissions." >&2
          [[ -n "$output" ]] && printf '%s\n' "$output" >&2
        else
          echo "❌ Failed to align Supabase superuser password with stored credentials during automatic repair." >&2
          [[ -n "$output" ]] && printf '%s\n' "$output" >&2
          return "$status"
        fi
      fi
    fi
  fi

  set +e
  output=$("${compose_db_args[@]}" restart db 2>&1)
  status=$?
  set -e
  if (( status != 0 )); then
    echo "⚠️  Supabase db restart after permission repair exited with status $status." >&2
    [[ -n "$output" ]] && printf '%s\n' "$output" >&2
  fi

  local attempts=0
  local pg_ready_status=1
  local pg_ready_output=""
  while (( attempts < 10 )); do
    set +e
    pg_ready_output=$("${compose_db_args[@]}" exec -T db pg_isready -h 127.0.0.1 -p "${POSTGRES_PORT:-5432}" -d "$PGDATABASE" -U postgres 2>&1)
    pg_ready_status=$?
    set -e
    if (( pg_ready_status == 0 )); then
      break
    fi
    sleep 2
    ((attempts++))
  done

  if (( pg_ready_status != 0 )); then
    echo "⚠️  Postgres did not report ready after automatic repair attempts." >&2
    if [[ -n "$pg_ready_output" ]]; then
      printf '    %s\n' "$pg_ready_output" >&2
    fi
  fi

  echo "ℹ️  Automatic Supabase permission repair completed." >&2
  return 0
}

attempt_supabase_password_realign() {
  if [[ "${SUPABASE_SKIP_DB_RESET:-}" == "1" ]]; then
    echo "⚠️  Automatic Supabase database reset disabled via SUPABASE_SKIP_DB_RESET=1." >&2
    return 1
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "⚠️  Docker CLI not available; cannot reset Supabase database volume automatically." >&2
    return 1
  fi

  echo "ℹ️  Attempting automatic Supabase database reset to realign credentials." >&2

  local output status

  set +e
  output=$("${compose_db_args[@]}" down --volumes --remove-orphans 2>&1)
  status=$?
  set -e
  if (( status != 0 )); then
    echo "❌ Failed to stop Supabase db stack while resetting credentials." >&2
    [[ -n "$output" ]] && printf '%s\n' "$output" >&2
    return "$status"
  fi

  set +e
  output=$("${compose_db_args[@]}" up -d db 2>&1)
  status=$?
  set -e
  if (( status != 0 )); then
    echo "❌ Unable to start Supabase db container after resetting credentials." >&2
    [[ -n "$output" ]] && printf '%s\n' "$output" >&2
    return "$status"
  fi

  local attempts=0
  local readiness_status=1
  local readiness_output=""
  while (( attempts < 20 )); do
    set +e
    readiness_output=$("${compose_db_args[@]}" exec -T db pg_isready -h 127.0.0.1 -p "${POSTGRES_PORT:-5432}" -d "$PGDATABASE" -U postgres 2>&1)
    readiness_status=$?
    set -e
    if (( readiness_status == 0 )); then
      break
    fi
    sleep 3
    ((attempts++))
  done

  if (( readiness_status != 0 )); then
    echo "❌ Postgres did not become ready after resetting the database volume." >&2
    if [[ -n "$readiness_output" ]]; then
      printf '    %s\n' "$readiness_output" >&2
    fi
    return "$readiness_status"
  fi

  echo "ℹ️  Supabase database reset completed; credentials now reflect the lane environment file." >&2
  return 0
}

run_supabase_cli_dry_run() {
  local db_probe_state="unknown"
  local db_probe_method=""
  local db_probe_details=""

  if [[ -n "${PGHOST:-}" && -n "${PGPORT:-}" ]]; then
    if command -v pg_isready >/dev/null 2>&1; then
      db_probe_method="pg_isready"
      set +e
      local pg_isready_output
      pg_isready_output=$(pg_isready -h "$PGHOST" -p "$PGPORT" -U "${PGUSER:-postgres}" 2>&1)
      local pg_isready_status=$?
      set -e
      if (( pg_isready_status == 0 )); then
        db_probe_state="online"
      else
        db_probe_state="offline"
        db_probe_details="$pg_isready_output"
      fi
    else
      db_probe_method="python-socket"
      set +e
      local python_output
      python_output=$(python3 - "$PGHOST" "$PGPORT" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.settimeout(3)
    try:
        sock.connect((host, port))
    except OSError as exc:
        print(f"tcp connection failed: {exc}", file=sys.stderr)
        sys.exit(1)
sys.exit(0)
PY
)
      local python_status=$?
      set -e
      if (( python_status == 0 )); then
        db_probe_state="online"
      else
        db_probe_state="offline"
        db_probe_details="$python_output"
      fi
    fi
  fi

  if [[ "$db_probe_state" == "offline" ]]; then
    echo "⚠️  Skipping supabase db push dry-run because ${PGHOST}:${PGPORT} is unreachable via ${db_probe_method:-no probe}." >&2
    if [[ -n "${db_probe_details:-}" ]]; then
      while IFS= read -r line; do
        echo "    ${line}" >&2
      done <<<"${db_probe_details}"
    fi
    return 0
  fi

  if [[ "$db_probe_state" == "online" ]]; then
    echo "ℹ️  Running supabase db push dry-run (Postgres reachable via ${db_probe_method})." >&2
  else
    echo "ℹ️  Running supabase db push dry-run (Postgres availability probe unavailable)." >&2
  fi

  local cli_db_url_value="${SUPABASE_CLI_DB_URL:-$SUPABASE_DB_URL}"
  local cli_db_url_label="SUPABASE_DB_URL"
  if [[ -n "${SUPABASE_CLI_DB_URL:-}" ]]; then
    cli_db_url_label="SUPABASE_CLI_DB_URL"
  fi

  echo "ℹ️  ${cli_db_url_label}=${cli_db_url_value}" >&2
  echo "ℹ️  Streaming Supabase CLI dry-run output below." >&2

  local permission_repair_attempted=false
  local password_realign_attempted=false

  while true; do
    local supabase_log_tmp
    supabase_log_tmp="$(mktemp -t supabase-dry-run-XXXXXX)"
    set +e
    PGSSLMODE="${PGSSLMODE:-disable}" supabase db push --db-url "$cli_db_url_value" --dry-run |& tee "$supabase_log_tmp" >&2
    local supabase_status=${PIPESTATUS[0]}
    set -e

    if (( supabase_status == 0 )); then
      rm -f "$supabase_log_tmp"
      break
    fi

    if [[ ! -s "$supabase_log_tmp" ]]; then
      echo "‼️  Supabase CLI produced no output." >&2
    fi

    local permission_issue_detected=false
    local password_issue_detected=false
    if grep -qi 'tls error' "$supabase_log_tmp"; then
      echo "‼️  Supabase CLI reported a TLS handshake failure." >&2
      echo "    Ensure ${cli_db_url_label} includes '?sslmode=disable' and that the Postgres instance accepts non-TLS connections." >&2
      echo "    If the lane runs inside Docker, confirm the 'supabase-db' volume ownership and credentials match the lane secrets." >&2
    fi

    if grep -qi 'pg_filenode.map' "$supabase_log_tmp" || grep -qi 'permission denied' "$supabase_log_tmp"; then
      permission_issue_detected=true
      echo "️  Supabase CLI could not read Postgres data files due to permission issues." >&2
    fi

    if grep -qi 'password authentication failed' "$supabase_log_tmp"; then
      password_issue_detected=true
      echo "‼️  Supabase CLI reported password authentication failure for the lane database user." >&2
      echo "    Lane secrets may not match the Postgres role passwords; attempting automated recovery." >&2
    fi

    if [[ "$permission_issue_detected" == true && "$permission_repair_attempted" == false ]]; then
      if attempt_supabase_permission_repair; then
        echo "ℹ️  Retrying supabase db push dry-run after automatic permission repair." >&2
        permission_repair_attempted=true
        rm -f "$supabase_log_tmp"
        continue
      else
        echo "‼️  Automatic Supabase permission repair attempt failed; manual intervention required." >&2
      fi
    fi

    if [[ "$permission_issue_detected" == true && "$permission_repair_attempted" == true ]]; then
      echo "‼️  Automatic Supabase permission repair already attempted; skipping additional retries." >&2
    fi

    if [[ "$password_issue_detected" == true && "$password_realign_attempted" == false ]]; then
      if attempt_supabase_password_realign; then
        echo "ℹ️  Retrying supabase db push dry-run after automatic credential realignment." >&2
        password_realign_attempted=true
        rm -f "$supabase_log_tmp"
        continue
      else
        echo "‼️  Automatic Supabase database reset failed; manual intervention required." >&2
      fi
    fi

    if [[ "$password_issue_detected" == true && "$password_realign_attempted" == true ]]; then
      echo "‼️  Automatic Supabase database reset already attempted; skipping additional retries." >&2
    fi

    rm -f "$supabase_log_tmp"
    echo "‼️  Supabase CLI dry-run failed with exit code ${supabase_status}; see output above." >&2
    fail "supabase db push --dry-run failed for lane '$lane' (exit code ${supabase_status})." "Review the Supabase CLI error output above."
  done
}

required_vars=(
  COMPOSE_PROJECT_NAME
  LANE
  VOL_NS
  PGHOST
  PGPORT
  PGHOST_PORT
  PGDATABASE
  PGUSER
  SUPABASE_SUPER_ROLE
  POSTGRES_HOST
  POSTGRES_PORT
  POSTGRES_DB
  POSTGRES_PASSWORD
  PG_META_CRYPTO_KEY
  PGRST_DB_SCHEMAS
  FUNCTIONS_VERIFY_JWT
  JWT_SECRET
  ANON_KEY
  SERVICE_ROLE_KEY
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_KEY
  JWT_EXPIRY
  KONG_HTTP_PORT
  KONG_HTTPS_PORT
  EDGE_PORT
  EDGE_ENV_FILE
  SITE_URL
  SUPABASE_PUBLIC_URL
  SUPABASE_URL
  API_EXTERNAL_URL
  DOCKER_SOCKET_LOCATION
  LOGFLARE_PUBLIC_ACCESS_TOKEN
  LOGFLARE_PRIVATE_ACCESS_TOKEN
  VAULT_ENC_KEY
  SECRET_KEY_BASE
  POOLER_TENANT_ID
  POOLER_MAX_CLIENT_CONN
  POOLER_DB_POOL_SIZE
  POOLER_DEFAULT_POOL_SIZE
  POOLER_PROXY_PORT_TRANSACTION
  SMTP_HOST
  SMTP_PORT
  SMTP_ADMIN_EMAIL
  SMTP_SENDER_NAME
  IMGPROXY_ENABLE_WEBP_DETECTION
  STUDIO_DEFAULT_ORGANIZATION
  STUDIO_DEFAULT_PROJECT
  DASHBOARD_USERNAME
  DASHBOARD_PASSWORD
  SUPABASE_PROJECT_REF
)

missing=()
for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  fail "Missing required variables: ${missing[*]}" "Update $env_file with the required values."
fi

expected_db_url=""
if [[ -n "${PGHOST:-}" && -n "${PGPORT:-${PGHOST_PORT:-}}" && -n "${PGUSER:-}" && -n "${PGDATABASE:-}" ]]; then
  if ! expected_db_url="$(supabase_build_db_url "${PGUSER}" "${PGPASSWORD:-}" "${PGHOST}" "${PGPORT}" "${PGDATABASE}" "sslmode=disable")"; then
    fail "Unable to construct SUPABASE_DB_URL from lane metadata." "Check PGHOST/PGPORT/PGUSER/PGDATABASE values."
  fi
fi

if [[ -n "$expected_db_url" ]]; then
  if [[ "${SUPABASE_DB_URL:-}" != "$expected_db_url" ]]; then
    echo "ℹ️  Normalizing SUPABASE_DB_URL to match PGHOST=${PGHOST} and PGPORT=${PGPORT}." >&2
    if ! supabase_update_env_var "$env_file" "SUPABASE_DB_URL" "$expected_db_url"; then
      fail "Failed to update SUPABASE_DB_URL in $env_file." "Ensure the file is writable by the runner."
    fi
    SUPABASE_DB_URL="$expected_db_url"
  fi
else
  fail "Unable to determine expected SUPABASE_DB_URL." "Verify PG* variables are set in $env_file."
fi

cli_expected_db_url=""
cli_user="${POSTGRES_USER:-${PGUSER:-}}"
cli_password="${POSTGRES_PASSWORD:-}" 
cli_host="${PGHOST:-}" 
cli_port="${PGPORT:-${PGHOST_PORT:-}}"
cli_database="${PGDATABASE:-${POSTGRES_DB:-}}"

if [[ -z "$cli_user" ]]; then
  fail "Unable to determine Supabase CLI database user." "Ensure POSTGRES_USER is set in $env_file."
fi

if [[ -z "$cli_password" ]]; then
  fail "POSTGRES_PASSWORD missing in $env_file; required for Supabase CLI automation." "Regenerate the lane env with scripts/supabase/provision_lane_env.sh $lane."
fi

if [[ -z "$cli_host" || -z "$cli_port" || -z "$cli_database" ]]; then
  fail "Incomplete Supabase CLI connection metadata." "Verify PGHOST, PGPORT, and PGDATABASE are set in $env_file."
fi

if ! cli_expected_db_url="$(supabase_build_db_url "$cli_user" "$cli_password" "$cli_host" "$cli_port" "$cli_database" "sslmode=disable")"; then
  fail "Unable to construct SUPABASE_CLI_DB_URL from lane metadata." "Check POSTGRES_* and PG* values."
fi

if [[ -z "$cli_expected_db_url" ]]; then
  fail "Unable to determine expected SUPABASE_CLI_DB_URL." "Verify POSTGRES_* values are set in $env_file."
fi

if [[ "${SUPABASE_CLI_DB_URL:-}" != "$cli_expected_db_url" ]]; then
  echo "ℹ️  Normalizing SUPABASE_CLI_DB_URL to use ${cli_user}@${cli_host}:${cli_port}." >&2
  if ! supabase_update_env_var "$env_file" "SUPABASE_CLI_DB_URL" "$cli_expected_db_url"; then
    fail "Failed to update SUPABASE_CLI_DB_URL in $env_file." "Ensure the file is writable by the runner."
  fi
fi
SUPABASE_CLI_DB_URL="$cli_expected_db_url"

assert_numeric() {
  local var_name="$1"
  local value="${!var_name:-}"
  local min="${2:-1}"
  local max="${3:-65535}"

  if [[ -z "$value" || ! "$value" =~ ^[0-9]+$ ]]; then
    fail "$var_name must be a numeric value (received '${value:-<unset>}')." "Edit $env_file and re-run the provisioning script."
  fi

  if (( value < min || value > max )); then
    fail "$var_name must be between $min and $max (received '$value')." "Edit $env_file and re-run the provisioning script."
  fi
}

for port_var in PGPORT PGHOST_PORT POSTGRES_PORT KONG_HTTP_PORT KONG_HTTPS_PORT EDGE_PORT SMTP_PORT; do
  assert_numeric "$port_var"
done

for numeric_var in POOLER_MAX_CLIENT_CONN POOLER_DB_POOL_SIZE POOLER_DEFAULT_POOL_SIZE POOLER_PROXY_PORT_TRANSACTION JWT_EXPIRY; do
  assert_numeric "$numeric_var" 1 100000
done

if [[ "${POSTGRES_PORT}" != "5432" ]]; then
  echo "⚠️  POSTGRES_PORT is '${POSTGRES_PORT}', expected 5432 for Supabase Postgres." >&2
fi

if [[ "${PGPORT}" != "${PGHOST_PORT}" ]]; then
  fail "PGPORT (${PGPORT}) must match PGHOST_PORT (${PGHOST_PORT})." "Regenerate the lane env so host port metadata stays consistent."
fi

if [[ "${PGUSER}" != "${SUPABASE_SUPER_ROLE}" ]]; then
  fail "PGUSER ('${PGUSER}') must match SUPABASE_SUPER_ROLE ('${SUPABASE_SUPER_ROLE}')." "Provision the lane env again to sync credentials."
fi

if [[ ! "${VOL_NS}" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  fail "VOL_NS must use lowercase letters, numbers, or dashes (received '${VOL_NS}')." "Update VOL_NS in $env_file to a slug-safe value."
fi

if [[ "${DOCKER_SOCKET_LOCATION}" != /* ]]; then
  fail "DOCKER_SOCKET_LOCATION must be an absolute path (received '${DOCKER_SOCKET_LOCATION}')." "Set it to /var/run/docker.sock or the correct Docker socket path."
fi

for url_var in SITE_URL SUPABASE_PUBLIC_URL SUPABASE_URL API_EXTERNAL_URL; do
  if [[ ! "${!url_var}" =~ ^https?:// ]]; then
    fail "$url_var must be an http(s) URL (received '${!url_var}')." "Update $env_file with a full URL including scheme."
  fi
done

parse_db_url() {
  python3 - "$SUPABASE_DB_URL" <<'PY'
import sys
from urllib.parse import urlparse, unquote

raw_url = sys.argv[1]
url = urlparse(raw_url)
if url.scheme not in ("postgresql", "postgres"):
    print(f"invalid scheme while parsing '{raw_url}'", file=sys.stderr)
    sys.exit(1)

username = unquote(url.username or "")
password = unquote(url.password or "")
host = url.hostname or ""
try:
    port = url.port
except ValueError as exc:
    print(f"invalid port while parsing '{raw_url}': {exc}", file=sys.stderr)
    sys.exit(1)
database = unquote((url.path or "/")[1:])

print(username)
print(password)
print(host)
print(str(port or ""))
print(database)
PY
}

if ! mapfile -t db_url_parts < <(parse_db_url); then
  echo "‼️  Failed to parse SUPABASE_DB_URL='${SUPABASE_DB_URL:-<unset>}'" >&2
  fail "SUPABASE_DB_URL is invalid." "Ensure it is a postgresql:// URL."
fi

if [[ ${#db_url_parts[@]} -ne 5 ]]; then
  echo "‼️  Unexpected parser output for SUPABASE_DB_URL='${SUPABASE_DB_URL:-<unset>}'" >&2
  fail "SUPABASE_DB_URL is invalid." "Ensure it is a postgresql:// URL."
fi

db_url_user="${db_url_parts[0]}"
db_url_password="${db_url_parts[1]}"
db_url_host="${db_url_parts[2]}"
db_url_port="${db_url_parts[3]}"
db_url_database="${db_url_parts[4]}"

if [[ -z "$db_url_host" || -z "$db_url_port" || -z "$db_url_user" ]]; then
  fail "SUPABASE_DB_URL must include user, host, and port." "Re-run provisioning so the helper can rebuild the URL."
fi

if [[ "$db_url_host" != "${PGHOST}" ]]; then
  fail "SUPABASE_DB_URL host (${db_url_host}) does not match PGHOST (${PGHOST})." "Update $env_file or regenerate it."
fi

if [[ "$db_url_port" != "${PGPORT}" ]]; then
  fail "SUPABASE_DB_URL port (${db_url_port}) does not match PGPORT (${PGPORT})." "Update $env_file or regenerate it."
fi

if [[ "$db_url_database" != "${PGDATABASE}" ]]; then
  fail "SUPABASE_DB_URL database (${db_url_database}) does not match PGDATABASE (${PGDATABASE})." "Update $env_file or regenerate it."
fi

if [[ "$db_url_user" != "${PGUSER}" ]]; then
  fail "SUPABASE_DB_URL user (${db_url_user}) does not match PGUSER (${PGUSER})." "Update $env_file or regenerate it."
fi

if [[ -n "${PGPASSWORD:-}" && "$db_url_password" != "${PGPASSWORD}" ]]; then
  fail "SUPABASE_DB_URL password does not match PGPASSWORD." "Regenerate the lane env so the connection string stays aligned."
fi

if [[ -z "${PGPASSWORD:-}" && -n "$db_url_password" ]]; then
  echo "⚠️  SUPABASE_DB_URL encodes a password while PGPASSWORD is blank; ensure this is intentional." >&2
fi

if [[ "${SUPABASE_PROJECT_REF}" != "$lane" ]]; then
  echo "⚠️  SUPABASE_PROJECT_REF (${SUPABASE_PROJECT_REF}) differs from lane '$lane'." >&2
fi

if [[ -z "${SUPABASE_CLI_DB_URL:-}" ]]; then
  fail "SUPABASE_CLI_DB_URL missing in $env_file after normalization." "Re-run scripts/supabase/provision_lane_env.sh $lane."
fi

mapfile -t cli_db_url_parts < <(python3 - "$SUPABASE_CLI_DB_URL" <<'PY'
import sys
from urllib.parse import urlparse, unquote

value = sys.argv[1]
parsed = urlparse(value)
if parsed.scheme not in {"postgresql", "postgres"}:
    print("invalid scheme", file=sys.stderr)
    sys.exit(1)

username = parsed.username or ""
password = parsed.password or ""
hostname = parsed.hostname or ""
port = parsed.port or ""
database = parsed.path[1:] if parsed.path.startswith("/") else parsed.path
print(unquote(username))
print(unquote(password))
print(hostname)
print(str(port) if port else "")
print(unquote(database))
PY
) || {
  echo "‼️  Failed to parse SUPABASE_CLI_DB_URL='${SUPABASE_CLI_DB_URL:-<unset>}'" >&2
  fail "SUPABASE_CLI_DB_URL is invalid." "Ensure it is a postgresql:// URL."
}

if [[ ${#cli_db_url_parts[@]} -ne 5 ]]; then
  echo "‼️  Unexpected parser output for SUPABASE_CLI_DB_URL='${SUPABASE_CLI_DB_URL:-<unset>}'" >&2
  fail "SUPABASE_CLI_DB_URL is invalid." "Ensure it is a postgresql:// URL."
fi

cli_db_url_user="${cli_db_url_parts[0]}"
cli_db_url_password="${cli_db_url_parts[1]}"
cli_db_url_host="${cli_db_url_parts[2]}"
cli_db_url_port="${cli_db_url_parts[3]}"
cli_db_url_database="${cli_db_url_parts[4]}"

if [[ -z "$cli_db_url_host" || -z "$cli_db_url_port" || -z "$cli_db_url_user" ]]; then
  fail "SUPABASE_CLI_DB_URL must include user, host, and port." "Re-run provisioning so the helper can rebuild the URL."
fi

if [[ "$cli_db_url_host" != "${PGHOST}" ]]; then
  fail "SUPABASE_CLI_DB_URL host (${cli_db_url_host}) does not match PGHOST (${PGHOST})." "Update $env_file or regenerate it."
fi

if [[ "$cli_db_url_port" != "${PGPORT}" ]]; then
  fail "SUPABASE_CLI_DB_URL port (${cli_db_url_port}) does not match PGPORT (${PGPORT})." "Update $env_file or regenerate it."
fi

if [[ "$cli_db_url_database" != "${PGDATABASE}" ]]; then
  fail "SUPABASE_CLI_DB_URL database (${cli_db_url_database}) does not match PGDATABASE (${PGDATABASE})." "Update $env_file or regenerate it."
fi

if [[ "$cli_db_url_user" != "${cli_user}" ]]; then
  fail "SUPABASE_CLI_DB_URL user (${cli_db_url_user}) does not match POSTGRES_USER (${cli_user})." "Update $env_file or regenerate it."
fi

if [[ "$cli_db_url_password" != "$cli_password" ]]; then
  fail "SUPABASE_CLI_DB_URL password does not match POSTGRES_PASSWORD." "Regenerate the lane env so the CLI connection string stays aligned."
fi

if [[ "$SUPABASE_CLI_DB_URL" != *"sslmode=disable"* ]]; then
  fail "SUPABASE_CLI_DB_URL must include '?sslmode=disable'." "Append '?sslmode=disable' to the CLI connection string and rerun provisioning."
fi

cli_helper="$root/scripts/supabase/cli.sh"
if [[ -f "$cli_helper" ]]; then
  # shellcheck disable=SC1090
  source "$cli_helper"
  if supabase_cli_env "$lane" && command -v supabase >/dev/null 2>&1; then
    run_supabase_cli_dry_run
  else
    echo "⚠️  Supabase CLI unavailable; skipping db push dry-run." >&2
  fi

else
  echo "⚠️  Supabase CLI helper missing at $cli_helper; skipping db push dry-run." >&2
fi

weak_regex='(changeme|password|test|example|temp|secret)'
if [[ "${PGPASSWORD,,}" =~ $weak_regex ]]; then
  echo "⚠️  PGPASSWORD appears weak (${PGPASSWORD}). Replace it with a strong unique password." >&2
fi

if [[ "${SUPABASE_SUPER_PASSWORD,,}" =~ $weak_regex ]]; then
  echo "⚠️  SUPABASE_SUPER_PASSWORD appears weak (${SUPABASE_SUPER_PASSWORD}). Replace it with a strong unique password." >&2
fi

echo "✅ Lane '$lane' environment validated."
