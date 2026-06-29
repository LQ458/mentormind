# 白板 TTS + 节奏 修复与移交 — 2026-06-29

**面向:** Codex(生产维护方)。本文是当前白板课链路的权威状态:已做完什么、生产现状、**剩下要做什么(Phase 2 激活)**、如何验证、以及踩坑清单。

**生产现状:** `mentormind.cloud` 已部署到 `main @ 26a2e8d`,8 容器健康。本轮三处修复均已**上线并用既有 Playwright 套件(`scripts/board-pacing-qa.mjs`)在生产端到端验证过**。

---

## 1. 本轮已完成(已部署 + 已验证)

| # | 提交 | 内容 | 验证证据(生产) |
|---|------|------|------------------|
| 1 | `484b8a2` | **火山 TTS 切到 V3 大模型 API** | 课程不再超时/崩溃;全容器 `edge-tts` 兜底 = 0、V3 错误 = 0 |
| 2 | `da456fe` | **V3 时长估算修正(64kbps)** | `ffprobe` 实测 ratio = 1.00(104877B→13.10s) |
| 3 | `fa2f5d2` + `26a2e8d` | **手机端 footer 压住白板修复** | QA `footer_overlaps_board` 由 63px → **消失**(desktop+iphone) |

### 1.1 TTS V3 切换(`backend/services/tts/service.py`)
- **根因:** 生产 appid 的旧版 `/api/v1/tts` 授权已死——所有 `BV*` 音色返回 `3001 grant-not-found`(连免费 BV001/BV002 也不行)。于是每节课都回退到慢速 `edge-tts` → 课程超时/崩溃(`lesson_timeout_or_crash`,曾 23/23 回退)。
- **修复:** `text_to_speech()` 改用 **V3 大模型端点** `https://openspeech.bytedance.com/api/v3/tts/unidirectional`:
  - 鉴权头 **`X-Api-Key: <VOLC_TTS_TOKEN>`**(不是旧的 `Authorization: Bearer;token`,也不是 `X-Api-App-Id/X-Api-Access-Key` —— 那些都 401)。
  - `X-Api-Resource-Id` + `X-Api-Request-Id`(uuid)。
  - body:`{"user":{"uid":...},"req_params":{"text","speaker","audio_params":{"format":"mp3","sample_rate":24000}}}`。
  - 响应是 **NDJSON 流**:逐行 `{code,data(base64 chunk),message}`;`code 0` + `data` → 累加解码块;`code 20000000` → 结束;其它 code → 兜底。
  - **已授权音色(本 appid 仅有 bigtts 大模型授权):** 女声 `seed-tts-2.0` ↔ `zh_female_vv_uranus_bigtts`;男声 `seed-tts-1.0` ↔ `zh_male_M392_conversation_wvae_bigtts`。`BV*` 在 V3 返回 `55000000` 资源/音色不匹配。
  - **保留 `edge-tts` 兜底**:非 200 / 无音频 / `aiohttp.ClientError` 时回退,课程仍有声。
- ⚠️ **凭证:** `VOLC_TTS_APPID` / `VOLC_TTS_TOKEN` 来自后端容器环境,**切勿写进仓库或日志**。

### 1.2 时长估算(同文件)
- V3 NDJSON 不带时长。V3 的 mp3 实际是 **64kbps**(非 128),旧常量令 `TTSResult.duration` 偏小 **2×** → 会让节奏引擎推进速度翻倍。已把 `bitrate["mp3"]` 改为 `64000`,`ffprobe` 校验 ratio = 1.00。

### 1.3 footer 压住白板(`web/app/board/[sessionId]/page.tsx`)
- **现象:** iphone(390×844)上"向 AI 老师提问"的 `<footer>` 浮在白板内容之上,QA 测得纵向重叠 63px。
- **真因(flexbox `min-height:auto` 陷阱):** 画布外层 wrapper(`relative flex-1 min-w-0`)缺 `min-h-0`,在 flex-col 下无法收缩到分配高度,被内容(所有堆叠卡片)撑高;`.board-canvas` 的 `h-full` 拿不到确定高度,其内部 `overflow-y-auto` 滚动失效,画布外溢盖住 footer。**正因如此,改 footer/外层高度数值时重叠永远是同一个 63px。**
- **修复:** 页面根改为定高 flex(`h-[100dvh] flex-col overflow-hidden`),main `flex-1 flex-col`,画布/聊天行 `flex-1 min-h-0`,**并给 wrapper 加 `min-h-0`**(关键一步,`26a2e8d`)。现在白板内部滚动、底部正好顶到 footer。`.board-canvas` 内部已是 `overflow-y-auto`,所有浮层(SummaryPanel/checkpoint/settings)都是 `fixed`/`absolute`,故根 `overflow-hidden` 不会裁掉它们。

---

## 2. 剩下要做的(移交给 Codex):消除 `speech_playback_backlog`

### 2.1 现象与数据
QA(`scripts/board-pacing-qa.mjs`,生产)在三处修复后仍报 **`speech_playback_backlog`(medium,desktop+iphone)**:
- desktop:旁白总时长 ~295s,但白板**生成跨度**仅 ~70s → 落后 ~224s。
- iphone:旁白 ~498s vs 生成 ~72s → 落后 ~426s。
- 注:`elementsBeforeFirstAudio=1`、`maxLagMs≈5.7s` —— 首音频前不抢跑、单元到音频延迟也小;问题是**后端把整节课的元素在 ~70s 内全生成完,而旁白要放 5–8 分钟**,白板整体远远跑在语音前面。

### 2.2 为什么还在
- **Phase 1(前端学习者分段)** 已上线:`useBoardPacing.ts` 按 `metadata.segment_index` 分段、按段揭示、音频门控、`继续 ▶`。它管**前端揭示节奏**。
- **Phase 2(后端按段暂停)** 引擎已写好但**未激活**:门控是 `config.BOARD_BACKEND_PAUSE`(默认 `false`,生产未设)**且** 每会话 `backend_pause_wired`(需 server.py 板 WS 接线,目前 = False)。两者任一为假 → 后端**不**在段界阻塞 → 一口气生成完 → backlog。
  - 代码位:`backend/core/streaming/lesson_generator.py:461-475`(段界处 flag-gated 决定 `pause_after_round`);引擎 `backend/core/board/pacing.py`(`BoardPacingController`);开关 `backend/config/config.py:208`(`BOARD_PACING_MODE` 默认 `learner_paced`)、`:223`(`BOARD_BACKEND_PAUSE` 默认 `false`)。

### 2.3 待办(按序)
1. **接线 Phase 2(server.py 板 WS ⇄ `BoardPacingController`)**:实现 `awaiting_continue` 状态、`continue`/`answer`/`skip` 入站动作、断连恢复;**server.py 零增长**(逻辑放 `core/board/pacing.py` 这个 leaf 模块,server.py 只瘦委托)。把每会话 `backend_pause_wired` 置真。
2. **打开后端暂停**:置 `BOARD_BACKEND_PAUSE=true`,使生成在**轮间**(绝不 mid-stream)按段阻塞,直到前端 `continue`。**绝不强制硬停**——这是 v2 的核心原则(见 `docs/reports/board-interactive-pacing-draft.md`)。
3. **⚠️ 必须 staging 端到端验证**:这是 WS 异步控制流,本地无法跑完整 stack(后端 ML 依赖会 OOM)。务必在 staging 跑通 continue/answer/断连恢复后再上生产。
4. **回归**:用既有套件验。`speech_playback_backlog` 应消失(生成跨度 ≈ 旁白时长,因为后端按段等)、课程仍 `settled=true`、无 `edge-tts` 回退、无 `audio_error`。

### 2.4 判断点(需产品/你定夺)
`speech_playback_backlog` 是**后端生成速度** vs **旁白长度**的差,不等于用户**实际看到**抢跑(前端 `revealedElementCount` 已门控揭示)。先确认这是否是真用户痛点,再决定是否值得开 Phase 2 后端暂停(它会显著拉长"生成完成"耗时,但换来生成-语音同步)。

---

## 3. 验证手册(既有 Playwright 套件)

```bash
# 生产(默认 BASE_URL=https://mentormind.cloud)
cd web
BASE_URL=https://mentormind.cloud \
QA_INVITE_CODE=MM-NX7K-ALPHA-2024 \
MAX_LESSONS=2 LESSON_TIMEOUT_MS=200000 OUT_DIR=/tmp/qa-out \
node ../scripts/board-pacing-qa.mjs
# 结果:OUT_DIR/report.json + report.md + 每视口截图
```
- 套件:注册一次性 `boardqa_sim_*` 用户(用邀请码;`is_available` 规则下 `max_uses=0` = 无限,种子码见 `backend/migrate_db.py:316`)→ 建 study-plan → 生成白板课 → 轮询 board state → 开 `/board/{sessionId}` 截图测 footer/溢出/原始标记等。
- TTS 回退自检(生产容器):
```bash
docker exec mentormind-backend sh -c \
 'docker logs ... ' # 或：grep "falling back to edge-tts" 后端+celery 日志近 N 分钟应为 0
```
- 直测 V3(生产容器内 `python`,调真实 `TTSService.text_to_speech`)可确认女/男声出真音频。

---

## 4. 部署流程(同 CLAUDE.md)
1. 本地修 + 测。2. 提交 + 推 **`main`**(**切勿 master**;Conventional、scope-less、**无 AI 署名**)。3. SSH VPS `root@124.156.132.192`(`~/Downloads/mentormind.pem`)→ `cd /root/mentormind-clean_20260306115658` → `git fetch origin && git reset --hard <sha>` → `./scripts/deploy-prod.sh deploy`(前端独改用 `deploy frontend` 更快)。4. 跑 §3 QA。
- ⚠️ `git fetch origin main` 后远端跟踪 ref 可能滞后 → **`git reset --hard <显式 sha>`**,别 reset 到 `origin/main`。

---

## 5. 踩坑清单
- **文件大小棘轮** `scripts/check_file_size.py`:`CAP=600`,基线只减不增。`server.py` 基线 7804(零增长)、`useBoardWebSocket.ts` 745、本次 `service.py` 279 行(<600)。每次提交必过。
- **生产 DB 只读**:`docker exec mentormind-postgres psql -U mentormind -d mentormind_metadata`(角色是 `mentormind`,不是 `postgres`)。
- **QA 用户污染**:套件建的是真用户,标 `boardqa_sim_*` / `simulation_source`;真实-vs-模拟反馈分桶时注意剔除。
- **自动提交**:会用非 Conventional 信息重盖改动;推前 soft-reset 到干净再按规范提交。勿提交 `web/tsconfig.tsbuildinfo` 与敏感 CEO/审计报告(工作区里那几个 `docs/reports/mentormind-ceo-*` / `*-status-*` 保持 untracked)。
- **/create 仍隐藏勿删**(见 CLAUDE.md)。

---

## 6. 关联文档
- 计划(中层+底层):`docs/planning/board-interactive-pacing-implementation-plan.md`
- 高层依据:`docs/reports/board-interactive-pacing-draft.md`
- 测试/反馈架构:`docs/ai-testing-feedback-architecture.md`
