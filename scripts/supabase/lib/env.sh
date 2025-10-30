#!/usr/bin/env bash

# Shared helpers for Supabase lane environment management.

supabase_build_db_url() {
  local user="${1:-}" password="${2:-}" host="${3:-}" port="${4:-}" database="${5:-}"
  if [[ -z "$host" || -z "$database" ]]; then
    echo "supabase_build_db_url requires host and database" >&2
    return 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to build Supabase database URLs" >&2
    return 1
  fi
  python3 - "$user" "$password" "$host" "$port" "$database" <<'PY'
import sys
from urllib.parse import quote

user = quote(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else ""
password = sys.argv[2] if len(sys.argv) > 2 else ""
host = sys.argv[3] if len(sys.argv) > 3 else ""
port = sys.argv[4] if len(sys.argv) > 4 else ""
database = quote(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] else ""

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
