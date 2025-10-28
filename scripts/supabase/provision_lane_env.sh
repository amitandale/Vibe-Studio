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
existing_edge_env_file=""
existing_jwt_secret=""
existing_anon_key=""
existing_service_key=""
existing_super_role=""
pg_host_port=""
if [[ -f "$working_env_file" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$working_env_file"; set +a
  existing_edge_env_file="${EDGE_ENV_FILE:-}"
  existing_jwt_secret="${JWT_SECRET:-}"
  existing_anon_key="${ANON_KEY:-}"
  existing_service_key="${SERVICE_ROLE_KEY:-}"
  existing_super_role="${SUPABASE_SUPER_ROLE:-}"
  if [[ "$force" != true ]]; then
    echo "Updating existing $working_env_file" >&2
  fi
fi

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

if [[ -z "$pg_super_password" ]]; then
  echo "Supabase superuser password for lane '$lane' is missing." >&2
  echo "Define ${lane_upper}_SUPER_PASSWORD in $credentials_file or pass --pg-super-password." >&2
  exit 1
fi

if [[ "$pg_super_password_override" == true || "$pg_super_password" != "${credentials_super_password}" ]]; then
  update_credentials_file "${lane_upper}_SUPER_PASSWORD" "$pg_super_password"
fi

if [[ -z "$existing_jwt_secret" ]]; then
  existing_jwt_secret="$(openssl rand -base64 32)"
fi
if [[ -z "$existing_anon_key" ]]; then
  existing_anon_key="$(openssl rand -hex 32)"
fi
if [[ -z "$existing_service_key" ]]; then
  existing_service_key="$(openssl rand -hex 32)"
fi

pg_container_port=5432
cat <<ENV >"$working_env_file"
COMPOSE_PROJECT_NAME=supa-${lane}
LANE=${lane}
VOL_NS=${lane}

PGHOST=127.0.0.1
PGHOST_PORT=${pg_host_port}
PGPORT=${pg_container_port}
PGDATABASE=${pg_db}
PGUSER=postgres
# PGPASSWORD is sourced from ops/supabase/lanes/credentials.env at runtime
SUPABASE_SUPER_ROLE=${pg_super_role}
# SUPABASE_SUPER_PASSWORD is sourced from ops/supabase/lanes/credentials.env at runtime

KONG_HTTP_PORT=${kong_port}
EDGE_PORT=${edge_port}
EDGE_ENV_FILE=${edge_env_file}

JWT_SECRET=${existing_jwt_secret}
ANON_KEY=${existing_anon_key}
SERVICE_ROLE_KEY=${existing_service_key}
ENV
chmod 600 "$working_env_file"

cat <<MSG
✅ Supabase lane '$lane' environment written to $working_env_file
   Postgres password source: ${credentials_file}
   Superuser role: $pg_super_role
MSG
