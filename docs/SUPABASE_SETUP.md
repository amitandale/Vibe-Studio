# Supabase Lane Setup Guide

This document walks you through provisioning and maintaining the self-hosted Supabase stacks that power the `main`, `work`, and `codex` lanes.

## ✅ Prerequisites

Install these utilities on the runner before provisioning Supabase services:

- Docker Engine 24+
- Docker Compose (plugin)
- PostgreSQL client tools (`psql`, `pg_isready`)
- `jq`
- `python3`
- `curl`
- `openssl`

Verify availability:

```bash
which docker docker compose psql jq python3 curl openssl
```

## 🏗️ Architecture Overview

Each Git branch class maps to its own long-lived Supabase lane. Every lane runs its own Compose project containing PostgreSQL, GoTrue auth, PostgREST, Realtime, Storage API, Imgproxy, Edge runtime, and Kong. Volumes, ports, and API keys are isolated so deployments do not interfere with each other.

## 🔢 Port Allocation

| Lane  | PGPORT | KONG_HTTP_PORT | EDGE_PORT |
|-------|:------:|:--------------:|:---------:|
| main  |  5433  |      8101      |    9901   |
| work  |  5434  |      8102      |    9902   |
| codex |  5435  |      8103      |    9903   |

Volumes follow the pattern `supa-<lane>-db` and Compose project names default to `supa-<lane>`.

## 🚀 Initial Setup Steps

1. **Clone the repository onto the runner** (or reuse the deployment checkout).
2. **Refresh image pins (optional but recommended before first boot)**:
   ```bash
   ./scripts/supabase/refresh_image_pins.sh
   ```
   This resolves each Supabase tag to the latest registry digest so your local checkout matches what CI will deploy. If Supabase removes an advertised tag (e.g. the upstream compose file references a build that never shipped), the helper automatically falls forward to the newest tag with the same prefix from Docker Hub and records the change in the lock file. When Docker Hub cannot return a compatible tag (network restrictions, delayed releases, etc.), the script falls back to a curated, known-good baseline (currently Postgres `15.8.1.135`) so pipelines remain deployable.
3. **Provision lane environment files** (CI will also auto-provision on first run):
   - Auto-generate strong passwords and secrets (default behaviour):
     ```bash
     ./scripts/supabase/provision_lane_env.sh main
     ./scripts/supabase/provision_lane_env.sh work
     ./scripts/supabase/provision_lane_env.sh codex
     ```
    The script keeps digest-pinned image references in sync with `ops/supabase/images.lock.json` so new containers launch with
    the expected versions. It also maintains `ops/supabase/lanes/superusers.env`, a runner-local credentials file that stores each lane's fallback superuser role and password with `600` permissions for reuse.
   - Add `--random-pg-password` to request random password generation explicitly (the deploy workflow does this automatically).
   - Interactive password entry:
     ```bash
     ./scripts/supabase/provision_lane_env.sh main --interactive
     ```
   - Non-interactive custom password:
     ```bash
     ./scripts/supabase/provision_lane_env.sh main --pg-password "<strong-password>"
     ```
   - Restored clusters that keep a legacy superuser (for example, `supabase_admin`) should also provide fallback credentials so
     the deploy workflow can recreate the primary `PGUSER` when it is missing. You can supply them directly or edit `ops/supabase/lanes/superusers.env` before rerunning the helper:
     ```bash
     ./scripts/supabase/provision_lane_env.sh codex \
       --pg-super-role supabase_admin \
       --pg-super-password "<supabase-admin-password>"
     ```

### Restore existing superusers

When you reuse a Supabase volume that was initialized elsewhere, populate the fallback credentials with the existing
superuser so the deploy workflow can recreate the lane-specific role (usually `postgres`) and reset its password automatically:

```bash
./scripts/supabase/provision_lane_env.sh <lane> \
  --pg-super-role <existing_superuser> \
  --pg-super-password '<existing_superuser_password>'
```

If you do not know the values, connect directly on the host and inspect available roles (for example, with
`docker exec -it supa-<lane>-db-1 psql -U <known_superuser> -d postgres -c "\\du"`). Once the env file contains valid
credentials, rerun the deploy workflow and it will reconcile the lane role automatically.

4. **Replace temporary JWT keys** (recommended for production):
   - Generate with Supabase CLI: `supabase secrets set --from-env lane.env`
   - Or use the Supabase dashboard tools to mint signed keys.
   - Update the generated `.env` file values.
5. **Start services for each lane**:
   ```bash
   ./scripts/supabase/lane.sh main start
   ./scripts/supabase/lane.sh work start
   ./scripts/supabase/lane.sh codex start
   ```
6. **Verify health**:
   ```bash
   ./scripts/supabase/lane.sh main health
   ./ops/bin/healthwait.sh http://127.0.0.1:8101 60
   curl -fsS http://127.0.0.1:9901/
   ```
7. **Run migrations manually (optional)** to confirm connectivity:
   ```bash
   ./scripts/supabase/migrate.sh main
   ```

## 🔐 Security Best Practices

- Never commit the generated `ops/supabase/lanes/*.env` files (they are gitignored).
- Generated secrets are placeholders—replace them with signed keys managed by your secret rotation tooling.
- Keep file permissions strict (`600`) and restrict runner access.
- Rotate `PGPASSWORD`, `JWT_SECRET`, `ANON_KEY`, and `SERVICE_ROLE_KEY` regularly.
- Store canonical secrets in your runner’s secret store (e.g., Ansible vault, 1Password CLI) and re-run the provisioning script with `--pg-password` when rotating. Back up `ops/supabase/lanes/superusers.env` securely; it is the source of truth for the fallback superuser credentials used to repair recycled volumes.

## 🛠️ Troubleshooting

- **Missing env file**: Run `./scripts/supabase/provision_lane_env.sh <lane>` on the runner.
- **Weak password warning**: Re-run the provisioning script with a stronger password or edit the env file directly.
- **Compose failures**: Ensure Docker can pull the digest-pinned images listed in `ops/supabase/images.lock.json`.
- **Missing or stale image pins**: Run `./scripts/supabase/refresh_image_pins.sh` to sync the lock file, then reprovision the lane env. The script will attempt to select the latest compatible Docker Hub tag when the exact version is unavailable.
- **`role "postgres" does not exist` during deploy**: Supply the superuser credentials with `--pg-super-role/--pg-super-password` and rerun the provisioning script so the workflow can recreate the missing role automatically and reset its password.
- **Kong not healthy**: Review logs via `docker compose -f ops/supabase/docker-compose.yml logs kong` with the lane env sourced.
- **Migrations stuck**: Check for lingering advisory locks with `SELECT pg_advisory_unlock_all();` in `psql`.

## 📚 References

- [Supabase Self-Hosting Documentation](https://supabase.com/docs/guides/self-hosting)
- [Supabase CLI Reference](https://supabase.com/docs/guides/cli)
- [Project Runner Setup](./RUNNER_SETUP.md)
