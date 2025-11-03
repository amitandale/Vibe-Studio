#!/usr/bin/env bash

# Shared helpers for Supabase lane environment management.

supabase_build_db_url() {
  local user="${1:-}" password="${2:-}" host="${3:-}" port="${4:-}" database="${5:-}" query="${6:-}"
  if [[ -z "$host" || -z "$database" ]]; then
    echo "supabase_build_db_url requires host and database" >&2
    return 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to build Supabase database URLs" >&2
    return 1
  fi
python3 - "$user" "$password" "$host" "$port" "$database" "$query" <<'PY'
import sys
from urllib.parse import quote

def encode(value: str) -> str:
    return quote(value, safe="")

user = encode(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else ""
password_raw = sys.argv[2] if len(sys.argv) > 2 else ""
host = sys.argv[3] if len(sys.argv) > 3 else ""
port = sys.argv[4] if len(sys.argv) > 4 else ""
database = encode(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] else ""
query = sys.argv[6] if len(sys.argv) > 6 else ""

auth = ""
if user:
    if password_raw:
        auth = f"{user}:{encode(password_raw)}@"
    else:
        auth = f"{user}@"
elif password_raw:
    auth = f":{encode(password_raw)}@"

endpoint = host
if port:
    endpoint = f"{host}:{port}"

if query:
    if not query.startswith("?"):
        query = f"?{query}"

print(f"postgresql://{auth}{endpoint}/{database}{query}")
PY
}

supabase_db_url_user() {
  local url="${1:-}"
  if [[ -z "$url" ]]; then
    return 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to parse Supabase database URLs" >&2
    return 1
  fi
  python3 - "$url" <<'PY'
import sys
from urllib.parse import urlparse

parsed = urlparse(sys.argv[1])
if parsed.username:
    print(parsed.username)
PY
}

supabase_resolve_cli_db_url() {
  local current_cli_url="${SUPABASE_CLI_DB_URL:-}" host="${PGHOST:-}" port="${PGPORT:-${PGHOST_PORT:-}}"
  local user="${SUPABASE_CLI_DB_USER:-}"
  local password="${SUPABASE_CLI_DB_PASSWORD:-}"
  local database="${SUPABASE_CLI_DB_NAME:-${PGDATABASE:-${POSTGRES_DB:-}}}"
  local super_user="${SUPABASE_SUPER_ROLE:-}"
  local super_password="${SUPABASE_SUPER_PASSWORD:-}"

  if [[ -z "$user" ]]; then
    if [[ -n "$super_user" ]]; then
      user="$super_user"
    elif [[ -n "${POSTGRES_USER:-}" ]]; then
      user="$POSTGRES_USER"
    elif [[ -n "${PGUSER:-}" ]]; then
      user="$PGUSER"
    fi
  fi

  if [[ -z "$password" ]]; then
    if [[ -n "$super_password" ]]; then
      password="$super_password"
    elif [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
      password="$POSTGRES_PASSWORD"
    elif [[ -n "${PGPASSWORD:-}" ]]; then
      password="$PGPASSWORD"
    fi
  fi

  local prefer_superuser="${SUPABASE_FORCE_SUPERUSER_CLI:-1}"
  local super_cli_url=""
  if [[ -n "$super_user" && -n "$host" && -n "$port" && -n "$database" ]]; then
    super_cli_url="$(supabase_build_db_url "$super_user" "$super_password" "$host" "$port" "$database" "sslmode=disable" 2>/dev/null || true)"
  fi

  if [[ -n "$super_cli_url" ]]; then
    if [[ -z "$current_cli_url" ]]; then
      printf '%s' "$super_cli_url"
      return 0
    fi

    local current_user=""
    current_user="$(supabase_db_url_user "$current_cli_url" 2>/dev/null || true)"

    if [[ "$prefer_superuser" == "1" || "$prefer_superuser" == "true" ]]; then
      if [[ -z "$current_user" || "$current_user" != "$super_user" ]]; then
        printf '%s' "$super_cli_url"
        return 0
      fi
    fi
  fi

  if [[ -n "$current_cli_url" ]]; then
    printf '%s' "$current_cli_url"
    return 0
  fi

  if [[ -z "$host" || -z "$port" || -z "$user" || -z "$database" ]]; then
    return 1
  fi

  supabase_build_db_url "$user" "$password" "$host" "$port" "$database" "sslmode=disable"
}

supabase_update_env_var() {
  local file="${1:?file}" key="${2:?key}" value="${3:-}"
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to update Supabase environment files" >&2
    return 1
  fi
  python3 - "$file" "$key" "$value" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]

escaped = value.replace("\\", "\\\\").replace('"', '\\"')
line = f'{key}="{escaped}"'

if path.exists():
    lines = path.read_text().splitlines()
else:
    lines = []

prefix = f"{key}="
for idx, current in enumerate(lines):
    if current.startswith(prefix):
        if current == line:
            sys.exit(0)
        lines[idx] = line
        break
else:
    lines.append(line)

path.write_text("\n".join(lines) + "\n")
PY
  local status=$?
  if [[ $status -eq 0 ]]; then
    chmod 600 "$file" 2>/dev/null || true
  fi
  return $status
}
