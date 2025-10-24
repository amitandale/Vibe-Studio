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

The script creates `ops/supabase/lanes/<lane>.env` with mode `600` and placeholder JWT keys. Replace these keys with production grade values before exposing the APIs. Image digests from `ops/supabase/images.lock.json` (including `VECTOR_IMAGE`) are written into each lane env so Docker Compose always resolves the correct Supabase stack images.

## 📘 Read Next

- [Full Supabase Setup](./docs/SUPABASE_SETUP.md)
- [Runner Preparation Checklist](./docs/RUNNER_SETUP.md)

Keep the generated env files on the runner only—they remain ignored by git.
