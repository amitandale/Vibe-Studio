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

## Generate lane environment files

Lane configuration files live under `ops/supabase/lanes/<lane>.env` and are **not** committed to git. Each file stores the lane-specific ports, credentials, and JWT secrets. Use the provisioning script to create them:

```bash
scripts/supabase/provision_lane_env.sh main --pg-password '<postgres-password>'
scripts/supabase/provision_lane_env.sh work --pg-password '<postgres-password>'
scripts/supabase/provision_lane_env.sh codex --pg-password '<postgres-password>'
```

- Pass the Postgres password that should be used for the `postgres` role inside the lane.
- The script generates fresh `JWT_SECRET`, `ANON_KEY`, and `SERVICE_ROLE_KEY` values using Python's `secrets` module.
- Override the edge runtime environment file path with `--edge-env-file` if your runner uses a different location.
- Supply `--pg-super-role` / `--pg-super-password` when the fallback maintenance account differs from the default `supabase_admin` so automation can recreate the primary role if it goes missing.
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
