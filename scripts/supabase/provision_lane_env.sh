#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: provision_lane_env.sh <lane> [options]

Create or update the Supabase lane environment file with secrets and ports.

Options:
  --interactive              Prompt for the Postgres password.
  --pg-password VALUE        Provide the Postgres password non-interactively.
  --random-pg-password       Generate a strong Postgres password automatically.
  --pg-super-role VALUE      Override the fallback superuser role (default: supabase_admin).
  --pg-super-password VALUE  Provide the fallback superuser password (required on first run, kept separate from the lane password).
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

interactive=false
auto_password=false
force=false
pg_password=""
pg_super_role=""
pg_super_password=""
edge_env_file=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --interactive)
      interactive=true
      shift
      ;;
    --pg-password)
      pg_password="${2:?missing password}"; shift 2
      ;;
    --random-pg-password)
      auto_password=true
      shift
      ;;
    --pg-super-role)
      pg_super_role="${2:?missing role}"; shift 2
      ;;
    --pg-super-password)
      pg_super_password="${2:?missing password}"; shift 2
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

state_root="${SUPABASE_STATE_DIR:-$HOME/.config/vibe-studio/supabase}"
state_lanes_dir="$state_root/lanes"
mkdir -p "$state_lanes_dir"
chmod 700 "$state_root" "$state_lanes_dir" 2>/dev/null || true

credentials_file="$root/ops/supabase/lanes/credentials.env"
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

superusers_file="$state_root/superusers.env"
if [[ ! -f "$superusers_file" ]]; then
  echo "Creating $superusers_file" >&2
  umask 177
  cat <<'HEADER' >"$superusers_file"
# Supabase lane superuser credentials
# Managed by provision_lane_env.sh
# Format:
# MAIN_SUPER_ROLE=...
# MAIN_SUPER_PASSWORD=...
HEADER
  chmod 600 "$superusers_file"
fi

role_key="${lane_upper}_SUPER_ROLE"
password_key="${lane_upper}_SUPER_PASSWORD"

# shellcheck disable=SC1090
set -a; [[ -f "$superusers_file" ]] && source "$superusers_file"; set +a
config_super_role="${!role_key:-}"
config_super_password="${!password_key:-}"

if [[ "$config_super_role" == supabase_admin_${lane} ]]; then
  config_super_role="supabase_admin"
fi

state_env_file="$state_lanes_dir/${lane}.env"
working_env_file="$lanes_dir/${lane}.env"
existing_pg_password=""
existing_edge_env_file=""
existing_jwt_secret=""
existing_anon_key=""
existing_service_key=""
existing_super_role=""
existing_super_password=""
if [[ -f "$state_env_file" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$state_env_file"; set +a
  existing_pg_password="${PGPASSWORD:-}"
  existing_edge_env_file="${EDGE_ENV_FILE:-}"
  existing_jwt_secret="${JWT_SECRET:-}"
  existing_anon_key="${ANON_KEY:-}"
  existing_service_key="${SERVICE_ROLE_KEY:-}"
  existing_super_role="${SUPABASE_SUPER_ROLE:-}"
  existing_super_password="${SUPABASE_SUPER_PASSWORD:-}"
  if [[ "$existing_super_role" == supabase_admin_${lane} ]]; then
    existing_super_role="supabase_admin"
  fi
  if [[ "$force" != true ]]; then
    echo "Updating existing $state_env_file" >&2
  fi
fi

case "$lane" in
  main)
    pg_port=5433
    pg_db="vibe_main"
    kong_port=8101
    edge_port=9901
    default_edge_env="/etc/supabase/edge-main.env"
    ;;
  work)
    pg_port=5434
    pg_db="vibe_work"
    kong_port=8102
    edge_port=9902
    default_edge_env="/etc/supabase/edge-work.env"
    ;;
  codex)
    pg_port=5435
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
  if [[ -n "$existing_pg_password" ]]; then
    pg_password="$existing_pg_password"
  elif [[ "$interactive" == true ]]; then
    read -rsp "Enter Postgres password for lane '$lane': " pg_password
    echo
  elif [[ "$auto_password" == true ]]; then
    pg_password="$(openssl rand -base64 24)"
  else
    pg_password="$(openssl rand -base64 24)"
  fi
fi

if [[ -z "$pg_super_role" && -n "$credentials_super_role" ]]; then
  pg_super_role="$credentials_super_role"
fi

if [[ -z "$pg_super_role" ]]; then
  pg_super_role="${config_super_role:-${existing_super_role:-supabase_admin}}"
fi

if [[ -z "$pg_super_password" && -n "$credentials_super_password" ]]; then
  pg_super_password="$credentials_super_password"
fi

if [[ -z "$pg_super_password" ]]; then
  if [[ -n "$config_super_password" ]]; then
    pg_super_password="$config_super_password"
  elif [[ -n "$existing_super_password" ]]; then
    pg_super_password="$existing_super_password"
  elif [[ "$interactive" == true ]]; then
    read -rsp "Enter Supabase superuser password for lane '$lane' (role ${pg_super_role:-supabase_admin}): " pg_super_password
    echo
    if [[ -z "$pg_super_password" ]]; then
      echo "Supabase superuser password cannot be empty." >&2
      exit 1
    fi
  else
    echo "Supabase superuser password required. Provide --pg-super-password or set ${lane_upper}_SUPER_PASSWORD in $credentials_file." >&2
    exit 1
  fi
fi

update_superusers_file() {
  local key="$1" value="$2"
  local tmp
  tmp=$(mktemp)
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    $0 ~ "^" key "=" { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$superusers_file" >"$tmp"
  mv "$tmp" "$superusers_file"
  chmod 600 "$superusers_file"
}

update_superusers_file "$role_key" "$pg_super_role"
update_superusers_file "$password_key" "$pg_super_password"

cp "$superusers_file" "$lanes_dir/superusers.env"
chmod 600 "$lanes_dir/superusers.env"

if [[ -z "$existing_jwt_secret" ]]; then
  existing_jwt_secret="$(openssl rand -base64 32)"
fi
if [[ -z "$existing_anon_key" ]]; then
  existing_anon_key="$(openssl rand -hex 32)"
fi
if [[ -z "$existing_service_key" ]]; then
  existing_service_key="$(openssl rand -hex 32)"
fi

old_umask="$(umask)"
umask 177
cat <<ENV >"$state_env_file"
COMPOSE_PROJECT_NAME=supa-${lane}
LANE=${lane}
VOL_NS=${lane}

PGHOST=127.0.0.1
PGPORT=${pg_port}
PGDATABASE=${pg_db}
PGUSER=postgres
PGPASSWORD=${pg_password}
SUPABASE_SUPER_ROLE=${pg_super_role}
SUPABASE_SUPER_PASSWORD=${pg_super_password}

KONG_HTTP_PORT=${kong_port}
EDGE_PORT=${edge_port}
EDGE_ENV_FILE=${edge_env_file}

JWT_SECRET=${existing_jwt_secret}
ANON_KEY=${existing_anon_key}
SERVICE_ROLE_KEY=${existing_service_key}
ENV
chmod 600 "$state_env_file"
umask "$old_umask"

cp "$state_env_file" "$working_env_file"
chmod 600 "$working_env_file"

cat <<MSG
✅ Supabase lane '$lane' environment written to $state_env_file
   Postgres password: ${pg_password:+(stored)}
   Superuser role: $pg_super_role
MSG
