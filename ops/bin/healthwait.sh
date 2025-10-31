#!/usr/bin/env bash
set -euo pipefail

if ! command -v curl >/dev/null 2>&1; then
  echo "required command 'curl' not found in PATH" >&2
  exit 1
fi

url="${1:?url}"
limit="${2:-60}"
end=$((SECONDS + limit))
while (( SECONDS <= end )); do
  if curl -fsS "$url" >/dev/null 2>&1; then
    exit 0
  fi
  sleep 2
done
echo "timed out waiting for $url" >&2
exit 1
