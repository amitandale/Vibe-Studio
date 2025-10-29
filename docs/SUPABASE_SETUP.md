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

| Lane  | PGHOST_PORT | KONG_HTTP_PORT | EDGE_PORT |
|-------|:-----------:|:--------------:|:---------:|
| main  |     5433    |      8101      |    9901   |
| work  |     5434    |      8102      |    9902   |
| codex |     5435    |      8103      |    9903   |

Each container continues to listen on port `5432`; the new `PGHOST_PORT` variable controls the host-side binding that Docker
publishes for lane-specific connectivity.

Volumes follow the pattern `supa-<lane>-db` and Compose project names default to `supa-<lane>`.

## 🔐 Credential Source of Truth

`ops/supabase/lanes/credentials.env` is the only canonical location for lane passwords. Every helper script reads the
Postgres and superuser credentials directly from that file (or explicit CLI overrides) and injects them into temporary
environment files at runtime. Nothing is written to `~/.config` or any other long-lived state directory, so rotating a
password is as simple as editing `credentials.env` and rerunning the provisioning helper.

The generated `ops/supabase/lanes/<lane>.env` files contain non-secret lane settings (ports, JWT keys, etc.). Secrets are
overlaid dynamically from `credentials.env` whenever Compose or health checks run, ensuring there is a single source of
truth for authentication data.

## 🚀 Initial Setup Steps

1. **Clone the repository onto the runner** (or reuse the deployment checkout).
2. **Download the official Supabase docker directory** so helpers can hydrate defaults straight from upstream and Compose can access every referenced asset:
   ```bash
   mkdir -p ops/supabase/lanes
   tmpdir=$(mktemp -d)
   git clone --filter=blob:none --sparse https://github.com/supabase/supabase.git "$tmpdir/supabase"
   git -C "$tmpdir/supabase" sparse-checkout set docker
   rm -rf ops/supabase/lanes/latest-docker
   cp -a "$tmpdir/supabase/docker" ops/supabase/lanes/latest-docker
   cp ops/supabase/lanes/latest-docker/docker-compose.yml ops/supabase/lanes/latest-docker-compose.yml
   cp ops/supabase/lanes/latest-docker/.env.example ops/supabase/lanes/latest-docker.env
   rm -rf "$tmpdir"
   ```
   The automation refuses to run if the directory or either file is missing, keeping the single source of truth anchored to the Supabase repository.
   During deploys the workflow automatically refreshes the referenced images with `docker compose --project-directory ops/supabase/lanes/latest-docker --env-file ops/supabase/lanes/<lane>.env -f ops/supabase/lanes/latest-docker-compose.yml pull` before services start, so keeping this directory up to date is enough to track upstream releases.
3. **Provision lane environment files** (CI will also auto-provision on first run once the credentials are present):
   - Review or edit `ops/supabase/lanes/credentials.env`. Each lane entry defines the Postgres password plus the fallback Supabase admin role/password that the workflow will reuse. These values are required—if a password is missing the helper exits with an error instead of inventing one.
   - Generate the per-lane env files (non-secret settings) straight from those committed credentials:
     ```bash
     ./scripts/supabase/provision_lane_env.sh main --pg-super-role supabase_admin
     ./scripts/supabase/provision_lane_env.sh work --pg-super-role supabase_admin
     ./scripts/supabase/provision_lane_env.sh codex --pg-super-role supabase_admin
     ```
     Supabase service versions track the upstream compose file you downloaded. To pin a particular release, fetch the compose and `.env` from the desired Supabase tag before running the helper.
   - To rotate passwords, edit `credentials.env` (or pass explicit `--pg-password/--pg-super-password` flags) and rerun the helper. The next deploy automatically injects the updated credentials into the database and Compose runtime.
   - Restored clusters that keep a legacy superuser should update `credentials.env` (or pass overrides) with that account so the deploy workflow can recreate the primary `PGUSER` when it is missing:
     ```bash
     ./scripts/supabase/provision_lane_env.sh codex \
       --pg-super-role supabase_admin \
       --pg-super-password '<existing-supabase-admin-password>'
     ```

### Restore existing superusers

When you reuse a Supabase volume that was initialized elsewhere, populate the fallback credentials with the existing
superuser so the deploy workflow can recreate the lane-specific role (usually `postgres`) and reset its password automatically.
The helper never alters `supabase_admin` once the role exists; it only connects with that account long enough to recreate the lane role when the `PGUSER` account cannot authenticate:

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

- Never commit the generated `ops/supabase/lanes/*.env` files (they are gitignored) and keep the repository checkout secured with `700/600` permissions on any file that stores secrets.
- Generated secrets are placeholders—replace them with signed keys managed by your secret rotation tooling.
- Keep file permissions strict (`600`) and restrict runner access.
- Rotate `PGPASSWORD`, `JWT_SECRET`, `ANON_KEY`, and `SERVICE_ROLE_KEY` regularly.
- Store canonical secrets in your runner’s secret store (e.g., Ansible vault, 1Password CLI) and re-run the provisioning script with `--pg-password` when rotating. `ops/supabase/lanes/credentials.env` is the sole source of truth for database credentials—keep it encrypted at rest and update it before redeploying.
- Keep the Supabase admin password distinct from every lane password; the automation will not reset it for you.

## 🛠️ Troubleshooting

- **Missing env file**: Run `./scripts/supabase/provision_lane_env.sh <lane>` on the runner. This regenerates `ops/supabase/lanes/<lane>.env` from the checked-in credentials.
- **Weak password warning**: Update the password in `ops/supabase/lanes/credentials.env`, rerun the provisioning script, and redeploy.
- **Compose failures**: Confirm Docker can pull the images referenced in `ops/supabase/lanes/latest-docker/docker-compose.yml`. If an upstream tag disappears, fetch a tagged release of the Supabase repository and rerun the provisioning helper so configuration files stay in sync.
- **`role "postgres" does not exist` during deploy**: Supply the superuser credentials with `--pg-super-role/--pg-super-password` (or update `credentials.env`) and rerun the provisioning script so the workflow can recreate the missing lane role automatically. The helper never modifies the Supabase admin password, so the stored secret must match the database before re-running the deploy.
- **Kong not healthy**: Review logs via `docker compose --project-directory ops/supabase/lanes/latest-docker -f ops/supabase/lanes/latest-docker/docker-compose.yml logs kong` with the lane env sourced.
- **Migrations stuck**: Check for lingering advisory locks with `SELECT pg_advisory_unlock_all();` in `psql`.

## 📚 References

- [Supabase Self-Hosting Documentation](https://supabase.com/docs/guides/self-hosting)
- [Supabase CLI Reference](https://supabase.com/docs/guides/cli)
- [Project Runner Setup](./RUNNER_SETUP.md)
