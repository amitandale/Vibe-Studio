#!/usr/bin/env bash
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ python3 is required to patch Supabase docker assets." >&2
  exit 1
fi

root="$(git rev-parse --show-toplevel)"
ref_file="$root/ops/supabase/SUPABASE_DOCKER_REF"
official_dir="$root/ops/supabase/lanes/latest-docker"
compose_copy="$root/ops/supabase/lanes/latest-docker-compose.yml"
env_copy="$root/ops/supabase/lanes/latest-docker.env"
marker_file="$official_dir/.supabase_ref"
commit_file="$official_dir/.supabase_commit"

if [[ ! -f "$ref_file" ]]; then
  echo "❌ Missing Supabase reference file: $ref_file" >&2
  exit 1
fi

supabase_ref="$(<"$ref_file")"
if [[ -z "$supabase_ref" ]]; then
  echo "❌ Supabase reference file is empty: $ref_file" >&2
  exit 1
fi

if [[ -f "$marker_file" ]]; then
  current_ref="$(<"$marker_file")"
else
  current_ref=""
fi

patch_db_port_mapping() {
  local compose_file="$1"
  if [[ ! -f "$compose_file" ]]; then
    echo "⚠️  Supabase compose file missing at $compose_file; skipped port patch." >&2
    return
  fi

  python3 - "$compose_file" <<'PY'
import sys
from pathlib import Path

compose_path = Path(sys.argv[1])
lines = compose_path.read_text().splitlines()

target_mapping = '      - "${PGHOST_PORT}:5432"'
ports_line = '    ports:'

db_start = None
for idx, line in enumerate(lines):
    if line.startswith('  db:'):
        db_start = idx
        break

if db_start is None:
    print('⚠️  Unable to locate db service in docker-compose.yml; skipped port patch.', file=sys.stderr)
    sys.exit(0)

block_end = db_start + 1
while block_end < len(lines):
    line = lines[block_end]
    if line.startswith('  ') and not line.startswith('    '):
        break
    stripped = line.strip()
    if 'PGHOST_PORT' in stripped and stripped.endswith(':5432"'):
        print('Supabase docker-compose already includes PGHOST_PORT mapping for db service.')
        sys.exit(0)
    block_end += 1

ports_index = None
for idx in range(db_start + 1, block_end):
    stripped = lines[idx].strip()
    if stripped.startswith('#') or stripped == '':
        continue
    if stripped.startswith('ports:'):
        ports_index = idx
        break

if ports_index is None:
    insert_at = db_start + 1
    while insert_at < block_end and (lines[insert_at].strip() == '' or lines[insert_at].lstrip().startswith('#')):
        insert_at += 1
    lines.insert(insert_at, ports_line)
    lines.insert(insert_at + 1, target_mapping)
else:
    insert_at = ports_index + 1
    while insert_at < block_end and lines[insert_at].strip().startswith('- '):
        stripped = lines[insert_at].strip()
        if 'PGHOST_PORT' in stripped and stripped.endswith(':5432"'):
            print('Supabase docker-compose already includes PGHOST_PORT mapping for db service.')
            sys.exit(0)
        insert_at += 1
    lines.insert(insert_at, target_mapping)

compose_path.write_text('\n'.join(lines) + '\n')
print('Added PGHOST_PORT mapping to Supabase db service.')
PY
}

if [[ -n "$current_ref" && "$current_ref" == "$supabase_ref" && -d "$official_dir" && -f "$commit_file" ]]; then
  echo "Supabase docker assets already synced at $supabase_ref"
else
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  echo "Downloading Supabase docker assets @ $supabase_ref"
  if ! git clone --filter=blob:none --sparse https://github.com/supabase/supabase.git "$tmpdir/supabase"; then
    echo "❌ Unable to clone supabase/supabase repository. Check network connectivity." >&2
    exit 1
  fi

  pushd "$tmpdir/supabase" >/dev/null

  if ! git fetch origin "$supabase_ref" --depth 1; then
    echo "❌ Supabase ref '$supabase_ref' not found. Update ops/supabase/SUPABASE_DOCKER_REF to a valid tag or commit." >&2
    exit 1
  fi

  git checkout FETCH_HEAD
  git sparse-checkout init --cone
  git sparse-checkout set docker
  commit_sha="$(git rev-parse HEAD)"
  popd >/dev/null

  rm -rf "$official_dir"
  mkdir -p "$official_dir"
  cp -a "$tmpdir/supabase/docker/." "$official_dir/"

  echo "$supabase_ref" > "$marker_file"
  echo "$commit_sha" > "$commit_file"

  rm -rf "$tmpdir"
  trap - EXIT

  echo "Synced Supabase docker assets at commit $commit_sha"
fi

patch_db_port_mapping "$official_dir/docker-compose.yml"

if [[ -f "$official_dir/docker-compose.yml" ]]; then
  cp "$official_dir/docker-compose.yml" "$compose_copy"
fi

if [[ -f "$official_dir/.env.example" ]]; then
  cp "$official_dir/.env.example" "$env_copy"
fi

if [[ -f "$commit_file" ]]; then
  printf '%s (%s)\n' "$supabase_ref" "$(<"$commit_file")"
else
  printf '%s\n' "$supabase_ref"
fi
