# Self-Hosted Runner Checklist

Use this checklist to prepare a runner capable of provisioning and operating the Supabase lanes.

## 📋 System Dependencies

- [ ] Docker Engine 24+
- [ ] Docker Compose plugin (`docker compose`)
- [ ] PostgreSQL client tools (`psql`, `pg_isready`)
- [ ] `jq`
- [ ] `python3`
- [ ] `curl`
- [ ] `openssl`

Verify installations:

```bash
docker --version
docker compose version
psql --version
jq --version
python3 --version
curl --version
openssl version
```

## 🧱 Supabase Infrastructure

- [ ] Repository checked out to deployment directory
- [ ] Supabase docker assets synced with `./scripts/supabase/sync_docker_assets.sh` (pinned ref recorded in `ops/supabase/SUPABASE_DOCKER_REF`)
- [ ] Lane credentials in `ops/supabase/lanes/credentials.env` reviewed/updated for this runner
- [ ] Lane env files generated via `scripts/supabase/provision_lane_env.sh`
- [ ] Supabase admin password recorded separately from lane `PGPASSWORD`
- [ ] Unique JWT/anon/service keys generated for each lane
- [ ] Supabase services started with `./scripts/supabase/lane.sh <lane> start`
- [ ] Edge runtime env files mounted on the host (see template comments)

## 🔍 Verification Commands

```bash
./scripts/supabase/validate_lane_env.sh main
./scripts/supabase/lane.sh main health
ops/bin/healthwait.sh http://127.0.0.1:8101 60
pg_isready -h 127.0.0.1 -p 5433 -d vibe_main -U postgres
./scripts/supabase/lane.sh main db-health
curl -fsS http://127.0.0.1:9901/
```

Repeat for `work` and `codex` lanes adjusting ports as needed.

## ❗ Common Issues

- **Missing env file** → Run `./scripts/supabase/provision_lane_env.sh <lane>` and re-try validation.
- **Permission denied on env file** → Ensure files are owned by the runner user and have mode `600`.
- **Docker compose fails to start** → Confirm ports 5433/5434/5435 and 8101/8102/8103 are free, then verify the tags in `ops/supabase/lanes/latest-docker/docker-compose.yml` exist in Docker Hub. Refresh the downloaded docker directory (or pin a Supabase release) when Supabase ships a new release and rerun the provisioning script so credentials stay in sync.
- **Edge runtime cannot read env** → Verify `EDGE_ENV_FILE` points to a readable file mounted on the host.
- **Superuser override missing** → Update `ops/supabase/lanes/credentials.env` with the correct admin password and regenerate with `./scripts/supabase/provision_lane_env.sh <lane> --force --pg-super-role supabase_admin`.

See also: [Supabase Lane Setup Guide](./SUPABASE_SETUP.md).
