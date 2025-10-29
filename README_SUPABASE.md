# Supabase Infrastructure Quick Reference

Vibe Studio runs three isolated Supabase lanes that mirror the `main`, `work`, and `codex/*` branch classes. Lane passwords are
driven entirely by the checked-in `ops/supabase/lanes/credentials.env` file so redeploys keep the same credentials even on fresh
workflow runs.

```
┌─────────┐    ┌─────────────────────────┐
│ Branch  │ -> │ Supabase Lane           │
├─────────┤    ├────────┬────────┬───────┤
│ main    │ -> │ main   │ PG5433 │ Edge │
│ work    │ -> │ work   │ PG5434 │ Edge │
│ codex/* │ -> │ codex  │ PG5435 │ Edge │
└─────────┘    └────────┴────────┴───────┘
```

## 🔑 First Steps

1. SSH to the deployment runner.
2. Change into the deploy checkout (see workflow output for `deploy_dir`).
3. Review `ops/supabase/lanes/credentials.env` and adjust the lane Postgres and `supabase_admin` passwords if needed. These
   values are committed for the dev VPS so CI/CD can reuse them automatically.
4. Generate the lane env files (they will pick up the credentials from `credentials.env`).
   Copy `ops/supabase/lanes/lane.env.example` to `ops/supabase/lanes/<lane>.env` for each lane first, then replace the placeholder
   values with the real configuration before running the provisioning helper:

```bash
# Fetch Supabase's latest compose + env templates once per runner
mkdir -p ops/supabase/lanes
curl -sSfL https://raw.githubusercontent.com/supabase/supabase/master/docker/docker-compose.yml \
  -o ops/supabase/lanes/latest-docker-compose.yml
curl -sSfL https://raw.githubusercontent.com/supabase/supabase/master/docker/.env.example \
  -o ops/supabase/lanes/latest-docker.env

./scripts/supabase/provision_lane_env.sh main --pg-super-role supabase_admin --pg-super-password '<supabase-admin-password>'
./scripts/supabase/provision_lane_env.sh work --pg-super-role supabase_admin --pg-super-password '<supabase-admin-password>'
./scripts/supabase/provision_lane_env.sh codex --pg-super-role supabase_admin --pg-super-password '<supabase-admin-password>'
```

The script writes a lane-specific env file to `ops/supabase/lanes/<lane>.env` with mode `600` while keeping passwords in `ops/supabase/lanes/credentials.env`. It now hydrates the Supabase env with sane defaults for every service exposed by the official compose file—including Kong, GoTrue, the pooler, and the Docker socket mount—so `docker compose` never falls back to blank values. Replace the placeholder JWT keys with production grade values before exposing the APIs. Deploy workflows reuse the generated env file directly; if `docker compose` prints any unset-variable warnings or invalid volume specs, `scripts/supabase/lane.sh` now aborts the deploy so you can fix the lane env instead of discovering the issue after the fact. Deploy workflows read the credentials straight from `credentials.env` on every run, so updating that file is enough to rotate passwords.

After editing a lane env file, run the validation helper to ensure all required variables—including Kong and Postgres port
assignments—are present and non-empty:

```bash
./scripts/supabase/validate_lane_env.sh <lane>
```

The deploy workflow invokes the same validation before running `docker compose`, and it refuses to proceed unless the downloaded
Supabase compose assets are present. Catching failures locally helps keep CI green.

If your restored database volumes use a different maintenance superuser than the default `supabase_admin`, pass `--pg-super-role` and `--pg-super-password` (or edit `credentials.env`) so the deploy workflow can log in with that account and recreate the `PGUSER` role when it goes missing. The helper never rotates the Supabase admin password automatically, so keep the stored value in sync with the database when you reset it manually.

## 📘 Read Next

- [Full Supabase Setup](./docs/SUPABASE_SETUP.md)
- [Runner Preparation Checklist](./docs/RUNNER_SETUP.md)

Keep the generated env files on the runner only—they remain ignored by git.
