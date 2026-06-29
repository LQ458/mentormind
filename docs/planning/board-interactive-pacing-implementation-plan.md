# 白板互动节奏 v2 — 中层 + 底层实施计划

状态:实施进行中。把已批准的高层实践落到架构(中层)与逐文件任务(底层)。

**实施进度(2026-06-26):**
- ✅ **Phase 0(契约+配置)** — PR #5(`feat/board-pacing`→`main`):config 节奏开关、`state_manager.end_segment()`、`end_segment` 工具+schema+validator、生成器发段界、prompt 节奏小节、8 个后端测试。
- ✅ **Phase 1 前端(T1.3–T1.5 核心)** — PR #6(`feat/board-pacing-frontend`→`feat/board-pacing`,叠加):新 `useBoardPacing.ts`(按 `metadata.segment_index` 分段、按段揭示、音频门控、`继续 ▶`、autoplay 切换);`NarrationPlayer`/`BoardCanvas` 加可选门控属性;page.tsx 拆分(`BoardChatPanel`/`BoardFooterControls`)后接线。`useBoardWebSocket.ts` 零改动。`pnpm build`+大小 ratchet 绿。无 `segment_index` 时塌缩为一段=今日行为(零风险上线)。独立 code-review(FIX-FIRST,5 项)已处置:HIGH(autoplay 被拦截 → 继续按钮死锁)+ MEDIUM(语音 stale-closure)已修,2 个 LOW 已修;resume 重置(MEDIUM)延后 Phase 1b。
- 🔄 **Phase 1b(进行中)** — ✅ 学习者拉取帮助(`BoardHelpControls`,PR #6)、✅ resume 保位(`markResumed()`,PR #6)、✅ 非阻塞内联邀请(`segment_boundary.invite` → `BoardInviteCard`;事件类型抽到 `useBoardWebSocket.types.ts`,god-module 998→745;独立审查 SHIP,dismiss-by-reference + a11y 已修,PR #6)、✅ 末尾 recap(generator 末尾 yield `comprehension_check`,server.py 零改动;前端 `ComprehensionCheckpoint` 去模态 + `BoardRecapCheck`;4 单测,PR #7)。
- 🔄 **Phase 2** — ✅ 引擎(flag-gated 默认关:`BOARD_BACKEND_PAUSE` + 每会话 `backend_pause_wired` 双门控;`continue_queue`/边界 await(轮间)/新 `core/board/pacing.py` `BoardPacingController`/自适应 checkpoint;47 单测;2 轮 FIX-FIRST 审查已修;PR #7);⏳ 激活(server.py WS 接线 continue/answer/awaiting_continue/断连恢复——server.py 零增长 + WS 异步控制流**需 staging 端到端验证**,本环境无法跑完整 stack)。

**进度更新(2026-06-29 · 生产 `main @ 26a2e8d`):** 用既有 Playwright 套件(`scripts/board-pacing-qa.mjs`)在 dev/生产实测白板课,定位并修复阻断项:
- ✅ **火山 TTS V3 切换**(`484b8a2`)——旧版 `/api/v1/tts` 授权死(BV* 全 `3001`),每节课回退慢速 edge-tts → 课程超时/崩溃。改用 V3 大模型(`X-Api-Key` + NDJSON + bigtts 音色),保留 edge-tts 兜底。生产实测:edge-tts 回退 = 0、课程 `settled`。
- ✅ **V3 时长估算修正(64kbps)**(`da456fe`)——旧 128kbps 常量令 `TTSResult.duration` 偏小 2×(会让节奏引擎推进翻倍),ffprobe 校验 ratio=1.00。**Phase 2 激活的前置依赖。**
- ✅ **手机端 footer 压住白板修复**(`fa2f5d2`+`26a2e8d`)——flexbox `min-height:auto` 陷阱:画布 wrapper 缺 `min-h-0` 致内部滚动失效、外溢盖 footer(固定 63px)。改定高 flex + wrapper `min-h-0`,QA `footer_overlaps_board` 消失。
- ⏳ **仍未解决:`speech_playback_backlog`** —— 后端 ~70s 生成完整节课,旁白 5–8 分钟,白板整体跑在语音前。根因正是上面 **Phase 2 激活未完成**(`BOARD_BACKEND_PAUSE` 默认关 + server.py 板 WS 未接线 `backend_pause_wired=False`)。**移交 Codex 续做,需 staging 端到端验证。**
- 📄 **完整移交文档:`docs/reports/board-tts-pacing-handoff-2026-06-29.md`**(含 V3 配置、QA 手册、Phase 2 待办与踩坑)。

高层依据:`docs/reports/board-interactive-pacing-draft.md`(证据:Mayer 分段 d≈0.98、强制硬停惹人烦、应变+渐隐、学习者拉取帮助)。
代码勘察依据:本计划所有 file:line 来自对 `lesson_generator.py / server.py(板 WS)/ tts_sync.py / state_manager.py / models.py / board_server.py / checkpoint_generator.py / config.py / useBoardWebSocket.ts / NarrationPlayer.tsx / BoardCanvas.tsx / board/[sessionId]/page.tsx / ComprehensionCheckpoint.tsx` 的只读勘察。

---

## 0. 一句话目标

把白板课从"连续流式、不停顿"改成 **学习者自控分段 + 非阻塞邀请式检查 + 自适应/渐隐 + 随时可拉取帮助**,并顺带消除"旁白比板面慢 6–12 分钟"的滞后。**绝不强制硬停**。

---

## 0.5 新规范合规重审(2026-06-26 standards/harness)

按更新后的 `CLAUDE.md` + `docs/standards.md` + 大小棘轮 `scripts/check_file_size.py` 重审,本计划原稿有 **7 类不合规**,以下纠正为**约束性**,覆盖第 3 节中相应任务的落点:

**A. 文件大小棘轮(最严重)** — 实测:`server.py` 基线 **7804(只能减不能增)**、`useBoardWebSocket.ts` 基线 **998(只能减不能增)**、`web/app/board/[sessionId]/page.tsx` **≈599 行已顶到 600 上限(余量~1)**。原稿把逻辑堆进这三者 → 必然棘轮失败。纠正:
- **server.py(基线·零增长)**:板 WS 的 `awaiting_continue`/`continue·answer·explain` 动作/段界停/recap 逻辑 → 抽到**新 leaf 模块 `backend/core/board/pacing.py`**(`BoardPacingController`:边界判定、`_adaptive` 信号、continue/answer/skip、状态转换;<600 行)。server.py 板 WS 只留**瘦委托**(调用 controller),净增 ≈0;尽量把现有内联逻辑顺手移入以抵消。
- **useBoardWebSocket.ts(基线·零增长)**:段模型/reducer/`send*` → 抽到**新 hook `web/app/hooks/useBoardPacing.ts`**(消费 useBoardWebSocket 的事件流;段分组、揭示状态、音频门控、`sendContinue`/`sendCheckpointResponse`;<600)。useBoardWebSocket.ts 仅做最小 union 扩展;若净增 >0,把事件类型抽到单独 `types` 文件等量抵消。
- **page.tsx(顶到上限)**:Phase 1 **第一步先拆分** page.tsx——把控件/区块抽到 `components/board/{SegmentControls,InvitationCheck,BoardFooterControls}.tsx` + `useBoardPacing`,使其**净缩**出余量后,再接 board-pacing。
- 其余目标文件有余量(lesson_generator 215 / tts_sync 390 / state_manager 347 / models 384 / board_server 386 / checkpoint_generator 539 / config 393 / BoardCanvas 277 / NarrationPlayer 368 / ComprehensionCheckpoint 125)→ 可增,但**每个新文件 <600**,且每次提交 `python scripts/check_file_size.py` 必过。

**B. 结构 / god-module** — 遵守"新逻辑进 leaf 模块,不堆 god-module":后端 board-pacing → `core/board/pacing.py`(新);前端 → `hooks/useBoardPacing.ts` + `components/board/*`(新);`server.py` / `useBoardWebSocket.ts` 只做瘦接线。

**C. 测试/验证口径(原稿"前端单测"违规)** — 仓库**无前端单测套件,且规范明令勿臆造**。纠正:
- **后端**:`pytest`(repo root,tests 大小豁免)覆盖 `BoardPacingController`、`end_segment`/段缓冲、`AdaptiveSignals`、`skipped` score_map;改的 .py 跑 `black <files> && flake8 <files>`(+ isort black profile)。
- **前端**:`pnpm lint` + `pnpm build` + `pnpm qa:board-local`(Playwright smoke,需起服务);纯逻辑(段分组等)靠 qa smoke 验,不新建单测套件。
- **统一门槛(每个任务追加)**:`python scripts/check_file_size.py` 通过;`pre-commit` 不报错(size ratchet 硬、black/flake8 advisory)。

**D. 同步 / 分支 / 部署** — 主线是 **`main`**(`origin/HEAD→origin/main`),**绝不推 `master`**;分支 `feat/board-pacing-*`;commit/push **仅在你要求时**;提交 Conventional、scope-less、**无 AI 署名 trailer**;部署 = 推 `main` → VPS 拉 → `./scripts/deploy-prod.sh deploy` → smoke。
- ⚠️ **落地前置(需你定夺)**:本会话此前生产在 **master** 上(修复也推/部署自 master),但新规范定 main 为主线。**部署前须确认生产追踪 main(或把 origin/main 对齐到生产)**,否则"推 main"不会上线。

**E. 服务器 / SSE** — 板用 WS;若任何流经 nginx,保持 `X-Accel-Buffering: no`;长任务留 Celery、不进请求处理器(本计划生成在 WS 流,符合);改后端后按规范重启相应服务再测。

**F. 函数复杂度(评审指引)** — 新增函数 <50 行、≤5 参、复杂度 ≤15;`BoardPacingController` 拆小方法,别把段界/自适应/await 揉成一个大函数。

**G. JSON 解析** — 本计划不新增 LLM JSON 解析;Phase 2 续轮若需解析,复用既有 helper(`extract_json`/`_parse_plan_json`/…),勿新造 fence-stripper。

> 净效果:第 3 节任务的**落点**改为"新 leaf 模块为主、基线文件零增长、page.tsx 先拆后加",验收统一追加 `check_file_size` + `black/flake8` + `pnpm lint/build/qa` 门槛;架构/分支/部署对齐新规范。任务**顺序与分期不变**(Phase 0→1→2)。

---

## 1. 中层:架构决策(锁定 + 理由)

### 1.1 分段边界由谁定 → **LLM 主导 + 后端兜底**
- 新增**控制工具 `end_segment`**,提示词要求模型在"一个完整想法(~2–4 元素)"处调用。它是**生成器层的控制工具**(在 `lesson_generator.py` tool-call 分支里**先于** board 工具拦截),不进入 `board_server` 的 6 个状态变更工具——保持 `board_server` 纯状态。
- **兜底**:`state_manager` 维护"自上个边界以来的元素缓冲";若超过 `BOARD_SEGMENT_MAX_ELEMENTS`(默认 4)模型仍未调用,生成器自动补一个边界 → 非合规模型也不会退化成连续流。
- 理由:LLM 定边界=教学质量最好;cap=优雅降级。(解决勘察 OpenQ:边界来源)

### 1.2 新事件契约 → **`segment_boundary`(非阻塞)**
- 由 `state_manager.end_segment()` 用 `_emit` 产出,**`element_id` 置顶**(=该段最后一个元素,遵守已知 shape 规则,见 `[[feedback_board_event_shape]]`)。
- `data = { segment_index, element_ids[], audio_element_ids[](本段有旁白的元素=客户端需播完才允许继续), expected_audio_count, is_last_segment, invite?:{kind:'predict|choose|restate|do_step', prompt, options?, element_id?} }`。
- **契约即非阻塞**:边界只告诉客户端"本段音频播完前别揭示下一段",从不强制作答。

### 1.3 两种节奏模式 → `BOARD_PACING_MODE = learner_paced(默认) | autoplay`
- `learner_paced`:客户端按段揭示、音频门控、显示"继续 ▶";(Phase 2)后端在边界 await。
- `autoplay`:行为=今天(连续播放),边界事件客户端忽略;给"想躺着看"的人。前端可加切换,**实时翻转**(对已生成内容只影响揭示)。

### 1.4 关键分叉:后端是否在边界暂停 → **分两阶段**
> 这是风险/收益的核心权衡,决定了计划的分期。

| | Phase 1:前端门控(先做) | Phase 2:后端暂停(后做) |
|---|---|---|
| 机制 | 后端**急切生成全程** + 发 `segment_boundary`;前端按段揭示/音频门控/继续/非阻塞邀请 | 后端在边界 **await 学习者 continue** 后再生成下一段;有界队列背压 |
| 交付 | 学习者自控 UX + **修复音画滞后** + 非阻塞检查 + 拉取帮助 | **真正应变式**(把学生回答喂回下一段)+ **省算力**(没到的段不生成) |
| 风险 | 低(纯前端 + 加一个事件,不动 WS 控制流) | 中(async 生成器内 await、有界队列、`awaiting_continue` 状态、断连恢复、跨线程信号) |
| 自适应 | 启发式决定边界是否带 invite(内容已生成,无法改内容) | 把"学生答错/卡住"作为 steering turn 注入下一轮 → 改下一段内容 |

→ **Phase 1 先上,独立交付价值且低风险;Phase 2 在 Phase 1 的契约上加后端暂停实现完整愿景。**

### 1.5 其余锁定项
- **检查非阻塞 + 内联**:复用 `ComprehensionCheckpoint.tsx` 但去掉 `role=dialog/aria-modal/useFocusTrap`(现 47–51 是阻塞模态),做成内联卡片;"继续 ▶"始终可点。
- **答题回流**:结构化(🟢🟡🔴/MCQ)走 `POST /board/checkpoint-response`(写 `StudentPerformance`)+ WS 消息;`_ALLOWED_CHECKPOINT_RESPONSES` 增 `skipped`(跳过=工程信号,score=None)。
- **跨线程安全**:`/board/checkpoint-response`(同步 handler,worker 线程)**禁止**直接 `enqueue_*`(asyncio.Queue 跨线程不安全);改为写 `session['_pending_signals']` 普通 list,由 WS 循环每轮 drain。
- **恢复/持久化**:段归属用**每元素 `metadata.segment_index`**(无 DB 迁移);`event_log` 非 DB 列,故边界靠元素 metadata 复原。旧会话无段信息 → **回退 autoplay**(只在收到 `segment_boundary` 时才门控)。
- **音频门控**:客户端按 `expected_audio_count` 满足(`audio_ready` **和** `audio_error` 都计数,避免合成失败永久卡死)+ 最后一条 `onPlaybackEnd`;`BOARD_FAST_MODE`(Web Speech,无 `audio_ready`)时只按 `onPlaybackEnd` 计。
- **配置**:集中到 `config.py` 类属性 + 两个 compose 文件声明(backend **和** celery);统一一个 `_pacing_mode()` helper,避免 `config.py` 与 `tts_sync` 直读 env 两套口径打架。

### 1.6 数据流(Phase 2 全貌)
```
LLM --end_segment--> generator 拦截 --> state_manager.end_segment() --> segment_boundary 事件
   --> tts_sync(有界队列背压) --> 板 WS _send_events --> 客户端
客户端: 揭示本段 + 播本段音频 --(音频播完)--> 显示"继续▶"/内联邀请
学习者: 点继续(±答题) --WS {action:'continue'|'checkpoint_response', signals}-->
   后端: 写 _pending_signals/_adaptive + generator.enqueue_continue(payload)
   --> 生成器 await 解除, 注入 steering turn(struggled/cruising) --> 生成下一段
```

---

## 2. 中层:各子系统改动概要

- **生成器 `lesson_generator.py`**:加 `import os` + pacing/segment/adaptive 实例字段;tool 列表加 `end_segment`;tool-call 分支拦截边界→`state_manager.end_segment()`;(P2)`continue_queue` + `_wait_for_continue` await;steering turn 注入;`max_rounds` 改为时长感知。
- **状态层 `state_manager.py` / `models.py`**:`end_segment()` 发射器 + 每段元素缓冲;`add_element` 给元素盖 `metadata.segment_index`;`BoardEvent` 文档补 `segment_boundary`(无需改字段)。
- **板 WS `server.py`**:`segment_boundary` 加入 `should_checkpoint` 集;(P2)`awaiting_continue` 状态 + `continue/answer/checkpoint_response/explain` 入站动作 + 边界 await 协调;`_send_events` 不变即可转发新事件;`submit_checkpoint_response` 写 `_pending_signals`。
- **TTS `tts_sync.py`**:(P2)`out_queue` 改有界(`maxsize≈8`)实现背压;给段内最后一条旁白可选打 `segment_last`。
- **检查器 `checkpoint_generator.py`**:`should_insert_checkpoint` 改为吃 `AdaptiveSignals`(对错/重复提问/停留/跳过)→ 默认少、卡顿多、顺畅渐隐;`generate_checkpoint` 输出 `invite_response=true` + "一起想想"措辞。
- **前端**:`useBoardWebSocket.ts` 加 `segment_boundary`/`comprehension_check` reducer + segment 模型 + `sendContinue/sendCheckpointResponse/sendExplain`;`BoardCanvas` 按已揭示段渲染;`NarrationPlayer` 只喂已揭示段音频 + `onQueueDrained`;`page.tsx` 加"继续▶"(音频门控)+ 内联邀请 + 挂 `ExplainDifferentlyButton`/"为什么这步" + `pacingMode` 切换;新增 `/api/backend/board/checkpoint-response` 代理路由。
- **配置/部署**:`config.py` 新键 + `docker-compose*.yml`(backend+celery)声明;顺带补声明现未声明的 `BOARD_FAST_MODE`。

---

## 3. 底层:分阶段任务(逐文件 + 验收)

> PR 粒度建议:每个 **T** 一个可独立 review 的提交;Phase 0 先行(纯加性契约),Phase 1 交付 UX+滞后修复,Phase 2 加后端暂停/应变。

### Phase 0 — 契约与配置(加性、零行为变更、最低风险)

**T0.1 集中配置键** · `backend/config/config.py`(模块块 ~177–209)
- 加类属性:`BOARD_PACING_MODE=os.getenv('BOARD_PACING_MODE','learner_paced')`、`BOARD_SEGMENT_MAX_ELEMENTS=int(...,'4')`、`BOARD_SEGMENT_MIN_ELEMENTS=int(...,'2')`、`BOARD_ADAPTIVE_INVITE_EVERY_N_SEGMENTS=int(...,'3')`、`BOARD_ADAPTIVE_STRUGGLE_EVERY_N=int(...,'1')`、`BOARD_ADAPTIVE_FADE_AFTER_OK=int(...,'2')`。
- 验收:`import config` 暴露新属性与默认值;未设 env 时默认 `learner_paced`。

**T0.2 compose 声明** · `docker-compose.yml`(backend env 52–71 + celery 块)、`docker-compose.prod.yml`(各 env 块)
- 按 `${VAR:-default}` 风格加上述键到 **backend 和 celery** 两个服务两个文件;顺带补 `BOARD_FAST_MODE: ${BOARD_FAST_MODE:-}`。
- 验收:`docker compose -f docker-compose.prod.yml config -q` 通过且键解析出默认值。

**T0.3 `segment_boundary` 事件 + 发射器** · `backend/core/board/state_manager.py`(在 `emit_comprehension_check` 64 旁)、`backend/core/board/models.py`(BoardEvent 108 注释)
- 加 `end_segment(self, segment_index, element_ids, audio_element_ids, is_last_segment=False, invite=None)`:`return self._emit('segment_boundary', element_id=(element_ids[-1] if element_ids else None), segment_index=..., element_ids=..., audio_element_ids=..., expected_audio_count=len(audio_element_ids), is_last_segment=..., invite=...)`。
- 状态管理器加每段元素缓冲:`add_element`(emit 146)时把当前 `segment_index` 写进**元素 `metadata.segment_index`**并 append 到 `self._current_segment_ids`;`end_segment` 消费并清空缓冲。
- 验收:单测 `end_segment(['a','b'],['a'])` → `event.element_id=='b'`、`data.expected_audio_count==1`、`to_dict()` 中 `element_id` 在根;两个元素的 `metadata.segment_index` 一致。

**T0.4 前端事件类型 + 安全 no-op** · `web/app/hooks/useBoardWebSocket.ts`(BoardEvent union 269、applyEvent 431/688)
- 加 `SegmentBoundaryEvent`/`comprehension_check` 到 union;reducer 暂可 `default` no-op(旧行为不变)。
- 验收:收到 `segment_boundary` 不报错、不改变现有渲染(为 Phase 1 铺路)。

### Phase 1 — 学习者自控揭示 + 音画同步 + 非阻塞邀请(前端为主,后端只发边界)

**T1.1 生成器发段界(LLM 工具 + cap),不暂停** · `backend/core/streaming/lesson_generator.py`(tool 列表 249–251、tool-call 分支 ~322、元素计数)
- `import os`;加 `CONTROL_TOOL_NAMES={'end_segment'}` 并入 LLM 工具列表;在 tool-call 分支**先于** board dispatch 拦截 `end_segment` → 调 `state_manager.end_segment(...)` 并 `yield` 其事件 + 追加 tool-result 消息;维护 `_elements_since_boundary`,超 `config.BOARD_SEGMENT_MAX_ELEMENTS` 自动补边界。**本阶段不 await**(急切生成)。
- 验收:`/board-test` 跑一节课,事件流中按"完整想法"出现 `segment_boundary`;无 `end_segment` 调用时按 cap 自动补;生成不被阻塞。

**T1.2 提示词:新增 Pacing 章节 + 工具说明** · `backend/prompts/board/board_lesson.md`(Available Tools 9–16、新章节)
- 加 `end_segment` 工具说明 + 采用草案 v2 的 `## Pacing & Interaction`(短段、边界调 end_segment、每段至多 1 个可选低压力 invite、绝不阻塞、重检索留到末尾、应变+渐隐)。删除任何"每 N 元素必停/end your turn"措辞(v1 从未上线,确认无残留)。
- 验收:渲染后的 system prompt 含 end_segment 与 Pacing 章节;真实跑课日志见模型在想法边界调用 end_segment。

**T1.3 前端 segment 模型 + 按段揭示** · `useBoardWebSocket.ts`(BoardWSState 301、applyEvent、INITIAL 319/337)、`BoardCanvas.tsx`(render 173–252)
- reducer 加 `segmentBreakAfter:Set<elementId>`、`revealedSegments=1`、`pendingCheck`;`case 'segment_boundary'` 记录边界(元素 metadata.segment_index 为备份来源);选择器 `segmentsOf(state)`。
- `BoardCanvas`:`learner_paced` 时 `renderedElements = 仅已揭示段的元素`(autoplay 保持现 slice 路径);**移动端时间节流在 learner_paced 下关闭**避免双重节奏。
- 验收:learner_paced 下 DOM 只含已揭示段;autoplay 全渲染;单测 `segmentsOf` 对合成事件序列分组正确。

**T1.4 音频按段供给 + 段音频完成回调(核心滞后修复)** · `page.tsx`(NarrationPlayer props 401–413)、`NarrationPlayer.tsx`(cursor 48/76、handleEnded 138–141、reset 79–81)
- `page.tsx`:`learner_paced` 时只把"已揭示段"的 `audioQueue` 传给 NarrationPlayer(autoplay 传全量)。cursor 到队尾即自然停;揭示下一段时 append → 现有 autoplay effect 自动续播。
- `NarrationPlayer`:加 `onQueueDrained()`,在 `handleEnded` 且 `cursor+1>=orderedAudioQueue.length` 时触发;校验 reset-cursor effect 不会重播旧段。
- 验收:板与音频锁步,下一段在"继续"前不渲染/播放;`onQueueDrained` 每段恰好触发一次;音画滞后在 learner_paced 下消失。

**T1.5 "继续 ▶" 控件(音频门控)+ 出站 continue** · `page.tsx`(画布/页脚 605–637、键位 191–198)、`useBoardWebSocket.ts`(BoardClientAction 702–705、新 `sendContinue`)
- 追踪 `segmentAudioDone`(onQueueDrained 置真;revealedSegments 增时复位);`learner_paced && segmentAudioDone && 还有段` 时显眼显示"继续 ▶/继续";点击 `setRevealedSegments(n+1)` 并 `sendContinue({segment_index:n, signals})`(扩展 union;Phase 1 后端可忽略此动作,前端纯本地揭示)。Space/Enter 绑定(注意与现有 Space=暂停、聊天框 Enter 冲突)。
- 验收:仅在段音频播完且有后续内容时出现;点击恰好揭示下一段并续播;autoplay 不显示;键位在聊天输入时不误触。

**T1.6 非阻塞内联邀请检查** · `useBoardWebSocket.ts`(`case 'comprehension_check'`/`pendingCheck`)、`ComprehensionCheckpoint.tsx`(去模态壳 60–69)、`page.tsx`
- reducer 存 `pendingCheck`;渲染**内联可忽略卡片**(去 `role=dialog/aria-modal/useFocusTrap`),🟢🟡🔴 + 可选 MCQ;"继续 ▶"始终并存;答题→清除 + 提交(T1.7);不答直接继续→记 `skipped`。
- 验收:邀请卡片不阻塞输入/继续;可不答继续;答题或跳过都正常推进;无焦点陷阱/全屏遮罩。

**T1.7 答题提交:WS 消息 + Next 代理路由** · `useBoardWebSocket.ts`(`sendCheckpointResponse`)、新 `web/app/api/backend/board/checkpoint-response/route.ts`(仿 `…/[sessionId]/save/route.ts`)
- `sendCheckpointResponse({element_id,response,mcq_choice,...})` 走 WS(供 Phase 2 在流内反应)**且** fire-and-forget POST 到新代理 → 后端 `POST /board/checkpoint-response`(1551)写 `StudentPerformance`。
- 验收:提交后 `StudentPerformance(assessment_type='comprehension_check')` 落库,路由返回 `{success:true}`;字段匹配 `CheckpointResponseRequest`。

**T1.8 拉取帮助常驻** · `page.tsx`(页脚 606–637)、`ExplainDifferentlyButton.tsx`(onRequest 20)
- 挂 `<ExplainDifferentlyButton onRequest=...>`(Phase 1 复用 `sendUserMessage` 模板化:"把上一部分换成 ${styleHint} 讲法")+ 同级"为什么这步"按钮(对 `activeNarrationElementId` 发固定提问);`disabled={!canAskTeacher}`(258)。
- 验收:全程可见、不被节奏阻塞;选风格/问"为什么"都能得到 AI 回应。

**T1.9 端末重检索 + 恢复快照含段状态** · `server.py`(_send_events 8944–8964)、`useBoardWebSocket.ts`(buildSnapshot 730–745、RESTORE 374–410)
- 末尾 `summary_ready` 前发一次 1–2 题 recap `comprehension_check`(重检索集中在末尾)。前端快照/恢复纳入 `revealedSegments/segmentBreakAfter/pendingCheck`,避免刷新回到第 1 段。
- 验收:课末出现 recap 检查;刷新/重连保持已揭示进度;旧会话(无段信息)回退 autoplay 正常播放。

### Phase 2 — 后端边界暂停 + 真正应变(更高风险,建在 Phase 1 契约上)

**T2.1 生成器:边界 await + continue 队列** · `lesson_generator.py`(__init__ 91–105、近 `_wait_for_follow_up` 446–459)
- `__init__` 加 `continue_queue=asyncio.Queue()`、`pacing_mode=config.BOARD_PACING_MODE`、`segment_index`、`_adaptive{wrong_streak,skip_streak,repeat_q}`。加 `enqueue_continue(payload)`(仿 `enqueue_user_message` 104–116)、`async _wait_for_continue(messages)`(仿 follow-up):`await continue_queue.get()`,有答案则 append `[Learner response] ...`,更新 `_adaptive`。边界拦截处:`learner_paced` 则 `await self._wait_for_continue(messages)` 再续;`autoplay` 不 await。
- 验收:单测(假 LLM 调 end_segment):learner_paced 下挂起直到 `enqueue_continue`;autoplay 不挂起。

**T2.2 TTS 有界队列背压** · `tts_sync.py`(out_queue 165、_producer 185)
- `out_queue=asyncio.Queue(maxsize=8)`:消费者在边界暂停时,生产者 `await put` 自然背压,阻止 LLM 跑在音频前、并限内存。autoplay 可用更大 maxsize 或保持。
- 验收:learner_paced 下段 K 音频播完前不投递段 K+1 元素;队列内存有界;autoplay 仍连续。

**T2.3 WS `awaiting_continue` 状态 + continue/answer/help 动作** · `server.py`(receive loop 8997–9035、状态条件 8724/8773/9046–9048、边界处)
- 边界且 learner_paced:`paused=True`、`status='awaiting_continue'`、持久化(reuse `_persist_board_session_safe` + conversation_state)。入站加 `continue`(算 dwell/skip 写 `_adaptive`→`enqueue_continue`)、`answer`/`checkpoint_response`(更新 `_adaptive`,可注入 `[Learner answered]` user turn)、`why_this_step/explain_differently`(模板 user turn,`awaiting_continue` 期间也可用、不消耗 continue)。`finally` 排除 `awaiting_continue` 不置 completed。
- 验收:`{action:'continue'}` 推进一段;带 `text` 则下一段对答案反应;`awaiting_continue` 断连重连恢复在该段(不 finalize)。

**T2.4 应变 + 渐隐(把信号喂回 LLM + 改造 CheckpointGenerator)** · `checkpoint_generator.py`(should_insert_checkpoint 41–55)、`lesson_generator.py`(_wait_for_continue 后)、`server.py`(submit_checkpoint_response 1551 写 `_pending_signals`)
- `should_insert_checkpoint` 改吃 `AdaptiveSignals{last_answer_correct,recent_responses,repeated_questions,dwell_seconds,consecutive_skipped_checks,...}`:默认少、卡顿(red/yellow、重复提问≥2、长停留)多并加 worked-step、顺畅(连续 green、跳过≥2)渐隐。生成器据信号决定下个 `end_segment` 是否带 invite,并在续轮前注入 steering turn("学生卡住,放慢加一步" / "学生顺畅,放大段、别打断")。`submit_checkpoint_response` 写 `session['_pending_signals']`(普通 list,WS 循环 drain;**不**跨线程动 asyncio.Queue)。`_ALLOWED_CHECKPOINT_RESPONSES` 加 `skipped`(score=None,守 score_map KeyError)。
- 验收:模拟"答错"信号→出现 steering note 且 invite 频率上升;"顺畅"→抑制 invite(渐隐);`response='skipped'` 返回 200 不破坏 score_map。

**T2.5 时长感知 max_rounds + 自适应信号收集(前端)** · `lesson_generator.py`(253)、`page.tsx`/`useBoardWebSocket.ts`
- `max_rounds` 由 `duration_minutes` 推导或上调(每段多耗轮);确认 256KB conversation_state 快照不截断长课。前端在 `continue/checkpoint_response` payload 带 `dwell_ms/last_check/skipped_checks/questions_in_segment`(autoplay 不收集)。
- 验收:15 段 learner_paced 课不提前触发 max-rounds 警告;信号值合理、每段 dwell 复位。

---

## 4. 跨切面

**向后兼容**:所有改动加性。旧 `board_sessions` 行无段信息 → 仅在收到 `segment_boundary` 时门控,否则 autoplay 回退;`from_dict` 全 `.get(...)` 旧行照载;`segment_boundary` 加入 `should_checkpoint` 集;新前端 + 旧后端(不发边界)= autoplay,不会卡死。

**测试计划(对齐新规范 §0.5-C)**:
- **后端 `pytest`(repo root)**:`BoardPacingController`(core/board/pacing.py)、`end_segment`/段缓冲(T0.3)、await/queue(T2.1)、`AdaptiveSignals` 分支(T2.4)、`skipped` score_map;改的 .py 跑 `black <files> && flake8 <files>`。
- **前端(无单测套件,勿臆造)**:`pnpm lint` + `pnpm build` + `pnpm qa:board-local`(Playwright smoke,需起服务);纯逻辑(段分组)靠 qa smoke 验。
- **大小棘轮门槛(每个 PR 必过)**:`python scripts/check_file_size.py`;`pre-commit`(size 硬、black/flake8 advisory)。
- 集成:`/board-test`(本地)跑 learner_paced 与 autoplay;断连重连在 `awaiting_continue`;`BOARD_FAST_MODE` 下按 onPlaybackEnd 门控;audio_error 不卡死继续。
- 生产 QA:一节真实课验证节奏与音画同步,再灰度。

**风险与缓解(精选)**:
- 跨线程喂信号 → 用 `_pending_signals` 普通 list(非 asyncio.Queue 跨线程)。
- audio 乱序/失败 → `expected_audio_count` 在 `audio_ready` 和 `audio_error` 都递减。
- `awaiting_continue` 漏改某处状态条件 → 会误 finalize/挡恢复;集中清点 8724/8773/9046。
- 600s 会话 GC(`_delayed_session_cleanup` 6483)→ 久挂学习者靠 DB 复原(_adaptive 须持久化或接受丢失)。
- max_rounds=50 + 256KB 快照 → 长多段课需验证不截断。
- 移动端时间节流与段门控双重节奏 → learner_paced 下关节流。

**灰度/回滚**:`BOARD_PACING_MODE=autoplay`(env)一键回到今天行为;前端切换实时翻转;Phase 1 与 Phase 2 各自可独立回退。

---

## 5. 需产品/你拍板的少数参数(非工程)
1. 段大小默认 N=2–4、首段 2–3 — 接受?
2. 自适应阈值:卡顿触发(1 个 red 或 ≥2 提问?)、渐隐(连续 2 green/跳过?)、默认每 3 段才邀请 — 接受这套默认?
3. autoplay 是否也用有界队列(轻微自然限速)还是保持完全连续?
4. 端末"重检索"用独立 `recap_check` 还是 `segment_boundary{is_last_segment:true}` 带更重 invite?

> 工程量估计:Phase 0 ~0.5 天;Phase 1 ~1.5–2 天(前端为主,交付 UX+滞后修复);Phase 2 ~1.5–2 天(后端暂停+应变)。可分 PR 渐进上线,每阶段独立验证。
