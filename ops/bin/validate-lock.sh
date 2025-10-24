#!/usr/bin/env bash
set -euo pipefail
file="${1:?lock file}"
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for validate-lock.sh" >&2
  exit 1
fi

docker_available=false
if command -v docker >/dev/null 2>&1; then
  docker_available=true
fi
if ! test -f "$file"; then
  echo "lock file $file not found" >&2
  exit 1
fi
jq -e '.images | length > 0' "$file" > /dev/null
jq -r '.images | to_entries[] | "\(.key)=\(.value)"' "$file" | while IFS='=' read -r key image; do
  if [[ -z "$image" ]]; then
    echo "image for $key missing" >&2
    exit 1
  fi
  if [[ "$image" != *@sha256:* ]]; then
    echo "image $key must be pinned by digest" >&2
    exit 1
  fi
  if [[ "$docker_available" == true ]]; then
    inspect_ref="$image"
    if [[ "$image" == *@sha256:* ]]; then
      digest="${image##*@}"
      name="${image%%@*}"
      repo="$name"
      if [[ "$name" == *":"* ]]; then
        after_slash="${name##*/}"
        if [[ "$after_slash" == *":"* ]]; then
          tag="${after_slash##*:}"
          repo="${name%:$tag}"
        fi
      fi
      inspect_ref="${repo}@${digest}"
    fi
    if ! docker manifest inspect "$inspect_ref" >/dev/null 2>&1; then
      base="${image%@*}"
      if docker manifest inspect "$base" >/dev/null 2>&1; then
        echo "image $key has an out-of-date digest; refresh with scripts/supabase/provision_lane_env.sh <lane> --random-pg-password --force" >&2
      else
        echo "unable to resolve docker manifest for $key ($image)" >&2
      fi
      exit 1
    fi
  fi
  export "$key"="$image"
done
