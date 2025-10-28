#!/usr/bin/env bash
set -euo pipefail

for bin in psql python3; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "required command '$bin' not found in PATH" >&2
    exit 1
  fi
done

lane="${1:?lane}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
repo_envfile="$root/ops/supabase/lanes/${lane}.env"
credentials_file="$root/ops/supabase/lanes/credentials.env"

if [[ ! -f "$repo_envfile" ]]; then
  echo "lane env file $repo_envfile missing; run scripts/supabase/provision_lane_env.sh $lane --pg-password <password>" >&2
  exit 1
fi

if [[ ! -f "$credentials_file" ]]; then
  echo "credentials file $credentials_file missing; populate it before running migrations." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$repo_envfile"; set +a

lane_upper="${lane^^}"
# shellcheck disable=SC1090
source "$credentials_file"
pg_password_var="${lane_upper}_PG_PASSWORD"
pg_password="${!pg_password_var:-}"
if [[ -z "$pg_password" ]]; then
  echo "${pg_password_var} missing in $credentials_file; cannot compute connection string." >&2
  exit 1
fi
export PGPASSWORD="$pg_password"

pg_host="${PGHOST:-127.0.0.1}"
pg_host_port="${PGHOST_PORT:-${PGPORT:-5432}}"
psql_base=(
  psql
  -v
  ON_ERROR_STOP=1
  -h "$pg_host"
  -p "$pg_host_port"
  -U "$PGUSER"
  -d "$PGDATABASE"
)
LOCK_KEY=$(python3 - <<'PY'
import os
import zlib
name = os.environ['PGDATABASE'].encode()
print(zlib.adler32(b"supabase:migrations:" + name))
PY
)
"${psql_base[@]}" <<'SQL'
BEGIN;
CREATE SCHEMA IF NOT EXISTS public;
CREATE TABLE IF NOT EXISTS public.__migrations(
  id text PRIMARY KEY,
  applied_at timestamptz DEFAULT now() NOT NULL
);
COMMIT;
SQL
apply_tx() {
  local file="$1"
  local id
  id="$(basename "$file")"
  local have
  have=$("${psql_base[@]}" -tAc "select 1 from public.__migrations where id='${id}'" || true)
  if [[ "$have" == "1" ]]; then
    return 0
  fi
  "${psql_base[@]}" <<SQL
BEGIN;
SELECT pg_advisory_lock(${LOCK_KEY});
\i '$file'
INSERT INTO public.__migrations(id) VALUES ('${id}');
SELECT pg_advisory_unlock(${LOCK_KEY});
COMMIT;
SQL
}
apply_nt() {
  local file="$1"
  local id
  id="$(basename "$file")"
  local have
  have=$("${psql_base[@]}" -tAc "select 1 from public.__migrations where id='${id}'" || true)
  if [[ "$have" == "1" ]]; then
    return 0
  fi
  "${psql_base[@]}" <<SQL
SELECT pg_advisory_lock(${LOCK_KEY});
\i '$file'
INSERT INTO public.__migrations(id) VALUES ('${id}');
SELECT pg_advisory_unlock(${LOCK_KEY});
SQL
}
shopt -s nullglob
files=("$root"/supabase/migrations/*.sql)
if (( ${#files[@]} )); then
  IFS=$'\n' read -r -d '' -a sorted < <(printf '%s\n' "${files[@]}" | sort && printf '\0')
  for file in "${sorted[@]}"; do
    if [[ "$file" == *.nt.sql ]]; then
      apply_nt "$file"
    else
      apply_tx "$file"
    fi
  done
fi
"${psql_base[@]}" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '__migrations'
  ) THEN
    RAISE EXCEPTION 'migration registry missing';
  END IF;
END
$$;
SQL
