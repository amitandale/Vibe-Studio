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

## 🗄️ State Directory

Lane credentials persist outside of the git checkout so redeploys keep using the same secrets. By default the provisioning
scripts store canonical env files and superuser credentials under `~/.config/vibe-studio/supabase`, but you can override the
location with the `SUPABASE_STATE_DIR` environment variable. The deploy workflow sets this to `<deploy_dir>/../.supabase-state`
so a shared state directory is reused across runs on the self-hosted runner.

The helper scripts still write a working copy to `ops/supabase/lanes/<lane>.env` for convenience, but the files inside the state
directory remain the source of truth.

## 🚀 Initial Setup Steps

1. **Clone the repository onto the runner** (or reuse the deployment checkout).
2. **Provision lane environment files** (CI will also auto-provision on first run):
   - Auto-generate strong passwords and secrets (default behaviour):
     ```bash
     ./scripts/supabase/provision_lane_env.sh main
     ./scripts/supabase/provision_lane_env.sh work
     ./scripts/supabase/provision_lane_env.sh codex
     ```
    The script maintains `superusers.env` and `<lane>.env` inside the state directory (default `~/.config/vibe-studio/supabase`).
    It also copies fresh values to `ops/supabase/lanes/<lane>.env` so other tooling can read them from the checkout. Supabase
    service versions are pinned directly inside `ops/supabase/docker-compose.yml`; update that file when you intentionally move to
    a newer release.
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
    the deploy workflow can recreate the primary `PGUSER` when it is missing. You can supply them directly or edit the state file
    (`$SUPABASE_STATE_DIR/superusers.env`) before rerunning the helper:
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
credentials, rerun the deploy workflow. The lane helper shells into the database container and recreates or resets the
stored roles using those credentials before migrations run, so the lane is healed automatically on the next deploy.

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

- Never commit the generated `ops/supabase/lanes/*.env` files (they are gitignored) and keep the state directory (`$SUPABASE_STATE_DIR`) secured with `700/600` permissions.
- Generated secrets are placeholders—replace them with signed keys managed by your secret rotation tooling.
- Keep file permissions strict (`600`) and restrict runner access.
- Rotate `PGPASSWORD`, `JWT_SECRET`, `ANON_KEY`, and `SERVICE_ROLE_KEY` regularly.
- Store canonical secrets in your runner’s secret store (e.g., Ansible vault, 1Password CLI) and re-run the provisioning script with `--pg-password` when rotating. Back up `$SUPABASE_STATE_DIR/superusers.env` securely; it is the source of truth for the fallback superuser credentials used to repair recycled volumes.

## 🛠️ Troubleshooting

- **Missing env file**: Run `./scripts/supabase/provision_lane_env.sh <lane>` on the runner. This will repopulate the state directory and refresh the working copy inside `ops/supabase/lanes/`.
- **Weak password warning**: Re-run the provisioning script with a stronger password or edit the env file directly.
- **Compose failures**: Confirm Docker can pull the images referenced in `ops/supabase/docker-compose.yml`. If an upstream tag disappears, update the compose file to a supported release and rerun the provisioning helper so passwords remain intact.
- **`role "postgres" does not exist` during deploy**: Supply the superuser credentials with `--pg-super-role/--pg-super-password` and rerun the provisioning script so the workflow can recreate the missing role automatically and reset its password.
- **Kong not healthy**: Review logs via `docker compose -f ops/supabase/docker-compose.yml logs kong` with the lane env sourced.
- **Migrations stuck**: Check for lingering advisory locks with `SELECT pg_advisory_unlock_all();` in `psql`.

## 📚 References

- [Supabase Self-Hosting Documentation](https://supabase.com/docs/guides/self-hosting)
- [Supabase CLI Reference](https://supabase.com/docs/guides/cli)
- [Project Runner Setup](./RUNNER_SETUP.md)
