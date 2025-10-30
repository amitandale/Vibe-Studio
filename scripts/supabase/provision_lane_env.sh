#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: provision_lane_env.sh <lane> [options]

Create or update the Supabase lane environment file with ports and service secrets.

Options:
  --pg-password VALUE        Provide the Postgres password non-interactively.
  --pg-super-role VALUE      Override the fallback superuser role (default: supabase_admin).
  --pg-super-password VALUE  Provide the fallback superuser password (required when credentials.env omits it).
  --edge-env-file PATH       Override the edge runtime env file path.
  --force                    Overwrite the existing file without confirmation.
  -h, --help                 Show this help message.

Lanes: main, work, codex
USAGE
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" || $# -eq 0 ]]; then
  usage
  exit $(( $# == 0 ? 1 : 0 ))
fi

lane="$1"; shift || true
pg_host_port=""

case "$lane" in
  main|work|codex) ;;
  *)
    echo "invalid lane '$lane' (expected main, work, codex)" >&2
    exit 2
    ;;
esac

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "required command '$1' not found" >&2
    exit 1
  fi
}

require_cmd openssl
require_cmd python3

force=false
pg_password=""
pg_super_role=""
pg_super_password=""
edge_env_file=""
pg_password_override=false
pg_super_role_override=false
pg_super_password_override=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pg-password)
      pg_password="${2:?missing password}"; pg_password_override=true; shift 2
      ;;
    --pg-super-role)
      pg_super_role="${2:?missing role}"; pg_super_role_override=true; shift 2
      ;;
    --pg-super-password)
      pg_super_password="${2:?missing password}"; pg_super_password_override=true; shift 2
      ;;
    --edge-env-file)
      edge_env_file="${2:?missing path}"; shift 2
      ;;
    --force)
      force=true
      shift
      ;;
    *)
      echo "unknown option '$1'" >&2
      usage
      exit 2
      ;;
  esac
done

root="$(cd "$(dirname "$0")/../.." && pwd)"
lanes_dir="$root/ops/supabase/lanes"
mkdir -p "$lanes_dir"

lib_env_helpers="$root/scripts/supabase/lib/env.sh"
if [[ -f "$lib_env_helpers" ]]; then
  # shellcheck disable=SC1090
  source "$lib_env_helpers"
fi

if ! declare -f supabase_build_db_url >/dev/null 2>&1; then
  supabase_build_db_url() {
    python3 - "$1" "$2" "$3" "$4" "$5" <<'PY'
import sys
from urllib.parse import quote

user = quote(sys.argv[1]) if sys.argv[1] else ""
password = sys.argv[2]
host = sys.argv[3]
port = sys.argv[4]
database = quote(sys.argv[5]) if sys.argv[5] else ""

auth = ""
if user:
    if password:
        auth = f"{user}:{quote(password)}@"
    else:
        auth = f"{user}@"
elif password:
    auth = f":{quote(password)}@"

endpoint = host
if port:
    endpoint = f"{host}:{port}"

print(f"postgresql://{auth}{endpoint}/{database}")
PY
  }
fi

lane_upper="${lane^^}"

credentials_file="$root/ops/supabase/lanes/credentials.env"
if [[ ! -f "$credentials_file" ]]; then
  echo "Creating credentials file at $credentials_file" >&2
  old_umask="$(umask)"
  umask 177
  cat <<'HEADER' >"$credentials_file"
# Supabase lane credentials
# Each variable maps to a Supabase lane and is consumed by provisioning scripts.
HEADER
  chmod 600 "$credentials_file"
  umask "$old_umask"
fi
credentials_pg_password=""
credentials_super_role=""
credentials_super_password=""
if [[ -f "$credentials_file" ]]; then
  # shellcheck disable=SC1090
  source "$credentials_file"
  credentials_pg_password_var="${lane_upper}_PG_PASSWORD"
  credentials_super_role_var="${lane_upper}_SUPER_ROLE"
  credentials_super_password_var="${lane_upper}_SUPER_PASSWORD"
  credentials_pg_password="${!credentials_pg_password_var:-}"
  credentials_super_role="${!credentials_super_role_var:-}"
  credentials_super_password="${!credentials_super_password_var:-}"
fi

update_credentials_file() {
  local key="$1" value="$2"
  local tmp
  tmp=$(mktemp)
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    $0 ~ "^" key "=" { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$credentials_file" >"$tmp"
  mv "$tmp" "$credentials_file"
  chmod 600 "$credentials_file"
}

working_env_file="$lanes_dir/${lane}.env"
if [[ -f "$working_env_file" ]]; then
  if [[ "$force" != true ]]; then
    echo "Updating existing $working_env_file" >&2
  fi
  set -a
  # shellcheck disable=SC1090
  source "$working_env_file"
  set +a
fi

existing_edge_env_file="${EDGE_ENV_FILE:-}"

case "$lane" in
  main)
    pg_host_port=5433
    pg_db="vibe_main"
    kong_port=8101
    edge_port=9901
    default_edge_env="/etc/supabase/edge-main.env"
    ;;
  work)
    pg_host_port=5434
    pg_db="vibe_work"
    kong_port=8102
    edge_port=9902
    default_edge_env="/etc/supabase/edge-work.env"
    ;;
  codex)
    pg_host_port=5435
    pg_db="vibe_codex"
    kong_port=8103
    edge_port=9903
    default_edge_env="/etc/supabase/edge-codex.env"
    ;;
  *)
    echo "unsupported lane '$lane'" >&2
    exit 2
    ;;
esac

if [[ -z "$edge_env_file" ]]; then
  edge_env_file="${existing_edge_env_file:-$default_edge_env}"
fi

if [[ -z "$pg_password" && -n "$credentials_pg_password" ]]; then
  pg_password="$credentials_pg_password"
fi

if [[ -z "$pg_password" ]]; then
  echo "Postgres password for lane '$lane' is missing." >&2
  echo "Define ${lane_upper}_PG_PASSWORD in $credentials_file or pass --pg-password." >&2
  exit 1
fi

if [[ "$pg_password_override" == true || "$pg_password" != "${credentials_pg_password}" ]]; then
  update_credentials_file "${lane_upper}_PG_PASSWORD" "$pg_password"
fi

if [[ -z "$pg_super_role" && -n "$credentials_super_role" ]]; then
  pg_super_role="$credentials_super_role"
fi

if [[ -z "$pg_super_role" ]]; then
  pg_super_role="supabase_admin"
fi

if [[ "$pg_super_role_override" == true || "$pg_super_role" != "${credentials_super_role}" ]]; then
  update_credentials_file "${lane_upper}_SUPER_ROLE" "$pg_super_role"
fi

if [[ -z "$pg_super_password" && -n "$credentials_super_password" ]]; then
  pg_super_password="$credentials_super_password"
fi

if [[ "$pg_super_password_override" == true || "$pg_super_password" != "${credentials_super_password}" ]]; then
  update_credentials_file "${lane_upper}_SUPER_PASSWORD" "$pg_super_password"
fi

if [[ -z "$edge_env_file" ]]; then
  edge_env_file="${existing_edge_env_file:-$default_edge_env}"
fi

random_hex() {
  local bytes="$1"
  openssl rand -hex "$bytes"
}

random_base64() {
  local bytes="$1"
  openssl rand -base64 "$bytes" | tr -d '\n'
}

escape_env_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\\$}"
  value="${value//\`/\\\`}" # backticks
  printf '"%s"' "$value"
}

ensure_existing_or_default() {
  local key="$1" default_value="$2"
  local current="${new_env[$key]:-${!key:-}}"
  if [[ -z "$current" ]]; then
    current="$default_value"
  fi
  printf '%s' "$current"
}

ensure_random_hex() {
  local key="$1" bytes="$2"
  local current="${new_env[$key]:-${!key:-}}"
  if [[ -z "$current" ]]; then
    current="$(random_hex "$bytes")"
  fi
  printf '%s' "$current"
}

ensure_random_base64() {
  local key="$1" bytes="$2"
  local current="${new_env[$key]:-${!key:-}}"
  if [[ -z "$current" ]]; then
    current="$(random_base64 "$bytes")"
  fi
  printf '%s' "$current"
}

declare -A new_env=()
declare -a env_order=()

set_env() {
  local key="$1" value="$2"
  new_env["$key"]="$value"
  for existing_key in "${env_order[@]}"; do
    if [[ "$existing_key" == "$key" ]]; then
      return
    fi
  done
  env_order+=("$key")
}

pg_container_port=5432
kong_https_default=$((kong_port + 443))
site_url_default="http://127.0.0.1:${kong_port}"

jwt_secret="$(ensure_random_base64 JWT_SECRET 32)"
anon_key="$(ensure_random_hex ANON_KEY 32)"
service_key="$(ensure_random_hex SERVICE_ROLE_KEY 32)"
pg_meta_crypto_key="$(ensure_random_hex PG_META_CRYPTO_KEY 32)"
vault_enc_key="$(ensure_random_hex VAULT_ENC_KEY 32)"
secret_key_base="$(ensure_random_hex SECRET_KEY_BASE 64)"
logflare_public="$(ensure_existing_or_default LOGFLARE_PUBLIC_ACCESS_TOKEN "logflare-public-${lane}")"
logflare_private="$(ensure_existing_or_default LOGFLARE_PRIVATE_ACCESS_TOKEN "logflare-private-${lane}")"
dashboard_user="$(ensure_existing_or_default DASHBOARD_USERNAME "admin@${lane}.supabase.local")"
dashboard_password="${new_env[DASHBOARD_PASSWORD]:-${DASHBOARD_PASSWORD:-}}"
if [[ -z "$dashboard_password" ]]; then
  dashboard_password="$(random_base64 24)"
fi

set_env "COMPOSE_PROJECT_NAME" "supa-${lane}"
set_env "LANE" "$lane"
set_env "VOL_NS" "$lane"
set_env "ENV_FILE" "$working_env_file"

set_env "PGHOST" "127.0.0.1"
set_env "PGPORT" "$pg_host_port"
set_env "PGHOST_PORT" "$pg_host_port"
set_env "PGDATABASE" "$pg_db"
set_env "PGUSER" "$pg_super_role"
set_env "PGPASSWORD" "$pg_super_password"

set_env "SUPABASE_SUPER_ROLE" "$pg_super_role"
set_env "SUPABASE_SUPER_PASSWORD" "$pg_super_password"

set_env "POSTGRES_HOST" "db"
set_env "POSTGRES_PORT" "$pg_container_port"
set_env "POSTGRES_USER" "postgres"
set_env "POSTGRES_DB" "$pg_db"
set_env "POSTGRES_PASSWORD" "$pg_password"

set_env "PG_META_CRYPTO_KEY" "$pg_meta_crypto_key"
set_env "PGRST_DB_SCHEMAS" "public,storage,graphql_public"
set_env "FUNCTIONS_VERIFY_JWT" "true"
set_env "JWT_SECRET" "$jwt_secret"
set_env "ANON_KEY" "$anon_key"
set_env "SERVICE_ROLE_KEY" "$service_key"
set_env "SUPABASE_ANON_KEY" "$anon_key"
set_env "SUPABASE_SERVICE_KEY" "$service_key"
set_env "JWT_EXPIRY" "3600"

set_env "KONG_HTTP_PORT" "$kong_port"
set_env "KONG_HTTPS_PORT" "$(ensure_existing_or_default KONG_HTTPS_PORT "$kong_https_default")"

set_env "EDGE_PORT" "$edge_port"
set_env "EDGE_ENV_FILE" "$edge_env_file"

set_env "SITE_URL" "$(ensure_existing_or_default SITE_URL "$site_url_default")"
set_env "SUPABASE_PUBLIC_URL" "$(ensure_existing_or_default SUPABASE_PUBLIC_URL "$site_url_default")"
set_env "SUPABASE_URL" "$(ensure_existing_or_default SUPABASE_URL "$site_url_default")"
set_env "API_EXTERNAL_URL" "$(ensure_existing_or_default API_EXTERNAL_URL "$site_url_default")"
set_env "DOCKER_SOCKET_LOCATION" "$(ensure_existing_or_default DOCKER_SOCKET_LOCATION "/var/run/docker.sock")"

if ! db_url="$(supabase_build_db_url "$pg_super_role" "$pg_super_password" "127.0.0.1" "$pg_host_port" "$pg_db")"; then
  echo "Failed to construct SUPABASE_DB_URL; verify python3 is installed." >&2
  exit 1
fi
set_env "SUPABASE_DB_URL" "$db_url"
set_env "SUPABASE_PROJECT_REF" "$(ensure_existing_or_default SUPABASE_PROJECT_REF "$lane")"

set_env "LOGFLARE_PUBLIC_ACCESS_TOKEN" "$logflare_public"
set_env "LOGFLARE_PRIVATE_ACCESS_TOKEN" "$logflare_private"
set_env "VAULT_ENC_KEY" "$vault_enc_key"
set_env "SECRET_KEY_BASE" "$secret_key_base"

set_env "POOLER_TENANT_ID" "$(ensure_existing_or_default POOLER_TENANT_ID "default")"
set_env "POOLER_MAX_CLIENT_CONN" "$(ensure_existing_or_default POOLER_MAX_CLIENT_CONN "200")"
set_env "POOLER_DB_POOL_SIZE" "$(ensure_existing_or_default POOLER_DB_POOL_SIZE "20")"
set_env "POOLER_DEFAULT_POOL_SIZE" "$(ensure_existing_or_default POOLER_DEFAULT_POOL_SIZE "20")"
set_env "POOLER_PROXY_PORT_TRANSACTION" "$(ensure_existing_or_default POOLER_PROXY_PORT_TRANSACTION "6432")"

set_env "ENABLE_EMAIL_SIGNUP" "$(ensure_existing_or_default ENABLE_EMAIL_SIGNUP "true")"
set_env "ENABLE_EMAIL_AUTOCONFIRM" "$(ensure_existing_or_default ENABLE_EMAIL_AUTOCONFIRM "false")"
set_env "ENABLE_ANONYMOUS_USERS" "$(ensure_existing_or_default ENABLE_ANONYMOUS_USERS "true")"
set_env "ENABLE_PHONE_SIGNUP" "$(ensure_existing_or_default ENABLE_PHONE_SIGNUP "false")"
set_env "ENABLE_PHONE_AUTOCONFIRM" "$(ensure_existing_or_default ENABLE_PHONE_AUTOCONFIRM "false")"
set_env "DISABLE_SIGNUP" "$(ensure_existing_or_default DISABLE_SIGNUP "false")"
set_env "ADDITIONAL_REDIRECT_URLS" "$(ensure_existing_or_default ADDITIONAL_REDIRECT_URLS "$site_url_default")"

set_env "SMTP_HOST" "$(ensure_existing_or_default SMTP_HOST "localhost")"
set_env "SMTP_PORT" "$(ensure_existing_or_default SMTP_PORT "1025")"
set_env "SMTP_USER" "$(ensure_existing_or_default SMTP_USER "supabase")"
set_env "SMTP_PASS" "$(ensure_existing_or_default SMTP_PASS "supabase")"
set_env "SMTP_ADMIN_EMAIL" "$(ensure_existing_or_default SMTP_ADMIN_EMAIL "admin@${lane}.supabase.local")"
set_env "SMTP_SENDER_NAME" "$(ensure_existing_or_default SMTP_SENDER_NAME "Supabase ${lane^}")"

set_env "MAILER_URLPATHS_EMAIL_CHANGE" "$(ensure_existing_or_default MAILER_URLPATHS_EMAIL_CHANGE "/auth/v1/verify")"
set_env "MAILER_URLPATHS_CONFIRMATION" "$(ensure_existing_or_default MAILER_URLPATHS_CONFIRMATION "/auth/v1/verify")"
set_env "MAILER_URLPATHS_INVITE" "$(ensure_existing_or_default MAILER_URLPATHS_INVITE "/auth/v1/verify")"
set_env "MAILER_URLPATHS_RECOVERY" "$(ensure_existing_or_default MAILER_URLPATHS_RECOVERY "/auth/v1/verify")"

set_env "IMGPROXY_ENABLE_WEBP_DETECTION" "$(ensure_existing_or_default IMGPROXY_ENABLE_WEBP_DETECTION "true")"

set_env "STUDIO_DEFAULT_ORGANIZATION" "$(ensure_existing_or_default STUDIO_DEFAULT_ORGANIZATION "Vibe Supabase Org")"
set_env "STUDIO_DEFAULT_PROJECT" "$(ensure_existing_or_default STUDIO_DEFAULT_PROJECT "Vibe Supabase Project")"

set_env "DASHBOARD_USERNAME" "$dashboard_user"
set_env "DASHBOARD_PASSWORD" "$dashboard_password"

required_non_empty=(
  COMPOSE_PROJECT_NAME LANE VOL_NS PGHOST PGPORT PGHOST_PORT PGDATABASE PGUSER
  POSTGRES_HOST POSTGRES_PORT POSTGRES_DB POSTGRES_PASSWORD
  SUPABASE_SUPER_ROLE
  JWT_SECRET ANON_KEY SERVICE_ROLE_KEY SUPABASE_ANON_KEY SUPABASE_SERVICE_KEY
  PG_META_CRYPTO_KEY SECRET_KEY_BASE VAULT_ENC_KEY
  KONG_HTTP_PORT KONG_HTTPS_PORT EDGE_PORT EDGE_ENV_FILE
  SITE_URL SUPABASE_PUBLIC_URL API_EXTERNAL_URL SUPABASE_URL
  DOCKER_SOCKET_LOCATION LOGFLARE_PUBLIC_ACCESS_TOKEN LOGFLARE_PRIVATE_ACCESS_TOKEN
  SMTP_HOST SMTP_PORT SMTP_ADMIN_EMAIL SMTP_SENDER_NAME
  DASHBOARD_USERNAME DASHBOARD_PASSWORD
  SUPABASE_DB_URL SUPABASE_PROJECT_REF
)

missing=()
for key in "${required_non_empty[@]}"; do
  if [[ -z "${new_env[$key]:-}" ]]; then
    missing+=("$key")
  fi
done

if (( ${#missing[@]} > 0 )); then
  {
    echo "❌ Unable to generate Supabase lane environment."
    echo "   Missing values for: ${missing[*]}"
  } >&2
  exit 1
fi

{
  for key in "${env_order[@]}"; do
    printf '%s=%s\n' "$key" "$(escape_env_value "${new_env[$key]}")"
  done
} >"$working_env_file"

chmod 600 "$working_env_file"

cat <<MSG
✅ Supabase lane '$lane' environment written to $working_env_file
   Postgres password source: ${credentials_file}
   Superuser role: $pg_super_role
   Docker socket mount: ${new_env[DOCKER_SOCKET_LOCATION]}
MSG
