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
official_docker_dir="$root/ops/supabase/lanes/latest-docker"
official_compose="$official_docker_dir/docker-compose.yml"
official_env_template="$official_docker_dir/.env.example"

if [[ ! -d "$official_docker_dir" ]]; then
  echo "Supabase docker assets missing at $official_docker_dir; fetch them from the official repository before continuing." >&2
  exit 1
fi

if [[ ! -f "$official_compose" ]]; then
  echo "Supabase compose definition missing at $official_compose; fetch the docker folder from the official repository before continuing." >&2
  exit 1
fi

if [[ ! -f "$official_env_template" ]]; then
  echo "Supabase compose environment template missing at $official_env_template; fetch it alongside the compose file before continuing." >&2
  exit 1
fi

compose="$official_compose"
repo_envfile="$root/ops/supabase/lanes/${lane}.env"
credentials_file="$root/ops/supabase/lanes/credentials.env"

if [[ ! -f "$repo_envfile" ]]; then
  echo "lane env file $repo_envfile missing; run scripts/supabase/provision_lane_env.sh $lane --pg-password <password>" >&2
  exit 1
fi

if [[ ! -s "$repo_envfile" ]]; then
  echo "lane env file $repo_envfile is empty; regenerate it with scripts/supabase/provision_lane_env.sh $lane" >&2
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

should_redact_key() {
  local key="$1"
  [[ "$key" =~ (PASS|PASSWORD|SECRET|TOKEN|KEY|JWT|ACCESS|PRIVATE|DATABASE_URL|SUPABASE_URL) ]]
}

sanitize_env_line() {
  local line="$1"

  if [[ "$line" != *"="* ]]; then
    printf '%s' "$line"
    return
  fi

  local key="${line%%=*}"
  local value="${line#*=}"

  if should_redact_key "$key"; then
    value="<redacted>"
  elif [[ -z "$value" ]]; then
    value="<empty>"
  fi

  printf '%s=%s' "$key" "$value"
}

add_or_update_kv() {
  local map_ref="$1"
  local order_ref="$2"
  local key="$3"
  local value="$4"

  local -n map="$map_ref"
  local -n order="$order_ref"

  if [[ -v map[$key] ]]; then
    map["$key"]="$value"
  else
    map["$key"]="$value"
    order+=("$key")
  fi
}

prepare_envfile() {
  local src="$1"
  local dest="$src"
  local tmp

  declare -A env_map=()
  declare -a key_order=()
  declare -a invalid_lines=()

  if [[ -f "$official_env_template" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ "$line" =~ ^[[:space:]]*# ]] && continue
      [[ "$line" =~ ^[[:space:]]*$ ]] && continue
      if [[ "$line" == *"="* ]]; then
        local key="${line%%=*}"
        local value="${line#*=}"
        add_or_update_kv env_map key_order "$key" "$value"
      fi
    done <"$official_env_template"
  fi

  mapfile -t env_lines <"$src"

  local pg_port="${env_map[PGPORT]:-}"
  local host_port="${env_map[PGHOST_PORT]:-}"

  local idx line line_no assignment key value leading
  for idx in "${!env_lines[@]}"; do
    line="${env_lines[$idx]}"
    line_no=$((idx + 1))
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == "" ]] && continue
    assignment="$line"
    # Trim leading whitespace once for analysis
    leading="${assignment%%[![:space:]]*}"
    assignment="${assignment#"$leading"}"
    if [[ "$assignment" == export* ]]; then
      assignment="${assignment#export}"
      leading="${assignment%%[![:space:]]*}"
      assignment="${assignment#"$leading"}"
    fi
    if [[ "$assignment" != *"="* ]]; then
      invalid_lines+=("$line_no:$line")
      continue
    fi
    key="${assignment%%=*}"
    value="${assignment#*=}"
    case "$key" in
      PGPORT)
        pg_port="$value"
        ;;
      PGHOST_PORT)
        host_port="$value"
        ;;
    esac
    case "$key" in
      PGPASSWORD|SUPABASE_SUPER_PASSWORD|SUPABASE_SUPER_ROLE)
        continue
        ;;
    esac
    add_or_update_kv env_map key_order "$key" "$value"
  done

  if (( ${#invalid_lines[@]} > 0 )); then
    {
      echo "❌ Supabase lane env file '$src' contains lines that are not valid KEY=value assignments."
      echo "   Problematic lines (sanitized):"
      local entry line_no raw
      for entry in "${invalid_lines[@]}"; do
        line_no="${entry%%:*}"
        raw="${entry#*:}"
        printf '     %s: %s\n' "$line_no" "$(sanitize_env_line "$raw")"
      done
      echo "   Comment out notes with '#' or regenerate the env with scripts/supabase/provision_lane_env.sh $lane."
    } >&2
    exit 1
  fi

  if [[ -z "$pg_port" ]]; then
    pg_port="5432"
  fi
  if [[ -z "$host_port" ]]; then
    host_port="$pg_port"
  fi

  add_or_update_kv env_map key_order PGPORT "5432"
  add_or_update_kv env_map key_order PGHOST_PORT "$host_port"

  add_or_update_kv env_map key_order PGPASSWORD "$injected_pg_password"
  add_or_update_kv env_map key_order SUPABASE_SUPER_ROLE "$injected_super_role"
  add_or_update_kv env_map key_order SUPABASE_SUPER_PASSWORD "$injected_super_password"

  if [[ -n "${env_map[PGDATABASE]:-}" ]]; then
    add_or_update_kv env_map key_order POSTGRES_DB "${env_map[PGDATABASE]}"
  fi
  if [[ -n "${env_map[PGUSER]:-}" ]]; then
    add_or_update_kv env_map key_order POSTGRES_USER "${env_map[PGUSER]}"
  fi
  add_or_update_kv env_map key_order POSTGRES_PASSWORD "$injected_pg_password"
  add_or_update_kv env_map key_order POSTGRES_HOST "db"
  add_or_update_kv env_map key_order POSTGRES_PORT "5432"

  tmp="$(mktemp)"
  {
    for key in "${key_order[@]}"; do
      printf '%s=%s\n' "$key" "${env_map[$key]}"
    done
  } >"$tmp"

  chmod 600 "$tmp"
  mv "$tmp" "$dest"

  echo "$dest"
}

envfile="$(prepare_envfile "$repo_envfile")"
if [[ ! -s "$envfile" ]]; then
  echo "❌ Supabase lane env file '$envfile' is empty after preparation; regenerate it with scripts/supabase/provision_lane_env.sh $lane" >&2
  exit 1
fi

echo "ℹ️  Prepared Supabase lane env file '$envfile' (source: $envfile_source, credentials: $credentials_file)" >&2
echo "ℹ️  Using Supabase compose definition from $official_compose" >&2
echo "ℹ️  Compose project directory: $official_docker_dir" >&2
echo "ℹ️  Applying upstream Supabase env defaults from $official_env_template" >&2

export ENV_FILE="$envfile"

source_lane_env() {
  local file="$1"
  local status

  set +e
  # shellcheck disable=SC1090
  set -a; source "$file"; status=$?; set +a
  set -e

  if (( status != 0 )); then
    {
      echo "❌ Failed to source Supabase lane environment for '$lane'."
      echo "   Env file: $file"
      echo "   Exit code: $status"
    } >&2

    if command -v awk >/dev/null 2>&1; then
      local suspicious
      suspicious=$(awk 'BEGIN{FS="="} /^[[:space:]]*#/ {next} NF >= 2 {val=substr($0, index($0, "=")+1); gsub(/[[:space:]]+$/, "", val); if (val ~ /[[:space:]]/ && val !~ /^".*"$/ && val !~ /^'\''.*'\''$/) print NR ":" $0}' "$file")
      if [[ -n "$suspicious" ]]; then
        {
          echo "   Detected lines with unquoted whitespace that may break sourcing:"
          printf '     %s\n' "$suspicious"
          echo "   Sanitized excerpts:"
          while IFS= read -r entry; do
            [[ -z "$entry" ]] && continue
            local line_no="${entry%%:*}"
            local raw_line
            raw_line=$(sed -n "${line_no}p" "$file")
            printf '     %s: %s\n' "$line_no" "$(sanitize_env_line "$raw_line")"
          done <<<"$suspicious"
        } >&2
      fi
    fi

    {
      echo "   Last 5 non-comment lines before failure (sanitized):"
      local excerpt
      excerpt=$(grep -nEv '^[[:space:]]*#' "$file" 2>/dev/null | tail -n 5 || true)
      if [[ -n "$excerpt" ]]; then
        while IFS= read -r entry; do
          [[ -z "$entry" ]] && continue
          local ln="${entry%%:*}"
          local rest="${entry#*:}"
          printf '     %s: %s\n' "$ln" "$(sanitize_env_line "$rest")"
        done <<<"$excerpt"
      else
        echo "     <no non-comment lines detected>"
      fi
    } >&2

    {
      echo "   Tip: wrap values containing spaces in quotes (e.g., KEY=\"value with spaces\")."
      echo "   Regenerate the lane env with scripts/supabase/provision_lane_env.sh $lane if needed."
    } >&2

    exit "$status"
  fi
}
source_lane_env "$envfile"
# The deploy workflow runs `docker compose pull` using the same compose directory and
# lane env file immediately before invoking this helper, so all commands below assume
# Supabase images are already refreshed to match the upstream compose definition.
compose_cmd=(docker compose --project-directory "$official_docker_dir" --env-file "$envfile" -f "$compose")

run_compose_checked() {
  local context="$1"
  shift

  local -a full_cmd=("${compose_cmd[@]}" "$@")
  local output status

  {
    echo "ℹ️  [$context] Executing docker compose for lane '$lane'."
    echo "   Working directory: $(pwd)"
    echo "   Command: ${full_cmd[*]}"
  } >&2

  set +e
  output=$("${full_cmd[@]}" 2>&1)
  status=$?
  set -e

  if (( status != 0 )); then
    if [[ -n "$output" ]]; then
      printf '%s\n' "$output" >&2
    fi
    {
      echo "❌ docker compose command failed while running '$context' for Supabase lane '$lane'."
      echo "   Command: ${full_cmd[*]}"
      echo "   Exit code: $status"
    } >&2
    exit "$status"
  fi

  {
    echo "ℹ️  [$context] docker compose exit code: $status"
  } >&2

  if [[ -n "$output" ]]; then
    printf '%s\n' "$output"
    if grep -qi 'variable is not set' <<<"$output"; then
      {
        echo "❌ docker compose reported unset environment variables while running '$context' for lane '$lane'."
        echo "   Review ${repo_envfile} and ensure all placeholders are populated."
      } >&2
      exit 1
    fi
    if grep -qiE 'invalid spec|empty section between colons' <<<"$output"; then
      {
        echo "❌ docker compose reported an invalid volume specification while running '$context' for lane '$lane'."
        echo "   DOCKER_SOCKET_LOCATION=${DOCKER_SOCKET_LOCATION:-<unset>}"
        echo "   Command: ${full_cmd[*]}"
      } >&2
      exit 1
    fi
  fi
}

require_lane_env_vars() {
  local missing=()
  local var
  for var in "$@"; do
    if [[ -z "${!var:-}" ]]; then
      missing+=("$var")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    {
      echo "❌ Supabase lane '$lane' environment is missing required variables: ${missing[*]}"
      echo "   Update $repo_envfile or re-run scripts/supabase/provision_lane_env.sh $lane to regenerate the lane env file."
      echo "   You can run scripts/supabase/validate_lane_env.sh $lane locally to verify the configuration."
    } >&2
    exit 1
  fi
}

validate_port_var() {
  local var_name="$1"
  local value="${!var_name:-}"

  if [[ -z "$value" ]]; then
    return 0
  fi

  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    {
      echo "❌ Supabase lane '$lane' environment variable $var_name must be a numeric TCP port (received '$value')."
      echo "   Update $repo_envfile or re-run scripts/supabase/provision_lane_env.sh $lane to regenerate the lane env file."
    } >&2
    exit 1
  fi

  if (( value < 1 || value > 65535 )); then
    {
      echo "❌ Supabase lane '$lane' environment variable $var_name is out of range (received '$value'; expected 1-65535)."
      echo "   Update $repo_envfile or re-run scripts/supabase/provision_lane_env.sh $lane to regenerate the lane env file."
    } >&2
    exit 1
  fi
}

validate_slug_var() {
  local var_name="$1"
  local value="${!var_name:-}"

  if [[ -z "$value" ]]; then
    return 0
  fi

  if [[ ! "$value" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    {
      echo "❌ Supabase lane '$lane' environment variable $var_name must contain lowercase letters, numbers, or dashes (received '$value')."
      echo "   Update $repo_envfile or re-run scripts/supabase/provision_lane_env.sh $lane to regenerate the lane env file."
    } >&2
    exit 1
  fi
}

validate_positive_int() {
  local var_name="$1"
  local value="${!var_name:-}"

  if [[ -z "$value" || ! "$value" =~ ^[0-9]+$ ]]; then
    {
      echo "❌ Supabase lane '$lane' environment variable $var_name must be a positive integer (received '${value:-<unset>}')."
      echo "   Update $repo_envfile or re-run scripts/supabase/provision_lane_env.sh $lane to regenerate the lane env file."
    } >&2
    exit 1
  fi
}

validate_socket_path() {
  local var_name="$1"
  local value="${!var_name:-}"

  if [[ -z "$value" ]]; then
    return 0
  fi

  if [[ "$value" != /* ]]; then
    {
      echo "❌ Supabase lane '$lane' environment variable $var_name must be an absolute path (received '$value')."
      echo "   Update $repo_envfile or re-run scripts/supabase/provision_lane_env.sh $lane to regenerate the lane env file."
    } >&2
    exit 1
  fi
}

validate_url_var() {
  local var_name="$1"
  local value="${!var_name:-}"

  if [[ -z "$value" ]]; then
    return 0
  fi

  if [[ ! "$value" =~ ^https?:// ]]; then
    {
      echo "❌ Supabase lane '$lane' environment variable $var_name must be an http(s) URL (received '$value')."
      echo "   Update $repo_envfile or re-run scripts/supabase/provision_lane_env.sh $lane to regenerate the lane env file."
    } >&2
    exit 1
  fi
}

require_lane_env_vars \
  COMPOSE_PROJECT_NAME \
  LANE \
  VOL_NS \
  ENV_FILE \
  PGHOST \
  PGPORT \
  PGHOST_PORT \
  PGDATABASE \
  PGUSER \
  PGPASSWORD \
  SUPABASE_SUPER_ROLE \
  SUPABASE_SUPER_PASSWORD \
  POSTGRES_HOST \
  POSTGRES_PORT \
  POSTGRES_DB \
  POSTGRES_PASSWORD \
  PG_META_CRYPTO_KEY \
  PGRST_DB_SCHEMAS \
  FUNCTIONS_VERIFY_JWT \
  JWT_SECRET \
  ANON_KEY \
  SERVICE_ROLE_KEY \
  SUPABASE_ANON_KEY \
  SUPABASE_SERVICE_KEY \
  JWT_EXPIRY \
  KONG_HTTP_PORT \
  KONG_HTTPS_PORT \
  EDGE_PORT \
  EDGE_ENV_FILE \
  SITE_URL \
  SUPABASE_PUBLIC_URL \
  SUPABASE_URL \
  API_EXTERNAL_URL \
  DOCKER_SOCKET_LOCATION \
  LOGFLARE_PUBLIC_ACCESS_TOKEN \
  LOGFLARE_PRIVATE_ACCESS_TOKEN \
  VAULT_ENC_KEY \
  SECRET_KEY_BASE \
  POOLER_TENANT_ID \
  POOLER_MAX_CLIENT_CONN \
  POOLER_DB_POOL_SIZE \
  POOLER_DEFAULT_POOL_SIZE \
  POOLER_PROXY_PORT_TRANSACTION \
  SMTP_HOST \
  SMTP_PORT \
  SMTP_ADMIN_EMAIL \
  SMTP_SENDER_NAME \
  IMGPROXY_ENABLE_WEBP_DETECTION \
  STUDIO_DEFAULT_ORGANIZATION \
  STUDIO_DEFAULT_PROJECT \
  DASHBOARD_USERNAME \
  DASHBOARD_PASSWORD

pg_host_port="${PGHOST_PORT:-${PGPORT:-5432}}"
export PGHOST_PORT="$pg_host_port"
export PGPORT="${PGPORT:-5432}"

validate_port_var PGHOST_PORT
validate_port_var PGPORT
validate_port_var POSTGRES_PORT
validate_port_var KONG_HTTP_PORT
validate_port_var KONG_HTTPS_PORT
validate_port_var EDGE_PORT
validate_port_var SMTP_PORT
validate_port_var POOLER_PROXY_PORT_TRANSACTION

validate_slug_var VOL_NS

validate_positive_int POOLER_MAX_CLIENT_CONN
validate_positive_int POOLER_DB_POOL_SIZE
validate_positive_int POOLER_DEFAULT_POOL_SIZE
validate_positive_int JWT_EXPIRY

validate_socket_path DOCKER_SOCKET_LOCATION

validate_url_var SITE_URL
validate_url_var SUPABASE_PUBLIC_URL
validate_url_var SUPABASE_URL
validate_url_var API_EXTERNAL_URL

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

status_env_snapshot() {
  {
    echo "   Lane: ${lane}"
    if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
      echo "   Compose project: ${COMPOSE_PROJECT_NAME}"
    fi
    if [[ -n "$envfile_source" ]]; then
      if [[ "$envfile" != "$envfile_source" ]]; then
        echo "   Env file: $envfile_source (normalized copy: $envfile)"
      else
        echo "   Env file: $envfile"
      fi
    fi
    echo "   Postgres host: ${PGHOST:-<unset>}  container port: ${PGPORT:-<unset>}  published port: ${PGHOST_PORT:-<unset>}"
    echo "   Kong HTTP port: ${KONG_HTTP_PORT:-<unset>}"
    echo "   Edge runtime port: ${EDGE_PORT:-<unset>}"
    echo "   Edge env file: ${EDGE_ENV_FILE:-<unset>}"
  } >&2
}

service_expected_port() {
  case "$1" in
    db)
      echo "5432"
      ;;
    kong)
      echo "8000"
      ;;
    *)
      return 1
      ;;
  esac
}

find_compose_container() {
  local svc="$1"
  local container=""

  container="$("${compose_cmd[@]}" ps --format '{{.Name}}' "$svc" 2>/dev/null | head -n1 || true)"
  if [[ -n "$container" ]]; then
    echo "$container"
    return 0
  fi

  if command -v docker >/dev/null 2>&1; then
    local docker_cmd=(docker ps -a --filter "label=com.docker.compose.service=${svc}")
    if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
      docker_cmd+=(--filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}")
    fi
    docker_cmd+=(--format '{{.Names}}')
    local ps_output
    ps_output=$("${docker_cmd[@]}" 2>/dev/null)
    container=$(printf '%s\n' "$ps_output" | head -n1)
    if [[ -n "$container" ]]; then
      echo "$container"
      return 0
    fi
  fi

  return 1
}

print_service_diagnostics() {
  local svc="$1"
  local container="${2:-}"
  local provided_container="$container"

  if [[ -z "$container" ]]; then
    container="$(find_compose_container "$svc" || true)"
  fi

  {
    echo "---- ${svc} diagnostics ----"
  } >&2

  ("${compose_cmd[@]}" ps "$svc" >&2) || true

  local expected_port
  if expected_port=$(service_expected_port "$svc" 2>/dev/null); then
    local port_output
    port_output=$("${compose_cmd[@]}" port "$svc" "$expected_port" 2>/dev/null || true)
    if [[ -n "$port_output" ]]; then
      echo "   Published ${svc} port ${expected_port}: $port_output" >&2
    fi
  fi

  local resolved_container="$container"
  if [[ -z "$provided_container" && -n "$resolved_container" ]]; then
    echo "   Container discovered via docker ps -a fallback: $resolved_container" >&2
  fi

  if [[ -n "$resolved_container" ]]; then
    docker inspect -f '   Container {{.Name}} status: {{.State.Status}} (health: {{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}})' "$resolved_container" >&2 || true
    docker inspect -f '   Restart count: {{.RestartCount}}  StartedAt: {{.State.StartedAt}}' "$resolved_container" >&2 || true
  else
    echo "   Container for service '$svc' not found via docker compose ps or docker ps -a." >&2
  fi

  echo "---- recent ${svc} logs ----" >&2
  if ! "${compose_cmd[@]}" logs --tail 80 "$svc" >&2; then
    if [[ -n "$resolved_container" ]]; then
      docker logs --tail 80 "$resolved_container" >&2 || true
    fi
  fi
  echo "---- end ${svc} logs ----" >&2
}

case "$cmd" in
  start)
    run_compose_checked "up -d" up -d
    ;;
  stop)
    run_compose_checked "down" down
    ;;
  db-only)
    run_compose_checked "up -d db" up -d db
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
    run_compose_checked "down" down
    run_compose_checked "up -d" up -d
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
    if ! ps_check_output=$("${compose_cmd[@]}" ps 2>&1); then
      {
        echo "❌ Supabase lane status check failed to query docker compose state for lane '$lane'."
        echo "   Command: docker compose ps"
        echo "   Output:"
        printf '%s\n' "$ps_check_output" | indent_lines '     '
      } >&2
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
          if ! services_json=$(printf '%s\n' "$ps_json" | jq -nc '
            def to_services:
              if type=="array" then
                .
              elif type=="object" then
                if has("Services") then
                  (.Services // [])
                elif has("Service") then
                  [.] # docker compose v2.30+ may emit a single service object
                else
                  [.] # tolerate unknown object shapes but preserve data for diagnostics
                end
              else
                error("compose ps output is not an array of services")
              end;

            def label_map($raw):
              ($raw // "") as $labels
              | if ($labels | length) > 0 then
                  $labels
                  | split(",")
                  | map(gsub("^\\s+"; ""))
                  | map(select(index("=") != null))
                  | map(capture("(?<k>[^=]+)=(?<v>.*)"))
                  | reduce .[] as $item ({}; .[$item.k] = $item.v)
                else
                  {}
                end;

            def normalize($svc):
              $svc as $orig
              | $orig
              | .ComposeService = (
                  if ($orig.Service? | type=="string") and ($orig.Service // "") != "" then
                    $orig.Service
                  else
                    (label_map($orig.Labels)["com.docker.compose.service"] // "")
                  end
                )
              | .ComposeProject = (
                  if ($orig.Project? | type=="string") and ($orig.Project // "") != "" then
                    $orig.Project
                  else
                    (label_map($orig.Labels)["com.docker.compose.project"] // "")
                  end
                );

            reduce inputs as $item ([]; . + [($item | to_services[]) | normalize(.)])
          ' 2>"$jq_err_file"); then
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

          declare -a required_services=(db kong)
          declare -a missing_services=()
          declare -a inactive_services=()
          declare -A service_state_map=()
          declare -A service_names=()
          declare -A service_health_map=()

          for svc in "${required_services[@]}"; do
            svc_json=$(jq -c --arg svc "$svc" --arg project "${COMPOSE_PROJECT_NAME:-}" '
              def matches_name($candidate):
                ($candidate // "") as $value
                | if $value == "" then
                    false
                  else
                    ($value == $svc)
                    or ($value | contains("-" + $svc + "-"))
                    or ($value | endswith("-" + $svc))
                    or ($value | contains("_" + $svc + "_"))
                    or ($value | endswith("_" + $svc))
                  end;

              first(
                .[]
                | select(
                    ((.ComposeService // "") == $svc)
                    or ((.Service // "") == $svc)
                    or matches_name(.Name)
                  )
                | select(
                    ($project == "")
                    or ((.ComposeProject // "") == "")
                    or (.ComposeProject == $project)
                  )
              ) // empty
            ' <<<"$services_json")

            if [[ -z "${svc_json:-}" ]]; then
              missing_services+=("$svc")
              continue
            fi

            service_names[$svc]="$(jq -r 'if (.Name // "") != "" then .Name else (.ID // "") end' <<<"$svc_json")"

            state=$(jq -r '
              if has("State") then
                if (.State | type == "string") then .State else (.State.Status // "") end
              elif has("Status") then
                .Status
              else
                ""
              end
            ' <<<"$svc_json")
            state_lc=$(printf '%s' "${state}" | tr '[:upper:]' '[:lower:]')
            service_state_map[$svc]="$state_lc"
            if [[ -z "$state_lc" || ! "$state_lc" =~ ^(running|up) ]]; then
              inactive_services+=("$svc")
            fi

            health=$(jq -r '
              if has("Health") then
                if (.Health | type == "string") then .Health else (.Health.Status // "") end
              elif (has("State") and (.State | type == "object") and (.State.Health? != null)) then
                (.State.Health.Status // "")
              else
                ""
              end
            ' <<<"$svc_json")
            health_lc=$(printf '%s' "${health}" | tr '[:upper:]' '[:lower:]')
            if [[ -n "$health_lc" && "$health_lc" != healthy ]]; then
              service_health_map[$svc]="$health_lc"
            fi
          done

          if (( ${#missing_services[@]} == 0 && ${#inactive_services[@]} == 0 && ${#service_health_map[@]} == 0 )); then
            exit 0
          fi

          {
            echo "❌ Supabase lane status check detected inactive services for lane '$lane'."
            if (( ${#missing_services[@]} > 0 )); then
              echo "   Missing services (json): ${missing_services[*]}"
            fi
            if (( ${#inactive_services[@]} > 0 )); then
              printf '   Inactive services (json):'
              for svc in "${inactive_services[@]}"; do
                printf ' %s(state=%s)' "$svc" "${service_state_map[$svc]:-unknown}"
              done
              printf '\n'
            fi
            if (( ${#service_health_map[@]} > 0 )); then
              printf '   Unhealthy services (json):'
              for svc in "${!service_health_map[@]}"; do
                printf ' %s(health=%s)' "$svc" "${service_health_map[$svc]}"
              done
              printf '\n'
            fi
            echo "   docker compose ps --format json output snippet:"
            if [[ -n "${ps_json//[[:space:]]/}" ]]; then
              json_preview="$ps_json"
              if (( ${#json_preview} > 400 )); then
                json_preview="${json_preview:0:400}…"
              fi
              printf '%s\n' "$json_preview" | indent_lines '     '
            else
              echo "     <empty>"
            fi
            status_env_snapshot
          } >&2

          declare -A diag_targets=()
          for svc in "${missing_services[@]}"; do diag_targets[$svc]=1; done
          for svc in "${inactive_services[@]}"; do diag_targets[$svc]=1; done
          for svc in "${!service_health_map[@]}"; do diag_targets[$svc]=1; done
          if (( ${#diag_targets[@]} == 0 )); then
            for svc in "${required_services[@]}"; do
              diag_targets[$svc]=1
            done
          fi

          for svc in "${!diag_targets[@]}"; do
            print_service_diagnostics "$svc" "${service_names[$svc]:-}"
          done

          exit 1
        else
          if [[ -n "${ps_json//[[:space:]]/}" ]]; then
            echo "ℹ️  docker compose ps --format json returned non-JSON output; falling back to text parsing." >&2
          fi
        fi
      fi
    fi
    ps_output=$("${compose_cmd[@]}" ps 2>/dev/null || true)
    missing_services=()
    for svc in db kong; do
      if ! grep -qiE "\b${svc}\b.*(up|running)" <<<"$ps_output"; then
        missing_services+=("$svc")
      fi
    done
    if (( ${#missing_services[@]} == 0 )); then
      exit 0
    fi

    {
      echo "❌ Supabase lane status check detected inactive services for lane '$lane'."
      echo "   Missing services (text): ${missing_services[*]}"
      echo "   docker compose ps output:"
      if [[ -n "${ps_output//[[:space:]]/}" ]]; then
        text_preview="$ps_output"
        if (( ${#text_preview} > 400 )); then
          text_preview="${text_preview:0:400}…"
        fi
        printf '%s\n' "$text_preview" | indent_lines '     '
      else
        echo "     <empty>"
      fi
      status_env_snapshot
    } >&2

    declare -A diag_targets=()
    for svc in "${missing_services[@]}"; do
      diag_targets[$svc]=1
    done
    if (( ${#diag_targets[@]} == 0 )); then
      diag_targets[db]=1
      diag_targets[kong]=1
    fi

    for svc in "${!diag_targets[@]}"; do
      container_name="$("${compose_cmd[@]}" ps --format '{{.Name}}' "$svc" 2>/dev/null | head -n1)"
      if [[ -z "$container_name" ]]; then
        container_name="$("${compose_cmd[@]}" ps --format '{{.Service}} {{.Name}}' 2>/dev/null | awk -v svc="$svc" '$1==svc {print $2; exit}')"
      fi
      print_service_diagnostics "$svc" "${container_name:-}"
    done

    exit 1
    ;;
  *)
    echo "unknown command $cmd" >&2
    exit 2
    ;;
esac
