# Docker Operations Guide

## Services (7 containers)

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| postgres | `mentormind-postgres` | 5432 | PostgreSQL 15, database `mentormind_metadata` |
| redis | `mentormind-redis` | 6379 | Redis 7, Celery broker + result cache |
| backend | `mentormind-backend` | 8000 | FastAPI v2, all HTTP endpoints |
| celery-orchestration | `mentormind-celery-orchestration` | — | Plans, lessons, notifications, unit content |
| celery-rendering | `mentormind-celery-rendering` | — | Manim video rendering, 1 concurrency |
| celery-heavy-ml | `mentormind-celery-heavy-ml` | — | FunASR transcription, PaddleOCR extraction |
| frontend | `mentormind-frontend` | 3000 | Next.js 14, SSR + API proxy |

---

## Process Status

```bash
# List all running containers
docker compose ps

# Show resource usage (CPU, memory per container)
docker stats

# Show all containers including stopped ones
docker compose ps -a
```

---

## Checking Logs

### Watch all logs
```bash
docker compose logs -f
```

### Watch a specific service
```bash
docker compose logs -f backend
docker compose logs -f celery-orchestration
docker compose logs -f celery-rendering
docker compose logs -f celery-heavy-ml
docker compose logs -f postgres
docker compose logs -f redis
docker compose logs -f frontend
```

### Tail last N lines
```bash
docker compose logs --tail=100 celery-orchestration
```

### Timestamps on every line
```bash
docker compose logs -f --timestamps backend
```

### Filter for errors only (via grep)
```bash
docker compose logs backend 2>&1 | grep -i "error\|exception\|traceback"
docker compose logs celery-orchestration 2>&1 | grep -i "error\|failed\|exception"
```

---

## Health Checks

### All containers (built-in Docker health)
```bash
docker compose ps
```
Look at the `STATUS` column. `healthy` means the healthcheck passed. `unhealthy` means it failed its configured test:

| Service | Healthcheck |
|---------|------------|
| postgres | `pg_isready -U mentormind -d mentormind_metadata` every 10s |
| redis | `redis-cli ping` every 10s |
| backend | `curl http://localhost:8000/health` every 15s, 30s startup grace |
| celery-* | No healthcheck defined (check logs instead) |
| frontend | No healthcheck defined (depends on backend healthy) |

### Manual service health
```bash
# Backend status page (probes FunASR, PaddleOCR, DeepSeek, TTS)
curl http://localhost:8000/status

# Simple health check (Docker/load balancer)
curl http://localhost:8000/health

# Detailed health with Celery worker status + system metrics
curl http://localhost:8000/health/detailed

# Performance metrics (requires auth)
curl http://localhost:8000/metrics/performance -H "Authorization: Bearer <token>"

# Admin metrics dashboard (lessons, quality scores, costs)
curl http://localhost:8000/admin/metrics

# Admin telemetry aggregates
curl http://localhost:8000/admin/telemetry/aggregate
```

---

## Job and Task Monitoring

### Check a specific Celery job
```bash
curl http://localhost:8000/job-status/<job_id>
```
Returns: `{ status, job_id, result }` — status is `pending | started | completed | failed`.

### Stream job progress (Server-Sent Events)
```bash
curl -N http://localhost:8000/job-stream/<job_id>
```
Real-time progress updates. Use `-N` to disable curl buffering. The SSE stream emits:
- `:keepalive` comments every 5s
- `data: {"status": "...", "progress": ...}` when state changes
- `data: {"status": "completed", "result": {...}}` when done
- `data: {"status": "failed", "error": "..."}` on failure

### Celery worker inspection (inside backend container)
```bash
# Enter the backend container
docker compose exec backend bash

# List active tasks across all workers
celery -A celery_app inspect active

# List registered tasks
celery -A celery_app inspect registered

# List scheduled tasks (ETA/countdown)
celery -A celery_app inspect scheduled

# Show worker stats
celery -A celery_app inspect stats

# Show which workers are connected to which queues
celery -A celery_app inspect active_queues

# Revoke a running task by ID
celery -A celery_app control revoke <task_id> --terminate
```

### Redis job store (direct inspection)
```bash
# Enter Redis container
docker compose exec redis redis-cli

# List all keys (job results stored as job_result:<id>)
KEYS job_result:*

# Check a specific result
GET job_result:<job_id>

# Check all Celery-related keys
KEYS celery*

# Monitor Redis commands in real time
MONITOR
```

---

## Database

### Connect to PostgreSQL
```bash
docker compose exec postgres psql -U mentormind -d mentormind_metadata
```

### Quick queries
```sql
-- Lesson count
SELECT COUNT(*) FROM lessons;

-- Most recent lessons
SELECT title, language, status, created_at FROM lessons ORDER BY created_at DESC LIMIT 10;

-- User count
SELECT COUNT(*) FROM users;

-- Study plan count
SELECT COUNT(*) FROM study_plans;

-- Knowledge graph nodes per user
SELECT user_id, COUNT(*) as nodes FROM kg_concepts GROUP BY user_id;

-- Telemetry record count and oldest record
SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM telemetry_events;

-- Active Celery beat schedule status (proficiency rollups)
SELECT user_id, subject, proficiency_0_to_1, sample_size, trend FROM subject_proficiency ORDER BY user_id;
```

---

## Restart and Recovery

### Restart a single service
```bash
docker compose restart backend
docker compose restart celery-orchestration
docker compose restart celery-heavy-ml
```

### Full restart
```bash
docker compose down && docker compose up -d
```

### Rebuild and restart (after code changes)
```bash
docker compose up -d --build backend celery-orchestration celery-rendering celery-heavy-ml
```

### Check for zombie/stuck containers
```bash
docker compose ps -a | grep -E "Exit|unhealthy|restart"
```

---

## Quick Diagnostic Script

```bash
#!/bin/bash
echo "=== Container status ==="
docker compose ps

echo ""
echo "=== Backend health ==="
curl -s http://localhost:8000/health 2>/dev/null || echo "Backend unreachable"

echo ""
echo "=== Backend status ==="
curl -s http://localhost:8000/status 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "Status unreachable"

echo ""
echo "=== Frontend ==="
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000 2>/dev/null || echo "Frontend unreachable"

echo ""
echo "=== Celery workers (from Redis) ==="
docker compose exec redis redis-cli KEYS "celery*" 2>/dev/null

echo ""
echo "=== Recent errors (last 20 lines from each Celery worker) ==="
docker compose logs --tail=20 celery-orchestration 2>&1 | grep -iE "error|fail|traceback" || echo "No errors in orchestration"
docker compose logs --tail=20 celery-rendering 2>&1 | grep -iE "error|fail|traceback" || echo "No errors in rendering"
docker compose logs --tail=20 celery-heavy-ml 2>&1 | grep -iE "error|fail|traceback" || echo "No errors in heavy-ml"

echo ""
echo "=== Disk usage ==="
docker system df
```
