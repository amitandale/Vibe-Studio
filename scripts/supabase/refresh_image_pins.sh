#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: refresh_image_pins.sh [--arch linux/amd64]

Refreshes ops/supabase/images.lock.json with live docker digests for each pinned tag.
Requires docker and jq to be available on the host.
USAGE
}

arch="linux/amd64"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)
      arch="${2:?missing architecture value}"; shift 2 ;;
    -h|--help)
      usage
      exit 0 ;;
    *)
      echo "unknown option '$1'" >&2
      usage
      exit 2 ;;
  esac
done

for dep in jq docker; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    echo "$dep is required to refresh image pins" >&2
    exit 1
  fi
done

root="$(cd "$(dirname "$0")/../.." && pwd)"
lock_file="$root/ops/supabase/images.lock.json"
if [[ ! -f "$lock_file" ]]; then
  echo "lock file $lock_file not found" >&2
  exit 1
fi

os_part="${arch%%/*}"
arch_part="${arch##*/}"

verify_digest() {
  local ref="$1"
  if [[ "$ref" != *@sha256:* ]]; then
    return 1
  fi
  local digest="${ref##*@}"
  local name="${ref%%@*}"
  local repo="$name"
  if [[ "$name" == *":"* ]]; then
    local after_slash="${name##*/}"
    if [[ "$after_slash" == *":"* ]]; then
      local tag="${after_slash##*:}"
      repo="${name%:$tag}"
    fi
  fi
  local inspect_ref="${repo}@${digest}"
  if docker manifest inspect "$inspect_ref" >/dev/null 2>&1; then
    return 0
  fi
  if docker pull "$inspect_ref" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

resolve_digest_for_base() {
  local base_ref="$1"
  local manifest_json=""
  manifest_json=$(docker manifest inspect "$base_ref" 2>/dev/null || true)
  if [[ -n "$manifest_json" ]]; then
    local digest
    digest=$(jq -r --arg arch "$arch_part" --arg os "$os_part" '
      [
        (.manifests[]? | select((.platform.architecture // "") == $arch and (.platform.os // "linux") == $os) | .digest),
        (.manifests[]? | .digest)?,
        .Descriptor.digest?,
        .digest?,
        (.manifests[0].digest?)
      ]
      | map(select(. != null and . != ""))
      | first // empty
    ' <<<"$manifest_json")
    if [[ -n "$digest" ]]; then
      local candidate="${base_ref%@*}@${digest}"
      if verify_digest "$candidate"; then
        printf '%s\n' "$candidate"
        return 0
      fi
    fi
  fi

  if docker pull "$base_ref" >/dev/null 2>&1; then
    local repo_digest
    repo_digest=$(docker image inspect "$base_ref" --format '{{index .RepoDigests 0}}' 2>/dev/null | head -n1 || true)
    if [[ -n "$repo_digest" ]]; then
      local repo_only="${repo_digest%%@*}"
      local digest_only="${repo_digest##*@}"
      local tagged_repo="$base_ref"
      if [[ "$tagged_repo" == *@* ]]; then
        tagged_repo="${tagged_repo%@*}"
      fi
      if [[ "$tagged_repo" != *":"* ]]; then
        tagged_repo="$repo_only"
      fi
      local candidate="${tagged_repo%@*}@${digest_only}"
      if verify_digest "$candidate"; then
        printf '%s\n' "$candidate"
        return 0
      fi
      candidate="${repo_only}@${digest_only}"
      if verify_digest "$candidate"; then
        printf '%s\n' "$candidate"
        return 0
      fi
    fi
  fi
  return 1
}

declare -A default_tags=(
  [DB_IMAGE]="supabase/postgres:15.8.1.135",
  [AUTH_IMAGE]="supabase/gotrue:v2.180.0",
  [REST_IMAGE]="postgrest/postgrest:v13.0.7",
  [REALTIME_IMAGE]="supabase/realtime:v2.56.0",
  [STORAGE_IMAGE]="supabase/storage-api:v1.28.1",
  [IMGPROXY_IMAGE]="darthsim/imgproxy:v3.15.1",
  [EDGE_IMAGE]="supabase/edge-runtime:v1.49.3",
  [KONG_IMAGE]="kong:3.4.3"
)

mapfile -t entries < <(jq -r '.images | to_entries[] | "\(.key)=\(.value)"' "$lock_file")

changed=false
tmp_map=$(mktemp)
trap 'rm -f "$tmp_map"' EXIT

for entry in "${entries[@]}"; do
  key="${entry%%=*}"
  current="${entry#*=}"
  base="${current%@*}"
  if [[ -z "$base" ]]; then
    echo "unable to determine base reference for $key" >&2
    exit 1
  fi

  repo="${base%%:*}"
  tag=""
  if [[ "$base" == *":"* ]]; then
    tag="${base##*:}"
  fi

  declare -a attempts=("$base")
  declare -A attempt_notes=()

  if [[ -n "${default_tags[$key]:-}" ]]; then
    default_ref="${default_tags[$key]}"
    if [[ "$default_ref" != "$base" ]]; then
      attempts+=("$default_ref")
      attempt_notes["$default_ref"]="⚠️  $key: using default pin $default_ref"
    fi
  fi

  resolved=""
  declare -A seen=()
  for attempt in "${attempts[@]}"; do
    if [[ -z "$attempt" || -n "${seen[$attempt]:-}" ]]; then
      continue
    fi
    seen[$attempt]=1
    candidate="$(resolve_digest_for_base "$attempt")" || continue
    if verify_digest "$candidate"; then
      resolved="$candidate"
      if [[ -n "${attempt_notes[$attempt]:-}" ]]; then
        echo "${attempt_notes[$attempt]}" >&2
      fi
      break
    fi
  done

  if [[ -z "$resolved" ]]; then
    echo "failed to resolve digest for $key (attempted ${attempts[*]})" >&2
    exit 1
  fi

  if [[ "$resolved" != "$current" ]]; then
    changed=true
  fi
  printf '%s=%s\n' "$key" "$resolved" >>"$tmp_map"
done

if [[ "$changed" == true ]]; then
  python3 - "$lock_file" "$tmp_map" <<'PY'
import json, os, sys
lock_path = sys.argv[1]
map_path = sys.argv[2]
with open(lock_path, 'r', encoding='utf-8') as fh:
    data = json.load(fh)
images = data.setdefault('images', {})
with open(map_path, 'r', encoding='utf-8') as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        key, value = line.split('=', 1)
        images[key] = value
tmp_path = lock_path + '.tmp'
with open(tmp_path, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, indent=2)
    fh.write('\n')
os.replace(tmp_path, lock_path)
PY
  echo "✅ Refreshed Supabase image pins in $lock_file" >&2
else
  echo "ℹ️  Supabase image pins already up to date" >&2
fi

exit 0
