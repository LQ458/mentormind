# MentorMind 安全性、稳定性、耦合度审计与 MVP 修复计划

审计日期：2026-06-19
范围：本地 `master` 工作区、生产 VPS `mentormind.cloud`、Docker Compose 生产栈、反馈/遥测/管理端相关链路。

## 结论

MentorMind 目前已经具备作为“收集测试 bug 的 MVP”的核心基础：公网入口在线、WebSocket smoke test 通过、Postgres/Redis/backend 容器健康、遥测表已有真实事件，`feedback_moment` 也已经能持续入库。当前最需要处理的是三类风险：

1. 安全边界：部分 admin API 依赖前端页面保护，但后端接口本身必须强制鉴权；生产 SSH 仍是 root 密码登录；生产目录存在未提交改动，发布链路不可重复。
2. 稳定性：VPS 根分区 88% 使用率，Docker 镜像/BuildKit 缓存占用明显；生产前端日志出现少量 Server Action 版本错配；Celery/frontend/nginx 缺少健康检查。
3. 耦合度：`backend/server.py` 已达到 7,426 行，聚合了认证、学习、白板、上传、遥测、反馈、admin、seminar 等多条业务线；Next API 代理也存在重复的认证转发逻辑。

本轮已在本地补上关键反馈 MVP 能力和一处高优先级权限修复：快速 bug 上报、admin quick reports 聚合视图、上传限流、校验错误脱敏、token 日志脱敏、随机 job id、路径逃逸防护、admin metrics 后端强制 admin 校验。

## 生产证据

- 公网地址：`https://mentormind.cloud`
- 主机：CentOS 7 VPS，Docker 26.1.4，Docker Compose v2.27.1。
- 生产目录：`/root/mentormind-clean_20260306115658`
- 当前生产 commit：`6e3e78b fix: surface feedback reporting across app`
- 容器状态：
  - `mentormind-postgres` healthy，0 restarts。
  - `mentormind-redis` healthy，0 restarts。
  - `mentormind-backend` healthy，0 restarts。
  - `mentormind-frontend` running，无 healthcheck。
  - `mentormind-nginx` running，无 healthcheck。
  - 三个 Celery worker running，无 healthcheck。
- `PUBLIC_APP_URL=https://mentormind.cloud ./scripts/deploy-prod.sh smoke` 通过，WebSocket upgrade 返回 `101 Switching Protocols`。
- Postgres `telemetry_events` 已有 2,089 条事件，`feedback_moment` 34 条，最新事件在 2026-06-18。
- Postgres 备份 cron 已存在，保留 30 天，最近备份成功；数据库约 14 MB。
- 根分区 178 GB 中已用 149 GB，可用 22 GB，使用率 88%。
- Docker build cache 约 22.94 GB，存在多组旧 backend/frontend 镜像。
- 生产工作区有大量 tracked/untracked 改动，直接 `git pull --ff-only` 会有发布风险。

## P0 / 立刻处理

### Admin metrics API 后端缺少权限校验

风险：`/admin/metrics` 返回 lesson metadata、生成成本、质量分、媒体 URL、`ai_insights` 等内部信息。前端 `/admin` 页面有 middleware，但 `/api` 路由不应依赖页面层保护。

处理：

- `backend/server.py`：`get_admin_metrics` 增加 `current_user = Depends(get_current_user)`，非 admin 返回 403。
- `web/app/api/backend/admin/metrics/route.ts`：使用统一 `backendHeaders(req)`，从 Authorization 或登录 cookie 派生后端认证头。
- `backend/tests/test_admin_metrics_auth.py`：覆盖非 admin 在 DB 访问前被拒绝。

### 生产 root 密码登录

风险：root 密码已经通过协作渠道流转，必须视为需要轮换的凭证。

计划：

- 本轮部署完成后立即轮换 root 密码。
- 增加非 root deploy 用户，使用 SSH key 登录。
- 禁用 `PermitRootLogin` 或至少禁用 root password auth。
- 将部署权限限制到 Docker/项目目录所需范围。

### 生产目录 dirty worktree

风险：生产源代码与 GitHub commit 不一致，`git pull --ff-only` 不可预测；如果直接清理可能丢失当前生产补丁。

计划：

- 部署前在 VPS 上保存 patch 和 untracked 归档。
- 使用 `git stash push -u` 或单独保存分支保全生产 dirty 状态。
- 本地创建可追溯 git 保存节点并 push。
- VPS 拉取新 commit 后再 `./scripts/deploy-prod.sh deploy`。

## P1 / 本轮应完成

### 反馈 MVP 闭环

目标：让测试者能快速报 bug，管理员能按页面、类别、严重程度、report id 追踪。

已实现本地修改：

- `FeedbackHub` 提交更可靠：发送中/错误状态、必须填写说明或预期行为、提交后显示 report id。
- `trackNow` 让交互类反馈尽量同步发送，减少页面卸载丢事件。
- 后端 admin quick reports API：`/admin/feedback/reports` 与 `/admin/feedback/reports/aggregate`。
- Admin 页面增加 quick bug reports、筛选、CSV 导出、详情查看。
- Next 代理支持从 cookie 转发认证，admin 页面刷新后仍能访问后端 admin API。

验收：

- 未登录访问 admin reports 返回 401。
- 非 admin 返回 403。
- admin 可看到 quick reports 聚合和列表。
- 新提交反馈能拿到 report id，并出现在 admin 页面。

### 上传与日志安全

已实现本地修改：

- ValidationError 默认不再返回 request body；仅 `MENTORMIND_DEBUG_VALIDATION_BODY=true` 时用于调试。
- 认证错误日志不再打印 token 明文。
- 上传文件按类型设上限：audio 100 MiB，image/PDF 25 MiB，seminar audio 50 MiB。
- job id 改为随机 token，减少时间戳枚举风险。
- media 路径使用 `os.path.commonpath` 防目录逃逸。

### 生产磁盘压力

计划：

- 不执行 `docker compose down -v`。
- 不执行 `docker system prune -a`。
- 先完成 git/部署，再做保守清理：
  - 查看当前镜像引用。
  - 仅清理未使用 build cache 或明确未被容器引用的 dangling images。
  - 保留最近一个可回滚镜像。
  - 清理前后记录 `df -h` 与 `docker system df -v`。

## P2 / 下一轮硬化

- 为 frontend/nginx/Celery worker 增加 healthcheck。
- 为生产 `deploy-prod.sh` 增加 `preflight`：检查 dirty worktree、磁盘阈值、备份新鲜度、env 语法。
- 将 `backend/server.py` 拆分为 routers：
  - `routers/admin.py`
  - `routers/feedback.py`
  - `routers/telemetry.py`
  - `routers/uploads.py`
  - `routers/board.py`
  - `routers/study_plan.py`
- 将 admin role 校验收敛为 `require_admin_user` 依赖，避免每个 handler 手写。
- 将 Next `web/app/api/backend/**/route.ts` 代理统一到共享 helper，减少 cookie/Auth 转发漂移。
- 将 DB migration 从运行时散落的 additive migration 收敛到显式迁移流程。
- 给 `telemetry_events` 增加适合 admin 查询的索引和保留策略，避免 MVP 测试量上来后 admin 页面变慢。
- 增加离站备份或对象存储备份，当前只有本机备份。

## 修改与发布计划

1. 本地完成安全 hotfix 与反馈 MVP 验证。
2. 创建 git 保存节点：
   - 分支：`codex/security-stability-feedback-mvp`
   - 提交内容：审计报告、反馈 MVP、admin API 权限修复、相关测试。
3. 推送到 GitHub。
4. VPS 发布前保全现场：
   - 保存 `git diff` patch。
   - 归档 untracked 文件。
   - 记录当前 `git status --short`、`docker compose ps`、`df -h`。
5. VPS 切换到已推送 commit：
   - `git fetch origin`
   - `git checkout master`
   - `git pull --ff-only`
   - 若 dirty worktree 阻塞，先使用已保存 patch 后的 `git stash push -u` 保全。
6. 部署：
   - `./scripts/deploy-prod.sh deploy`
   - `PUBLIC_APP_URL=https://mentormind.cloud ./scripts/deploy-prod.sh smoke`
7. 发布后验证：
   - 站点首页 200。
   - `/api/backend/status` 200。
   - 未认证 `/api/backend/admin/metrics` 返回 401 或 403。
   - 未认证 `/api/backend/admin/feedback/reports` 返回 401 或 403。
   - 提交一条 smoke feedback，admin API 可查。
8. 发布后安全收尾：
   - 轮换 root 密码。
   - 规划 SSH key-only deploy 用户。
   - 保守清理 Docker cache，降低根分区压力。

## MVP 好用标准

本平台作为“collect 测试 bug”的 MVP，应满足：

- 测试者在任意页面 10 秒内能提交 bug。
- bug 必须带页面、类别、严重程度、说明、session/report id。
- 管理员能按严重程度、页面、类别过滤，能导出 CSV。
- 管理员看到的错误、反馈、性能事件可以合并判断，不需要查数据库。
- 未登录和非 admin 用户不能访问 admin 数据。
- 发布流程可重复，生产源码状态可追溯。
- 生产磁盘、备份、容器健康状态能在部署前自动提示。
