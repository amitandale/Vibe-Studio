# Supabase Infrastructure Quick Reference

Vibe Studio runs three isolated Supabase lanes that mirror the `main`, `work`, and `codex/*` branch classes. Lane state lives
outside the git checkout inside the Supabase state directory so redeploys keep the same credentials even on fresh workflow
runs.

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
4. Generate the lane env files (they will pick up the credentials from `credentials.env`):

```bash
./scripts/supabase/provision_lane_env.sh main --pg-super-role supabase_admin --pg-super-password '<supabase-admin-password>'
./scripts/supabase/provision_lane_env.sh work --pg-super-role supabase_admin --pg-super-password '<supabase-admin-password>'
./scripts/supabase/provision_lane_env.sh codex --pg-super-role supabase_admin --pg-super-password '<supabase-admin-password>'
```

The script stores canonical credentials inside the Supabase state directory (default `~/.config/vibe-studio/supabase` or `$SUPABASE_STATE_DIR`) and writes a working copy to `ops/supabase/lanes/<lane>.env` with mode `600`. Replace the placeholder JWT keys with production grade values before exposing the APIs. Supabase service versions are pinned directly in `ops/supabase/docker-compose.yml`; update that file when you intentionally move to a newer upstream release. The workflow always reads from the state directory first, so once a lane is provisioned the stored passwords remain authoritative across deploys and continue to mirror `credentials.env`.

If your restored database volumes use a different maintenance superuser than the default `supabase_admin`, pass `--pg-super-role` and `--pg-super-password` (or edit `$SUPABASE_STATE_DIR/superusers.env`) so the deploy workflow can log in with that account and recreate the `PGUSER` role when it goes missing. The helper never rotates the Supabase admin password automatically, so keep the stored value in sync with the database when you reset it manually.

## 📘 Read Next

- [Full Supabase Setup](./docs/SUPABASE_SETUP.md)
- [Runner Preparation Checklist](./docs/RUNNER_SETUP.md)

Keep the generated env files on the runner only—they remain ignored by git.
