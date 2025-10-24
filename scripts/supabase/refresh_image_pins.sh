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

for dep in jq docker curl; do
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

resolve_digest() {
  local base_ref="$1"
  local manifest_json=""
  manifest_json=$(docker manifest inspect "$base_ref" 2>/dev/null || true)
  if [[ -n "$manifest_json" ]]; then
    local digest
    digest=$(jq -r --arg arch "$arch_part" --arg os "$os_part" '
      [
        (.manifests[]? | select((.platform.architecture // "") == $arch and (.platform.os // "linux") == $os) | .digest),
        .Descriptor.digest?,
        .digest?,
        (.manifests[]? | .digest)?,
        (.manifests[0].digest?)
      ]
      | map(select(. != null and . != ""))
      | first // empty
    ' <<<"$manifest_json")
    if [[ -n "$digest" ]]; then
      printf '%s@%s\n' "$base_ref" "$digest"
      return 0
    fi
  fi

  if docker pull "$base_ref" >/dev/null 2>&1; then
    local repo_digest
    repo_digest=$(docker image inspect "$base_ref" --format '{{index .RepoDigests 0}}' 2>/dev/null | head -n1 || true)
    if [[ -n "$repo_digest" ]]; then
      printf '%s\n' "$repo_digest"
      return 0
    fi
  fi
  return 1
}

docker_hub_repo_path() {
  local image_repo="$1"
  if [[ "$image_repo" == *.*/* ]]; then
    # contains an explicit registry host (e.g. public.ecr.aws) – skip fallback
    return 1
  fi
  if [[ "$image_repo" == *"/"* ]]; then
    printf '%s\n' "$image_repo"
    return 0
  fi
  printf 'library/%s\n' "$image_repo"
  return 0
}

fetch_latest_tag_from_hub() {
  local repo_path="$1"
  local prefix="$2"
  local next_url="https://registry.hub.docker.com/v2/repositories/${repo_path}/tags?page_size=100&ordering=last_updated"
  local jq_filter
  if [[ -n "$prefix" ]]; then
    jq_filter='(.results // []) | map(select((.name // "") | startswith($prefix))) | sort_by(.last_updated) | reverse | (.[0].name // "")'
  else
    jq_filter='(.results // []) | sort_by(.last_updated) | reverse | (.[0].name // "")'
  fi

  while [[ -n "$next_url" ]]; do
    local payload
    payload=$(curl -fsSL "$next_url" 2>/dev/null || true)
    if [[ -z "$payload" ]]; then
      return 1
    fi
    local candidate
    candidate=$(jq -r --arg prefix "$prefix" "$jq_filter" <<<"$payload")
    if [[ -n "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    next_url=$(jq -r '(.next // "")' <<<"$payload")
  done
  return 1
}

discover_fallback_tag() {
  local repo="$1"
  local tag="$2"
  local repo_path
  repo_path=$(docker_hub_repo_path "$repo") || return 1

  local prefixes=()
  local working="$tag"
  while [[ "$working" == *.* ]]; do
    working="${working%.*}"
    prefixes+=("$working")
  done
  working="$tag"
  while [[ "$working" == *-* ]]; do
    working="${working%-*}"
    prefixes+=("$working")
  done
  prefixes+=("")

  for prefix in "${prefixes[@]}"; do
    local candidate
    candidate=$(fetch_latest_tag_from_hub "$repo_path" "$prefix" 2>/dev/null || true)
    if [[ -n "$candidate" && "$candidate" != "$tag" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

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
  resolved="$(resolve_digest "$base")" || {
    repo="${base%%:*}"
    tag="${base##*:}"
    if [[ -z "$repo" || -z "$tag" || "$repo" == "$base" ]]; then
      echo "failed to resolve digest for $key ($base)" >&2
      exit 1
    fi
    fallback_tag=$(discover_fallback_tag "$repo" "$tag" 2>/dev/null || true)
    if [[ -z "$fallback_tag" ]]; then
      echo "failed to resolve digest for $key ($base)" >&2
      exit 1
    fi
    fallback_ref="$repo:$fallback_tag"
    echo "⚠️  $key: falling back from $base to $fallback_ref" >&2
    resolved="$(resolve_digest "$fallback_ref")" || {
      echo "failed to resolve digest for $key using fallback $fallback_ref" >&2
      exit 1
    }
  }
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
