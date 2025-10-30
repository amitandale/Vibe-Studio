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
ensure_writable_dir() {
  local dir="$1"
  [[ -z "$dir" ]] && return 0
  if [[ ! -d "$dir" ]]; then
    if ! mkdir -p "$dir" 2>/dev/null; then
      local parent
      parent="$(dirname "$dir")"
      if [[ -d "$parent" ]]; then
        ensure_writable_dir "$parent" || return 1
      fi
      mkdir -p "$dir"
    fi
  fi
  if [[ -w "$dir" && -x "$dir" ]]; then
    return 0
  fi
  local uid gid
  uid="$(id -u)"
  gid="$(id -g)"
  if command -v sudo >/dev/null 2>&1; then
    if sudo chown -R "$uid":"$gid" "$dir" 2>/dev/null; then
      return 0
    fi
  fi
  if [[ -O "$dir" ]]; then
    chmod -R u+rwX "$dir"
  fi
  if [[ ! -w "$dir" || ! -x "$dir" ]]; then
    echo "warning: unable to regain write access to $dir" >&2
    return 1
  fi
}
ensure_database_access() {
  local super_role="$1"
  local super_password="$2"
  local lane_password="$3"
  local container_role="$4"
  local container_password="$5"

  if [[ -z "$super_role" || -z "$super_password" ]]; then
    echo "missing superuser credentials; ensure ${lane}.env and credentials.env expose ${lane_upper}_SUPER_ROLE and ${lane_upper}_SUPER_PASSWORD" >&2
    exit 1
  fi

  local admin_psql_base=(
    psql
    -v
    ON_ERROR_STOP=1
    -h "$pg_host"
    -p "$pg_host_port"
    -U "$super_role"
    -d postgres
  )

  if ! PGPASSWORD="$super_password" "${admin_psql_base[@]}" -tAc 'SELECT 1' >/dev/null 2>&1; then
    echo "unable to authenticate as superuser role $super_role" >&2
    exit 1
  fi

  PGPASSWORD="$super_password" "${admin_psql_base[@]}" -v role="$PGUSER" -v password="$lane_password" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') THEN
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', :'role', :'password');
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'role', :'password');
  END IF;
END
$$;
SQL

  if [[ -n "$container_role" && -n "$container_password" && "$container_role" != "$PGUSER" ]]; then
    PGPASSWORD="$super_password" "${admin_psql_base[@]}" -v role="$container_role" -v password="$container_password" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') THEN
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', :'role', :'password');
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'role', :'password');
  END IF;
END
$$;
SQL
  fi

  local have_db
  have_db=$(PGPASSWORD="$super_password" "${admin_psql_base[@]}" -v db="$PGDATABASE" -tAc "SELECT 1 FROM pg_database WHERE datname = :'db'" || true)
  if [[ "$have_db" != "1" ]]; then
    PGPASSWORD="$super_password" "${admin_psql_base[@]}" -v db="$PGDATABASE" -v role="$PGUSER" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'role')
\gexec
SQL
  fi

  PGPASSWORD="$super_password" "${admin_psql_base[@]}" -v db="$PGDATABASE" -v role="$PGUSER" <<'SQL'
SELECT format('ALTER DATABASE %I OWNER TO %I', :'db', :'role')
\gexec
SELECT format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', :'db', :'role')
\gexec
SQL

  local admin_db_psql=(
    psql
    -v
    ON_ERROR_STOP=1
    -h "$pg_host"
    -p "$pg_host_port"
    -U "$super_role"
    -d "$PGDATABASE"
  )

  PGPASSWORD="$super_password" "${admin_db_psql[@]}" -v role="$PGUSER" <<'SQL'
SELECT format('ALTER SCHEMA public OWNER TO %I', :'role')
\gexec
SELECT format('GRANT ALL PRIVILEGES ON SCHEMA public TO %I', :'role')
\gexec
SELECT format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %I', :'role')
\gexec
SELECT format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %I', :'role')
\gexec
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO %I', :'role')
\gexec
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO %I', :'role')
\gexec
SQL
}
repo_envfile="$root/ops/supabase/lanes/${lane}.env"
credentials_file="$root/ops/supabase/lanes/credentials.env"
ensure_writable_dir "$root"
if [[ -n "${SUPABASE_STATE_DIR:-}" ]]; then
  ensure_writable_dir "$SUPABASE_STATE_DIR"
fi

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

if [[ -z "${PGPASSWORD:-}" ]]; then
  echo "PGPASSWORD missing from $repo_envfile; regenerate the lane env before running migrations." >&2
  exit 1
fi

lane_role_password="$PGPASSWORD"
pg_host="${PGHOST:-127.0.0.1}"
if [[ -n "${PGPORT:-}" ]]; then
  pg_host_port="$PGPORT"
elif [[ -n "${PGHOST_PORT:-}" ]]; then
  pg_host_port="$PGHOST_PORT"
else
  pg_host_port="5432"
fi

psql_base=(
  psql
  -v
  ON_ERROR_STOP=1
  -h "$pg_host"
  -p "$pg_host_port"
  -U "$PGUSER"
  -d "$PGDATABASE"
)

lane_upper="${lane^^}"
# shellcheck disable=SC1090
source "$credentials_file"

pg_password_var="${lane_upper}_PG_PASSWORD"
expected_container_password="${!pg_password_var:-}"
if [[ -z "$expected_container_password" ]]; then
  echo "${pg_password_var} missing in $credentials_file; cannot compute container credentials." >&2
  exit 1
fi

super_role_var="${lane_upper}_SUPER_ROLE"
super_password_var="${lane_upper}_SUPER_PASSWORD"
super_role="${!super_role_var:-${SUPABASE_SUPER_ROLE:-}}"
super_password="${!super_password_var:-${SUPABASE_SUPER_PASSWORD:-}}"

if [[ -z "$super_role" || -z "$super_password" ]]; then
  echo "${super_role_var}/${super_password_var} missing in $credentials_file; cannot authenticate as Supabase superuser." >&2
  exit 1
fi

if [[ "${SUPABASE_SUPER_PASSWORD:-}" != "${super_password}" ]]; then
  echo "Warning: SUPABASE_SUPER_PASSWORD in $repo_envfile differs from credentials.env; using canonical value." >&2
fi

if [[ "$PGUSER" != "$super_role" ]]; then
  echo "PGUSER ('$PGUSER') differs from expected superuser '$super_role'; regenerate the lane env." >&2
  exit 1
fi

if [[ "$lane_role_password" != "$super_password" ]]; then
  echo "PGPASSWORD from $repo_envfile does not match ${super_password_var} in credentials.env." >&2
  exit 1
fi

if [[ -n "${POSTGRES_PASSWORD:-}" && "$POSTGRES_PASSWORD" != "$expected_container_password" ]]; then
  echo "POSTGRES_PASSWORD in $repo_envfile does not match ${pg_password_var}; regenerate the lane env." >&2
  exit 1
fi

export PGPASSWORD="$lane_role_password"

ensure_database_access "$super_role" "$super_password" "$lane_role_password" "${POSTGRES_USER:-}" "${POSTGRES_PASSWORD:-}"
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
