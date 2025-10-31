#!/usr/bin/env bash
set -euo pipefail

__supabase_cli_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
__supabase_cli_env_helpers="$__supabase_cli_root/scripts/supabase/lib/env.sh"
__supabase_cli_default_version="${SUPABASE_CLI_VERSION:-2.54.11}"

if [[ -f "$__supabase_cli_env_helpers" ]]; then
  # shellcheck disable=SC1090
  source "$__supabase_cli_env_helpers"
fi

supabase_cli_state_dir() {
  local lane="$1"
  if [[ -n "${SUPABASE_STATE_DIR:-}" ]]; then
    printf '%s' "$SUPABASE_STATE_DIR"
    return
  fi
  printf '%s/.supabase/%s' "$__supabase_cli_root" "$lane"
}

supabase_cli_bin_dir() {
  local lane="$1"
  printf '%s/bin' "$(supabase_cli_state_dir "$lane")"
}

supabase_cli_bootstrap() {
  local lane="${1:-${LANE:-default}}"
  local desired_version="$__supabase_cli_default_version"
  local state_dir bin_dir version_file current_version

  state_dir="$(supabase_cli_state_dir "$lane")"
  bin_dir="$(supabase_cli_bin_dir "$lane")"
  version_file="$state_dir/.supabase-cli-version"

  mkdir -p "$bin_dir"

  if [[ -f "$version_file" ]]; then
    current_version="$(<"$version_file")"
  else
    current_version=""
  fi

  if [[ -x "$bin_dir/supabase" && "$current_version" == "$desired_version" ]]; then
    PATH="$bin_dir:$PATH"
    export PATH
    return 0
  fi

  local os arch tmpdir downloaded_asset downloaded_path url http_status curl_status
  local -a tarball_candidates=()
  local -a curl_errors=()
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$os" in
    linux|darwin) ;;
    *)
      echo "unsupported OS for Supabase CLI bootstrap: $os" >&2
      return 1
      ;;
  esac

  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch="amd64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)
      echo "unsupported architecture for Supabase CLI bootstrap: $arch" >&2
      return 1
      ;;
  esac

  tarball_candidates=("supabase_${desired_version}_${os}_${arch}.tar.gz")
  if [[ "$arch" == "amd64" ]]; then
    tarball_candidates+=("supabase_${desired_version}_${os}_x64.tar.gz")
  fi
  if [[ "$arch" == "arm64" ]]; then
    tarball_candidates+=("supabase_${desired_version}_${os}_arm64.tar.gz")
  fi
  if [[ "$os" == "linux" ]]; then
    tarball_candidates+=("supabase_${desired_version}_${os}_${arch}.deb")
  fi
  tmpdir="$(mktemp -d)"

  if ! command -v curl >/dev/null 2>&1; then
    rm -rf "$tmpdir"
    echo "required command 'curl' not found for Supabase CLI bootstrap" >&2
    return 1
  fi

  if ! command -v tar >/dev/null 2>&1; then
    rm -rf "$tmpdir"
    echo "required command 'tar' not found for Supabase CLI bootstrap" >&2
    return 1
  fi

  downloaded_asset=""
  downloaded_path=""

  for tarball in "${tarball_candidates[@]}"; do
    url="https://github.com/supabase/cli/releases/download/v${desired_version}/${tarball}"
    local curl_stderr="$tmpdir/curl.err"
    rm -f "$curl_stderr" "$tmpdir/$tarball"
    set +e
    http_status=$(curl -L --silent --show-error --write-out '%{http_code}' "$url" -o "$tmpdir/$tarball" 2>"$curl_stderr")
    curl_status=$?
    set -e
    if (( curl_status == 0 )) && [[ "$http_status" == "200" ]]; then
      downloaded_asset="$tarball"
      downloaded_path="$tmpdir/$tarball"
      break
    fi
    local err_msg
    err_msg="${url} => HTTP ${http_status:-unknown} (curl exit ${curl_status})"
    if [[ -s "$curl_stderr" ]]; then
      err_msg+=": $(tr -d '\r' <"$curl_stderr")"
    fi
    curl_errors+=("$err_msg")
    rm -f "$tmpdir/$tarball"
  done

  if [[ -z "$downloaded_asset" ]]; then
    rm -rf "$tmpdir"
    echo "failed to download Supabase CLI $desired_version from GitHub releases" >&2
    if (( ${#curl_errors[@]} > 0 )); then
      printf '  %s\n' "${curl_errors[@]}" >&2
    fi
    return 1
  fi

  local extracted_supabase=""
  case "$downloaded_asset" in
    *.tar.gz)
      if ! tar -xzf "$downloaded_path" -C "$tmpdir"; then
        rm -rf "$tmpdir"
        echo "failed to extract Supabase CLI archive $downloaded_asset" >&2
        return 1
      fi
      extracted_supabase="$tmpdir/supabase"
      ;;
    *.deb)
      if ! command -v dpkg-deb >/dev/null 2>&1; then
        rm -rf "$tmpdir"
        echo "required command 'dpkg-deb' not found for Supabase CLI bootstrap" >&2
        return 1
      fi
      local deb_extract_dir="$tmpdir/deb"
      mkdir -p "$deb_extract_dir"
      if ! dpkg-deb -x "$downloaded_path" "$deb_extract_dir" >/dev/null; then
        rm -rf "$tmpdir"
        echo "failed to extract Supabase CLI package $downloaded_asset" >&2
        return 1
      fi
      extracted_supabase="$deb_extract_dir/usr/bin/supabase"
      ;;
    *)
      rm -rf "$tmpdir"
      echo "unknown Supabase CLI asset type: $downloaded_asset" >&2
      return 1
      ;;
  esac

  if [[ ! -f "$extracted_supabase" ]]; then
    rm -rf "$tmpdir"
    echo "Supabase CLI archive did not contain 'supabase' binary" >&2
    return 1
  fi

  rm -f "$bin_dir/supabase"
  mv "$extracted_supabase" "$bin_dir/supabase"
  chmod +x "$bin_dir/supabase"
  printf '%s' "$desired_version" >"$version_file"

  PATH="$bin_dir:$PATH"
  export PATH
  rm -rf "$tmpdir"
}

supabase_cli_require() {
  local bin="$1" lane="${2:-${LANE:-default}}"

  if [[ "$bin" == "supabase" ]]; then
    supabase_cli_bootstrap "$lane" || return 1
    hash -r 2>/dev/null || true
  fi

  if command -v "$bin" >/dev/null 2>&1; then
    return 0
  fi

  echo "required command '$bin' not found in PATH" >&2
  return 1
}

supabase_cli_env() {
  local lane="${1:?lane}";
  local repo_envfile="$__supabase_cli_root/ops/supabase/lanes/${lane}.env"
  if [[ ! -f "$repo_envfile" ]]; then
    echo "lane env file $repo_envfile missing; run scripts/supabase/provision_lane_env.sh $lane" >&2
    return 1
  fi
  supabase_cli_require supabase "$lane" || return 1
  supabase_cli_require python3 "$lane" || return 1

  # shellcheck disable=SC1090
  set -a; source "$repo_envfile"; set +a

  local db_url="${SUPABASE_DB_URL:-}" expected_db_url=""
  if command -v python3 >/dev/null 2>&1 && declare -f supabase_build_db_url >/dev/null 2>&1; then
    expected_db_url="$(supabase_build_db_url "${PGUSER:-postgres}" "${PGPASSWORD:-}" "${PGHOST:-127.0.0.1}" "${PGPORT:-${PGHOST_PORT:-5432}}" "${PGDATABASE:-postgres}" "sslmode=disable")"
  fi
  if [[ -n "$expected_db_url" ]]; then
    db_url="$expected_db_url"
  elif [[ -z "$db_url" ]]; then
    db_url=$(python3 - <<'PY' "${PGUSER:-postgres}" "${PGPASSWORD:-}" "${PGHOST:-127.0.0.1}" "${PGPORT:-${PGHOST_PORT:-5432}}" "${PGDATABASE:-postgres}" "sslmode=disable"
import sys
from urllib.parse import quote

def encode(value: str) -> str:
    return quote(value, safe="")

user = encode(sys.argv[1]) if sys.argv[1] else ""
password = sys.argv[2]
host = sys.argv[3]
port = sys.argv[4]
database = encode(sys.argv[5]) if sys.argv[5] else ""
query = sys.argv[6] if len(sys.argv) > 6 else ""

auth = ""
if user:
    if password:
        auth = f"{user}:{encode(password)}@"
    else:
        auth = f"{user}@"
elif password:
    auth = f":{encode(password)}@"

endpoint = host
if port:
    endpoint = f"{host}:{port}"

if query:
    if not query.startswith("?"):
        query = f"?{query}"

print(f"postgresql://{auth}{endpoint}/{database}{query}")
PY
)
  fi
  export SUPABASE_DB_URL="$db_url"

  local lane_config="$__supabase_cli_root/supabase/config.${lane}.toml"
  if [[ ! -f "$lane_config" ]]; then
    echo "Supabase CLI config missing for lane '$lane' at $lane_config" >&2
    return 1
  fi

  export SUPABASE_CONFIG_PATH="$lane_config"
  export SUPABASE_INTERNAL_CONFIG="$lane_config"
  export SUPABASE_LANE_CONFIG="$lane_config"
  if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
    export SUPABASE_PROJECT_REF="${LANE:-$lane}"
  fi

  local state_dir
  state_dir="$(supabase_cli_state_dir "$lane")"
  mkdir -p "$state_dir"
  export SUPABASE_STATE_DIR="$state_dir"

  if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
    export SUPABASE_ACCESS_TOKEN
  elif [[ -n "${SUPABASE_SERVICE_KEY:-}" ]]; then
    export SUPABASE_ACCESS_TOKEN="${SUPABASE_SERVICE_KEY}"
  fi
}

supabase_cli_exec() {
  local lane="${1:?lane}"; shift
  supabase_cli_env "$lane"
  exec supabase "$@"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  lane="${1:?lane}"; shift || true
  if [[ $# -eq 0 ]]; then
    echo "usage: cli.sh <lane> <supabase-args...>" >&2
    exit 2
  fi
  supabase_cli_exec "$lane" "$@"
fi
