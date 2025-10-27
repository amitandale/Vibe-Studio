# Supabase Infrastructure Quick Reference

Vibe Studio runs three isolated Supabase lanes that mirror the `main`, `work`, and `codex/*` branch classes.

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
3. Generate the lane env files with strong secrets (auto password generation by default):

```bash
./scripts/supabase/provision_lane_env.sh main
./scripts/supabase/provision_lane_env.sh work
./scripts/supabase/provision_lane_env.sh codex
```

The script stores canonical credentials inside the Supabase state directory (default `~/.config/vibe-studio/supabase` or `$SUPABASE_STATE_DIR`) and writes a working copy to `ops/supabase/lanes/<lane>.env` with mode `600`. Replace the placeholder JWT keys with production grade values before exposing the APIs. Supabase service versions are pinned directly in `ops/supabase/docker-compose.yml`; update that file when you intentionally move to a newer upstream release.

If your restored database volumes use a different maintenance superuser than the default `supabase_admin`, pass `--pg-super-role` and `--pg-super-password` (or edit `$SUPABASE_STATE_DIR/superusers.env`) so the deploy workflow can log in with that account and recreate the `PGUSER` role automatically when it goes missing.

## 📘 Read Next

- [Full Supabase Setup](./docs/SUPABASE_SETUP.md)
- [Runner Preparation Checklist](./docs/RUNNER_SETUP.md)

Keep the generated env files on the runner only—they remain ignored by git.
