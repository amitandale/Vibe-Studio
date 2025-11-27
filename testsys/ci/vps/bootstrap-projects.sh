#!/usr/bin/env bash
set -euo pipefail

# Simple bootstrapper for generating docker-compose service definitions for
# Supabase lanes used in CI environments. The previous version of this script
# had a syntax error near line 532 that prevented the compose generation logic
# from running. This version keeps the logic straightforward and guards against
# incomplete files so that each lane receives a populated compose configuration.

log() {
  local level="${1:-info}"; shift || true
  local msg="$*"
  printf '[%s][bootstrap] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "${level}: ${msg}"
}

debug() {
  log "debug" "$*"
}

info() {
  log "info" "$*"
}

error() {
  log "ERR" "$*" >&2
}

# Default configuration
COMPOSE_CMD=${COMPOSE_CMD:-"docker compose"}
ACTION=${ACTION:-"up"}
BASE_DIR=${BASE_DIR:-"/home/devops/supabase-project"}
REGISTRY_FILE=${REGISTRY_FILE:-"${BASE_DIR}/projects.json"}
PORTS_FILE=${PORTS_FILE:-"${BASE_DIR}/ports.json"}
LANES=${LANES:-"ci prod staging"}
ENV_KEYS=${ENV_KEYS:-"api,db,studio"}

# Ensure base directory exists so generated compose files have a home.
mkdir -p "$BASE_DIR"

# Utility to read ports for a lane either from the ports.json registry or a
# deterministic fallback set. The fallback uses the lane index to avoid
# collisions between different lanes.
load_lane_ports() {
  local lane="$1"
  local index="$2"
  local default_db_port=$((5432 + index * 10))
  local default_api_port=$((54321 + index))
  local default_studio_port=$((54323 + index))
  local ports_output

  if [[ -s "$PORTS_FILE" ]] && command -v jq >/dev/null 2>&1; then
    ports_output=$(jq -r --arg lane "$lane" '
      (.[$lane].db // empty) as $db |
      (.[$lane].api // empty) as $api |
      (.[$lane].studio // empty) as $studio |
      [$db, $api, $studio] | @tsv
    ' "$PORTS_FILE" 2>/dev/null || true)
  else
    ports_output="\t\t"
  fi

  local db_port api_port studio_port
  IFS=$'\t' read -r db_port api_port studio_port <<<"${ports_output}"

  db_port=${db_port:-$default_db_port}
  api_port=${api_port:-$default_api_port}
  studio_port=${studio_port:-$default_studio_port}

  printf '%s\t%s\t%s\n' "$db_port" "$api_port" "$studio_port"
}

# Compose content generator. Keeps the YAML minimal but ensures that services
# exist so docker compose commands do not fail on empty configs.
generate_compose_file() {
  local lane="$1"
  local db_port="$2"
  local api_port="$3"
  local studio_port="$4"
  local lane_dir="${BASE_DIR}/${lane}"
  local compose_file="${lane_dir}/docker-compose.yml"

  mkdir -p "$lane_dir"

  cat >"$compose_file" <<EOF_COMPOSE
version: "3.9"
services:
  db:
    image: supabase/postgres:15.1.1.138
    restart: unless-stopped
    ports:
      - "${db_port}:5432"
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
    volumes:
      - db-data-${lane}:/var/lib/postgresql/data

  api:
    image: supabase/postgrest:v12.1.0
    depends_on:
      - db
    restart: unless-stopped
    ports:
      - "${api_port}:3000"
    environment:
      PGRST_DB_URI: postgres://postgres:${POSTGRES_PASSWORD:-postgres}@db:5432/postgres
      PGRST_DB_SCHEMAS: "public,storage,graphql_public"
      PGRST_DB_ANON_ROLE: anon

  studio:
    image: supabase/studio:20241219-4f24c35
    depends_on:
      - db
    restart: unless-stopped
    ports:
      - "${studio_port}:3000"
    environment:
      SUPABASE_URL: http://api:3000
      SUPABASE_ANON_KEY: anon-key-placeholder
      SUPABASE_SERVICE_ROLE_KEY: service-role-key-placeholder

volumes:
  db-data-${lane}:
EOF_COMPOSE

  debug "generated compose for ${lane} -> ${compose_file}"
}

# Diagnostic function to mirror the existing logging style.
dump_lane_diag() {
  local lane="$1"
  local compose_file="${BASE_DIR}/${lane}/docker-compose.yml"
  local service_count
  service_count=$(awk '/^\s{2,}[^[:space:]]+:$/ {print $1}' "$compose_file" | wc -l | tr -d ' ')
  debug "[diag] lane=${lane} compose_file='${compose_file}' services=${service_count} env_keys='${ENV_KEYS}'"
}

info "compose='${COMPOSE_CMD}'"
info "ACTION='${ACTION}'"
info "BASE_DIR='${BASE_DIR}'"
info "REGISTRY_FILE='${REGISTRY_FILE}'"

if [[ -s "$PORTS_FILE" ]]; then
  info "PORTS_JSON bytes=$(wc -c <"$PORTS_FILE")"
else
  info "PORTS_JSON missing; using fallback ports"
fi

lane_index=0
for lane in ${LANES}; do
  read -r db_port api_port studio_port < <(load_lane_ports "$lane" "$lane_index")
  generate_compose_file "$lane" "$db_port" "$api_port" "$studio_port"
  dump_lane_diag "$lane"
  lane_index=$((lane_index + 1))
done

info "Bootstrap completed with populated docker-compose.yml files."

