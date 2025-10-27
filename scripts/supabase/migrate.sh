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
state_root="${SUPABASE_STATE_DIR:-$HOME/.config/vibe-studio/supabase}"
state_envfile="$state_root/lanes/${lane}.env"
repo_envfile="$root/ops/supabase/lanes/${lane}.env"
if [[ -f "$state_envfile" ]]; then
  envfile="$state_envfile"
elif [[ -f "$repo_envfile" ]]; then
  envfile="$repo_envfile"
else
  echo "lane env file $repo_envfile missing; run scripts/supabase/provision_lane_env.sh $lane --pg-password <password>" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$envfile"; set +a
PGURL="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}"
LOCK_KEY=$(python3 - <<'PY'
import os
import zlib
name = os.environ['PGDATABASE'].encode()
print(zlib.adler32(b"supabase:migrations:" + name))
PY
)
psql "$PGURL" -v ON_ERROR_STOP=1 <<'SQL'
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
  have=$(psql "$PGURL" -tAc "select 1 from public.__migrations where id='${id}'" || true)
  if [[ "$have" == "1" ]]; then
    return 0
  fi
  psql "$PGURL" -v ON_ERROR_STOP=1 <<SQL
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
  have=$(psql "$PGURL" -tAc "select 1 from public.__migrations where id='${id}'" || true)
  if [[ "$have" == "1" ]]; then
    return 0
  fi
  psql "$PGURL" -v ON_ERROR_STOP=1 <<SQL
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
psql "$PGURL" -v ON_ERROR_STOP=1 <<'SQL'
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
