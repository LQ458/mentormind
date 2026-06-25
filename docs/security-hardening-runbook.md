# Production Security & Reliability Hardening Runbook

Date: 2026-06-25
Scope: coordinated production (`mentormind.cloud`, single CentOS 7 VPS) steps that
CANNOT be applied by a code edit alone — they require touching the live DB password
baked into the Postgres volume, the Redis broker URL, or the host. Run deliberately.

## Code/infra hardening landed in this branch (no manual step)
- `backend/celery_app.py`: `generate_unit_content_task` now retries a *total* content
  failure (every block failed — usually a transient LLM/network/circuit-breaker blip)
  up to `max_retries` before persisting `failed`; the DB stays `generating` across
  retries and no stale error blob is published to Redis mid-retry.
- `backend/server.py`: new-account registration requires an 8-char password; login
  keeps the shared `_validate_invite_password()` (>=4) check so existing testers are
  not locked out.
- `docker-compose.prod.yml`: json-file log rotation (20m x 5) on every container;
  healthchecks on the 3 Celery workers (node-targeted `celery inspect ping -d
  celery@$HOSTNAME`, validated against prod) and the frontend (`node -e fetch`).

Already present in production from earlier work (verified, NOT re-done here):
exit-survey durability/retry, `_sign_jwt` empty-secret guard (via
`auth._get_jwt_secret`), and study-plan unit-generation timeout UX with clear
toasts + `clearActiveGen()`.

---

## 1. Rotate the Postgres password (currently the default `mentormind`)

⚠️ The password is fixed in the `postgres_data` volume at first init. Changing only the
`POSTGRES_PASSWORD` env will make the backend fail to connect. Rotate inside the DB and
update env together.

```bash
# On the VPS, prod dir /root/mentormind-clean_20260306115658:
NEWPW="$(openssl rand -base64 24)"
docker exec -i mentormind-postgres psql -U mentormind -d mentormind_metadata \
  -c "ALTER USER mentormind WITH PASSWORD '$NEWPW';"
# Put POSTGRES_PASSWORD=$NEWPW in the prod .env, then recreate app containers (not postgres):
./scripts/deploy-prod.sh deploy
```
Verify: `docker exec mentormind-backend python -c "import psycopg2,os; psycopg2.connect(os.environ['DATABASE_URL']); print('db-ok')"`
Rollback: `ALTER USER mentormind WITH PASSWORD 'mentormind';` + restore old `.env`.
Then the `:-mentormind` default in `docker-compose*.yml` can be removed to fail closed.

## 2. Enable Redis auth (`requirepass`)

⚠️ Change the Redis command AND every broker/result URL in the same deploy.
```yaml
# prod .env: REDIS_PASSWORD=<openssl rand -base64 24>
# redis service: command: sh -c 'redis-server --appendonly yes --requirepass "$REDIS_PASSWORD"'
# x-backend-env: CELERY_BROKER_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
```
Verify: `docker exec mentormind-redis redis-cli -a "$REDIS_PASSWORD" ping` → PONG and workers reconnect.

## 3. Reclaim disk (~45 GB reclaimable Docker layers)
Root disk is at 45% (healthy) but reclaimable layers are large.
```bash
docker image prune -f && docker builder prune -f
```

## 4. SSH: rotate root password, move to key-only
```bash
passwd root
# /etc/ssh/sshd_config: PermitRootLogin prohibit-password ; PasswordAuthentication no
systemctl reload sshd   # test a NEW key session BEFORE closing the current one
```

## 5. (Mid-term) Authenticate `/media`
`GET /media/{file_path}` serves files with only a path-traversal guard, no auth
(verified live: bogus path → 404, not 401). A naive `Depends(get_current_user)` breaks
all `<img>/<audio>/<video>` + the nginx media cache (no Authorization header). Use a
same-origin HttpOnly-cookie check or short-lived signed media URLs (HMAC of path+exp),
gated behind a QA pass confirming board audio, lesson images, and avatars still load.

## 6. (Mid-term) Off-site database backup
Nightly `pg_dump` (cron 03:23, 30-day retention) writes only to the same VPS. Push to
S3/object storage (`S3_*` already plumbed) or another host via rclone; test a restore.

## 7. (Mid-term) Unit-generation root cause
This branch's retry catches transient total failures. The deeper fix is in
`backend/core/content/unit_generator.py` (the 5 content types are generated with
`asyncio.gather`; all-fail = upstream LLM unavailable/rate-limited). Consider per-type
backoff, a smaller default content set, or generating Study Guide + Quiz first.
