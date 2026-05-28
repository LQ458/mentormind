# MentorMind — Deployment Plans

---

## Plan A: Production (Alibaba Cloud Hong Kong, 5000 CCU)

**Goal:** Enterprise-grade, no ICP license required, stable for mainland China users, max 10,000 CNY/mo.

### Architecture Overview

```
[Browser / WeChat] → Cloudflare CDN → Vercel (Next.js frontend)
                                              ↓
                                   Aliyun SAE (FastAPI API)
                                         ↓         ↓
                               Aliyun Tair      Aliyun RDS
                                 (Redis)       (PostgreSQL)
                                    ↓
                          Aliyun SAE (Celery Workers)
                                    ↓
                          Aliyun OSS (Video Storage)
                                    ↓
                         Aliyun DCDN (Video CDN for CN)
```

### Services to Purchase (Aliyun HK Region)

| Service | Aliyun Product | Spec | Est. Cost |
| :--- | :--- | :--- | :--- |
| **Database** | RDS PostgreSQL (HA) | 4 Core / 8 GB | ~1,200 CNY/mo |
| **Queue/Cache** | Tair Redis (Standard) | 4 GB | ~300 CNY/mo |
| **API Gateway** | SAE (FastAPI web app) | 4 Core / 8 GB | ~800 CNY/mo |
| **AI Workers** | SAE (Celery, auto-scale) | On-demand burst | ~2,000 CNY/mo |
| **Video Storage** | Alibaba OSS + DCDN | ~1 TB storage | ~500 CNY/mo |
| **Frontend** | Vercel (Pro) | — | ~150 CNY/mo |
| **Total** | | | **~5,000 CNY/mo** (50% budget) |

### Step-by-Step Deployment

#### Step 1 — Create Aliyun Account
1. Register at [aliyun.com](https://aliyun.com) and complete identity verification.
2. Top up with CNY and ensure your account has the Hong Kong region enabled.

#### Step 2 — Create the Database (RDS PostgreSQL)
1. In Aliyun Console → **RDS** → Create Instance → Region: **Hong Kong** → Engine: **PostgreSQL 15**.
2. Set spec to **4 Core, 8 GB RAM**, High Availability Mode.
3. Create a database named `mentormind_metadata`.
4. Note the connection string: `postgresql://user:pass@<endpoint>:5432/mentormind_metadata`
5. Upload and run [backend/database/init.sql](file:///Users/LeoQin/Documents/GitHub/mentormind/backend/database/init.sql) via the RDS SQL console to create tables.

#### Step 3 — Create the Redis Queue (Tair)
1. Aliyun Console → **Tair (Redis)** → Create Instance → Region: **Hong Kong**.
2. Plan: **Standard**, 4 GB.
3. Note the connection string: `redis://:<password>@<endpoint>:6379/0`

#### Step 4 — Create OSS Bucket for Video Storage
1. Aliyun Console → **OSS** → Create Bucket → Region: **Hong Kong** → Name: `mentormind-media`.
2. Set **Read/Write permissions** to Public Read.
3. Create an AccessKey for your account (RAM > AccessKey).
4. Set endpoint URL. For example: `https://oss-cn-hongkong.aliyuncs.com`
5. (Optional) Enable DCDN for faster access from Mainland China.

#### Step 5 — Deploy Backend to SAE (FastAPI API)
1. Aliyun Console → **Serverless App Engine (SAE)** → Create Application.
2. Set deployment mode to **Image** → Use GitHub Actions to build and push Docker image to **Aliyun ACR (Container Registry)**.  
   Or: Use SAE's built-in code-source deployment pointing to your GitHub repo.
3. Set start command: `uvicorn server:app --host 0.0.0.0 --port 8000`
4. Set environment variables (see Environment Variables section below).
5. Set instance count: min 1, max auto-scale to 50.

#### Step 6 — Deploy Celery Workers to SAE (Background Workers)
1. Create a **second SAE application** using the **same Docker image**.
2. Set start command: `celery -A celery_app worker --loglevel=info --concurrency=4`
3. Configure environment variables (same as API, see below).
4. Set auto-scaling: 0 to 100 instances based on Redis queue depth.

#### Step 7 — Deploy Frontend to Vercel
1. Push your code to GitHub.
2. Connect to [vercel.com](https://vercel.com) → Import project → select [web/](file:///Users/LeoQin/Documents/GitHub/mentormind/backend/core/create_classes.py#253-255) as root.
3. Set environment variable:
   - `BACKEND_URL` = `https://your-sae-api-domain.aliyun.com`
   - `NEXT_PUBLIC_APP_URL` = your Vercel frontend URL

#### Environment Variables for SAE (API + Worker Services)
```bash
DATABASE_URL=postgresql://user:pass@rds-hk-endpoint:5432/mentormind_metadata
CELERY_BROKER_URL=redis://:pass@tair-hk-endpoint:6379/0
S3_ENABLED=true
S3_ENDPOINT_URL=https://oss-cn-hongkong.aliyuncs.com
S3_ACCESS_KEY_ID=<your-aliyun-ak>
S3_SECRET_ACCESS_KEY=<your-aliyun-sk>
S3_BUCKET_NAME=mentormind-media
S3_PUBLIC_URL_PREFIX=https://mentormind-media.oss-cn-hongkong.aliyuncs.com
DEEPSEEK_API_KEY=...
SILICONFLOW_API_KEY=...
OPENAI_API_KEY=...
```

#### Verify Deployment
- Open your Vercel URL → Create a lesson → Confirm the API returns a `job_id` within 1 second.
- Monitor SAE logs for the Celery worker picking up the job.
- Confirm the video URL returned is an OSS URL (`oss-cn-hongkong.aliyuncs.com/...`).

---

## Plan B: Quick MVP (Supabase + Vercel + Railway)

**Goal:** Get a working, publicly accessible demo running in under 2 hours. Easy to verify, easy to share. Suitable for MVP presentations and small scale (up to ~200 concurrent users).

> [!NOTE]
> This plan keeps Supabase as the database, Vercel for the frontend, and Railway for the backend + Celery workers. No server management required — everything is deployed by pushing to GitHub.

> [!WARNING]
> This plan does **not** support Mainland China access well (Vercel/Railway IPs are often slow from China). Use this for demos and international users only.

### Architecture Overview

```
[Browser] → Vercel Edge (Next.js frontend)
                    ↓
           Railway (FastAPI container)
                    ↓             ↓
            Railway Redis     Supabase PostgreSQL
                    ↓
           Railway (Celery Worker container)
                    ↓
           Cloudflare R2 (Video storage, free egress)
```

### Step-by-Step Deployment

#### Step 1 — Set Up Supabase Database
1. Go to [supabase.com](https://supabase.com) → New Project → choose a region near your users.
2. From Settings → Database, copy the **Connection String (URI)** (with password filled in).
3. Format: `postgresql://postgres:<password>@<host>:5432/postgres`
4. Go to **SQL Editor** → paste and run [backend/database/init.sql](file:///Users/LeoQin/Documents/GitHub/mentormind/backend/database/init.sql) to initialize all tables.

#### Step 2 — Set Up Cloudflare R2 (Video Storage)
1. Sign up at [cloudflare.com](https://cloudflare.com) → R2 → Create Bucket: `mentormind-media`.
2. Go to R2 → Manage API Tokens → Create Token with Object:Read+Write + Bucket:admin.
3. In R2 settings, find the S3-compatible API endpoint: `https://<account-id>.r2.cloudflarestorage.com`.
4. Enable a **Custom Domain** under R2 Public Access so you get a clean public URL for videos.

#### Step 3 — Deploy Backend to Railway
1. Go to [railway.app](https://railway.app) → New Project → **Deploy from GitHub**.
2. Select your `mentormind` repo. Set the **root directory** to `backend/`.
3. Railway auto-detects the [Dockerfile](file:///Users/LeoQin/Documents/GitHub/mentormind/backend/Dockerfile). Set **start command** to:
   `uvicorn server:app --host 0.0.0.0 --port 8000`
4. Add a Redis plugin: click `+ Add Plugin > Redis`. Railway auto-injects `REDIS_URL`.
5. Set all environment variables in the Railway Variables panel (see below).
6. Railway gives you a public HTTPS URL like `https://mentormind-backend.up.railway.app`.

#### Step 4 — Deploy Celery Worker to Railway
1. In the same Railway project, click `+ New Service → GitHub Repo` (same repo, same root directory `backend/`).
2. Change the start command to:
   `celery -A celery_app worker --loglevel=info`
3. Set the same environment variables as the API service.
4. Set `CELERY_BROKER_URL` to the same Redis URL as the API service.

#### Step 5 — Deploy Frontend to Vercel
1. Go to [vercel.com](https://vercel.com) → New Project → import your GitHub repo.
2. Set **Root Directory** to [web/](file:///Users/LeoQin/Documents/GitHub/mentormind/backend/core/create_classes.py#253-255).
3. Set environment variable:
   - `BACKEND_URL` = your Railway backend URL
   - `NEXT_PUBLIC_APP_URL` = your Vercel frontend URL

#### Environment Variables (for Railway services)
```bash
# Database
DATABASE_URL=postgresql://postgres:<pass>@<supabase-host>:5432/postgres

# Redis (injected automatically by Railway Redis plugin as $REDIS_URL)
CELERY_BROKER_URL=$REDIS_URL

# Cloud Storage
S3_ENABLED=true
S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<your-r2-access-key>
S3_SECRET_ACCESS_KEY=<your-r2-secret-key>
S3_BUCKET_NAME=mentormind-media
S3_PUBLIC_URL_PREFIX=https://videos.yourdomain.com  # R2 Custom Domain

# AI APIs
DEEPSEEK_API_KEY=...
SILICONFLOW_API_KEY=...
OPENAI_API_KEY=...
```

#### Verify MVP Works End-to-End
1. Open your Vercel URL → go to `/create`.
2. Type in a topic and click generate.
3. The UI should show "pending" and poll every 5 seconds.
4. After ~2 minutes, the video player should appear with a Cloudflare R2 URL.
5. Open Supabase SQL editor → `SELECT * FROM lessons LIMIT 5;` — confirm the lesson was saved with `video_url` and `audio_url` populated.

---

## Fix Required Before Either Deployment

The previous `database/base.py` pool config crash has already been fixed in this repo. The production Docker path below is now the preferred path for a single CentOS VPS.

---

## Plan C: Single VPS (CentOS + Docker Compose)

**Goal:** Fast repeat deployments on one Linux server while keeping PostgreSQL, Redis, model caches, generated media, and Docker dependency layers persistent.

### Why this is faster than the old compose flow

- The backend image is built once and reused by `backend`, `celery-orchestration`, `celery-rendering`, and `celery-heavy-ml`.
- Python, Manim, TeX, Torch, and OCR dependencies stay in Docker build cache layers unless `backend/requirements.txt` or `backend/Dockerfile` changes.
- Runtime data and model downloads persist in named volumes: `backend_data`, `modelscope_cache`, `whisper_cache`, and `paddleocr_cache`.
- PostgreSQL and Redis are private to the Docker network; only nginx publishes port 80.

### Server Setup

1. Install Docker Engine and the Docker Compose v2 plugin on CentOS.
2. Clone the repo on the VPS.
3. Create production env:

```bash
cp .env.example .env
```

4. Edit `.env` for production. At minimum set:

```bash
MENTORMIND_ENV=production
BETTER_AUTH_SECRET=<openssl-rand-base64-32>
NEXT_PUBLIC_APP_URL=https://your-domain.com
ALLOWED_ORIGIN=your-domain.com
CORS_ORIGINS=https://your-domain.com
SILICONFLOW_API_KEY=...
DEEPSEEK_API_KEY=...
```

For same-host VPS deployment, keep `NEXT_PUBLIC_BACKEND_WS_URL` blank so browser WebSockets use the same origin through nginx `/ws/`.

If HTTPS is terminated by a host-level nginx or an older `nginx-proxy`
container, that external nginx must also route `/ws/` to the backend with
WebSocket upgrade headers. Use `nginx/external-tls-proxy.example.conf` as the
reference. A broken `/ws/` route usually shows up as browser-only board lesson
failures while normal HTTP API calls still work.

### Deploy

```bash
chmod +x scripts/deploy-prod.sh
./scripts/deploy-prod.sh deploy
```

Routine code deploys use the same command. Docker will reuse dependency layers; only changed app layers rebuild.

Useful commands:

```bash
./scripts/deploy-prod.sh ps
./scripts/deploy-prod.sh logs
./scripts/deploy-prod.sh restart
PUBLIC_APP_URL=https://your-domain.com ./scripts/deploy-prod.sh smoke
./scripts/deploy-prod.sh down
```

### Notes

- `docker-compose.prod.yml` is production-only. Keep using `docker-compose.yml` or existing dev scripts for local development.
- The production nginx config listens on HTTP port 80. Put HTTPS in front with your VPS-level reverse proxy, cloud load balancer, or a future TLS-enabled nginx update.
- After changing nginx or deployment settings, run `PUBLIC_APP_URL=https://your-domain.com ./scripts/deploy-prod.sh smoke`. A healthy WebSocket path returns `HTTP/1.1 101 Switching Protocols`; `502` means the TLS nginx cannot reach the `/ws/` upstream.
- Do not run `docker system prune -a` as part of normal deploys; it deletes the dependency cache that makes rebuilds fast.
