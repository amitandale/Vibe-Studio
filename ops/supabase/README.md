# Supabase Lane Operations

This directory contains the self-hosted Supabase stacks that back each persistent deployment lane. The scripts in `scripts/supabase/` assume the host already has the required runtime dependencies and lane environment files. This document explains how to provision them.

## Prerequisites

Install the following utilities on the runner that operates the lanes:

- Docker and Docker Compose Plugin (`docker compose`)
- `psql` client utilities (PostgreSQL)
- `python3`
- `curl`
- `jq`

The GitHub Actions workflow invokes these scripts, so each dependency must be available in the automation environment as well.

Fetch the entire `docker/` directory from Supabase so Compose has access to every referenced file (migrations, config mounts, etc.) using the sync helper:

```bash
scripts/supabase/sync_docker_assets.sh
```

The pinned tag or commit lives in `ops/supabase/SUPABASE_DOCKER_REF`. Update that file and rerun the sync helper whenever you need to upgrade Supabase; commit the resulting changes (including the refreshed `latest-docker` directory) so CI and local workflows stay aligned. Make sure the ref corresponds to an actual tag or commit in the Supabase repository (for example `1.25.04`); the sync helper will exit early if the value is invalid.

The tooling refuses to run if the directory (or the compose/env templates within it) is missing to avoid drifting from Supabase's published configuration.

## Generate lane environment files

Lane configuration files live in `ops/supabase/lanes/<lane>.env`, while passwords and superuser credentials are sourced exclusively from `ops/supabase/lanes/credentials.env`. Review that credentials file to confirm the Postgres and `supabase_admin` passwords for each lane, then use the provisioning script to create the env files:

```bash
scripts/supabase/provision_lane_env.sh main --pg-super-role supabase_admin
scripts/supabase/provision_lane_env.sh work --pg-super-role supabase_admin
scripts/supabase/provision_lane_env.sh codex --pg-super-role supabase_admin
```

- The provisioning helper reads lane credentials from `credentials.env` by default. Edit that file or pass explicit flags when you need different values on a new runner.
- The script generates fresh `JWT_SECRET`, `ANON_KEY`, and `SERVICE_ROLE_KEY` values using Python's `secrets` module.
- Override the edge runtime environment file path with `--edge-env-file` if your runner uses a different location.
- Supply `--pg-super-password` when the fallback maintenance account differs from the default `supabase_admin` or when you rotate the admin credential. You can also edit `credentials.env` directly before rerunning the script.
- Use `--force` to replace an existing file (for example, when rotating credentials).

The script marks each generated file with `chmod 600` to keep secrets protected on disk.

## First-time lane bootstrap

After generating the `.env` files, start each lane once to create the persistent volumes and confirm connectivity:

```bash
scripts/supabase/lane.sh main start
scripts/supabase/lane.sh work start
scripts/supabase/lane.sh codex start
```

Follow each command with `scripts/supabase/lane.sh <lane> health` to verify the Postgres and Kong endpoints respond. When the services are not needed, stop them with `scripts/supabase/lane.sh <lane> stop`.

Migrations can be applied manually with:

```bash
scripts/supabase/migrate.sh <lane>
```

Once the lanes are provisioned, the GitHub Actions deployment workflow will manage stopping services, running migrations, health checks, and restarting the Supabase stack during deploys.
