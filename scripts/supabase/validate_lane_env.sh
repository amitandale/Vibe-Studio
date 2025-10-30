#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: validate_lane_env.sh <lane>" >&2
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" || $# -eq 0 ]]; then
  usage
  exit $(( $# -eq 0 ? 1 : 0 ))
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
  fail "${super_password_var} missing in credentials file." "Add the superuser password to ops/supabase/lanes/credentials.env."
fi

required_vars=(
  COMPOSE_PROJECT_NAME
  LANE
  VOL_NS
  PGHOST
  PGPORT
  PGHOST_PORT
  PGDATABASE
  PGUSER
  PGPASSWORD
  SUPABASE_SUPER_ROLE
  SUPABASE_SUPER_PASSWORD
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

if [[ "${PGPASSWORD}" != "${SUPABASE_SUPER_PASSWORD}" ]]; then
  fail "PGPASSWORD does not match SUPABASE_SUPER_PASSWORD for lane '$lane'." "Regenerate the lane env so credentials stay aligned."
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

weak_regex='(changeme|password|test|example|temp|secret)'
if [[ "${PGPASSWORD,,}" =~ $weak_regex ]]; then
  echo "⚠️  PGPASSWORD appears weak (${PGPASSWORD}). Replace it with a strong unique password." >&2
fi

if [[ "${SUPABASE_SUPER_PASSWORD,,}" =~ $weak_regex ]]; then
  echo "⚠️  SUPABASE_SUPER_PASSWORD appears weak (${SUPABASE_SUPER_PASSWORD}). Replace it with a strong unique password." >&2
fi

echo "✅ Lane '$lane' environment validated."
