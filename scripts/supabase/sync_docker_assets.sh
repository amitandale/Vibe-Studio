#!/usr/bin/env bash
set -euo pipefail

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

if [[ -n "$current_ref" && "$current_ref" == "$supabase_ref" && -d "$official_dir" && -f "$commit_file" ]]; then
  echo "Supabase docker assets already synced at $supabase_ref"
else
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  echo "Downloading Supabase docker assets @ $supabase_ref"
  git clone --filter=blob:none --sparse https://github.com/supabase/supabase.git "$tmpdir/supabase"
  pushd "$tmpdir/supabase" >/dev/null
  git fetch origin "$supabase_ref" --depth 1
  git checkout FETCH_HEAD
  git sparse-checkout set docker
  commit_sha="$(git rev-parse HEAD)"
  popd >/dev/null

  rm -rf "$official_dir"
  mkdir -p "$official_dir"
  cp -a "$tmpdir/supabase/docker/." "$official_dir/"
  echo "$supabase_ref" > "$marker_file"
  echo "$commit_sha" > "$commit_file"

  cp "$official_dir/docker-compose.yml" "$compose_copy"
  cp "$official_dir/.env.example" "$env_copy"

  rm -rf "$tmpdir"
  trap - EXIT

  echo "Synced Supabase docker assets at commit $commit_sha"
fi

if [[ -f "$commit_file" ]]; then
  printf '%s (%s)\n' "$supabase_ref" "$(<"$commit_file")"
else
  printf '%s\n' "$supabase_ref"
fi
