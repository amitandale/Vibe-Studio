#!/usr/bin/env bash
set -euo pipefail
lane="${1:?lane}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
repo_envfile="$root/ops/supabase/lanes/${lane}.env"
credentials_file="$root/ops/supabase/lanes/credentials.env"

if [[ ! -f "$repo_envfile" ]]; then
  echo "lane env file $repo_envfile missing" >&2
  exit 1
fi

if [[ ! -f "$credentials_file" ]]; then
  echo "credentials file $credentials_file missing" >&2
  exit 1
fi

cleanup_files=()
cleanup() {
  local file
  for file in "${cleanup_files[@]}"; do
    [[ -f "$file" ]] && rm -f "$file"
  done
}
trap cleanup EXIT

lane_upper="${lane^^}"
# shellcheck disable=SC1090
source "$credentials_file"
pg_password_var="${lane_upper}_PG_PASSWORD"
super_role_var="${lane_upper}_SUPER_ROLE"
super_password_var="${lane_upper}_SUPER_PASSWORD"

pg_password="${!pg_password_var:-}"
if [[ -z "$pg_password" ]]; then
  echo "${pg_password_var} missing in $credentials_file" >&2
  exit 1
fi

super_role="${!super_role_var:-supabase_admin}"
if [[ "$super_role" == supabase_admin_${lane} ]]; then
  super_role="supabase_admin"
fi

super_password="${!super_password_var:-}"
if [[ -z "$super_password" ]]; then
  echo "${super_password_var} missing in $credentials_file" >&2
  exit 1
fi

mapfile -t env_lines <"$repo_envfile"
pg_port=""
host_port=""
for idx in "${!env_lines[@]}"; do
  line="${env_lines[$idx]}"
  case "$line" in
    PGPORT=*)
      pg_port="${line#PGPORT=}"
      ;;
    PGHOST_PORT=*)
      host_port="${line#PGHOST_PORT=}"
      ;;
  esac
done

if [[ -z "$pg_port" ]]; then
  pg_port="5432"
fi
if [[ -z "$host_port" ]]; then
  host_port="$pg_port"
fi

tmp_env="$(mktemp)"
cleanup_files+=("$tmp_env")
{
  for line in "${env_lines[@]}"; do
    case "$line" in
      PGPORT=*)
        printf 'PGPORT=5432\n'
        ;;
      PGHOST_PORT=*)
        printf 'PGHOST_PORT=%s\n' "$host_port"
        ;;
      PGPASSWORD=*|SUPABASE_SUPER_PASSWORD=*|SUPABASE_SUPER_ROLE=*)
        ;;
      *)
        printf '%s\n' "$line"
        ;;
    esac
  done
  printf 'PGPASSWORD=%s\n' "$pg_password"
  printf 'SUPABASE_SUPER_ROLE=%s\n' "$super_role"
  printf 'SUPABASE_SUPER_PASSWORD=%s\n' "$super_password"
} >"$tmp_env"

docker compose --env-file "$tmp_env" -f "$root/ops/supabase/docker-compose.yml" restart edge-runtime
