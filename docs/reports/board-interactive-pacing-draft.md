# 草案 v2(供审):白板课"学习者自控节奏 + 自适应互动"

状态:**提案,未部署**。这版用研究证据**取代了 v1 的"每 3–5 元素强制停下等作答"**——因为强制硬停会让学习者反感。

> 你的判断对:**强行硬性的停止只会让观众讨厌。** 下面的设计据此重做。

---

## 一、证据(Exa 检索的最佳实践)

| 发现 | 含义 | 来源 |
|---|---|---|
| 强制/不合时机的提问会打断心流、惹恼学习者;"following well 时被强制作答 → 负面体验";深度理解题让人 irritated;**reflective/experience-centered 提示更不打断、更受欢迎** | 不要强制作答;少用"考你"式问题,多用"反思/体验"式 | CHI 2018, in-video prompting (Shin, Ko, Kim, Williams) |
| 高频提问 **并不更好**:每 2 分钟一问 vs 仅末尾一问,在投入/自我调节/成绩上无显著差异 | 少而精 > 多而强制;别滥发问题 | Nawaz & R.S. Baker, "Question Dosage in MOOCs" (ASCILITE 2023) |
| **学习者自控分段**是真正的高效机制(continue 按钮自定步),效应量 d≈0.98;对复杂/快节奏/新手最有效 | 主机制应是"分段 + 学习者自己点继续",而非 AI 强制问答 | Mayer《Multimedia Learning》分段原则;Segmenting meta-analysis (2019) |
| 给学习者控制节奏有益(交互性原则 d≈0.97),但会增加认知/元认知负担,需配套支持 | 给控制权,但要轻引导、别让其自己背所有决策 | Mayer 交互性原则 / Learner Control Principle |
| 最佳辅导是**应变式(contingent)+ 渐隐(fading)+ 学习者拉取帮助**:按时机/ZPD 决定何时介入,随能力下降提供更多支持、随能力上升 fade;**把求助权交给学习者**;"初频后渐隐"有效,单纯加频无效 | 互动频率应自适应:卡住时多帮、顺畅时退后;随时可"我没懂/换个说法" | Rimac (AIED'18/'19)、QUADRATIC、MetaTutor (HAL) |
| 检查应**低风险/无评分、给即时反馈、可选、可课后/间隔做**;in-lecture quiz 确实提升学习 | 互动本身有效——关键是"非强制、低压力、有反馈";重的检索放课末/间隔 | retrievalpractice.org;Nature Comm. Psych 2025 (IRP);UWEX |

**一句话:** 互动有价值,但**有效的是"学习者自控的分段 + 低压力、可跳过、应变式的邀请",不是 AI 每隔几屏强制叫停**。

---

## 二、设计原则(v2,取代 v1 硬停)

1. **分段,不审讯。** 主机制是把课切成"一个完整想法"的小段,每段讲完**停在段界、由学习者点"继续"**(或语音说继续)自定步——这拿到分段/处理的全部好处,且节奏由学习者掌握。同时顺带解决"音频比板面慢 6–12 分钟"(每段音频讲完才进下一段)。
2. **检查是邀请,不是路障。** 段界可以**邀请**学习者做一个小动作(预测/选择/复述/做一步),但**"继续"永远可点、可跳过**——绝不阻塞等待。跟着懂的人能直接继续。
3. **自适应频率 + 渐隐。** 不是固定"每 N 屏一问"。默认**少问**;出现卡顿信号(上一题答错、反复提问、长时间停顿)时**多给检查/帮助**,顺畅时**fade**、几乎不打断。
4. **求助权交给学习者。** 全程常驻"我没懂 / 换个说法 / 为什么这步 / 提问"(白板已有 `ExplainDifferentlyButton` 可复用)——学习者拉取,AI 决定帮助深度。
5. **低压力 + 反馈。** 检查无评分、即时给反馈、措辞是"一起想想"而非"考你";单次 ≤1 个问题。**重的检索/小测放课末或下次复习**,不塞在心流中。
6. **新手多分段、老手少打断。** 分段/检查对复杂材料+新手收益最大;对高水平学习者减少分段与提问(交互性/学习者控制原则的边界条件)。

---

## 三、提示词改动(board_lesson.md,v2)

### 改动 1 — 角色:interactive tutor,但以学习者节奏为主
> "You are an interactive tutor. You teach in **short, self-contained segments** and let the **learner control the pace**. You invite the learner to think, but you never trap them — if they're following, they can continue immediately. You give *more* help when they struggle and *fade* into the background when they're cruising."

### 改动 2 — 新章节 "## Pacing & Interaction(核心)"
```
## Pacing & Interaction (most important — replaces any "stop every N elements" rule)

1. Teach in short segments, each covering ONE complete idea (typically 2-4 elements).
   End each segment at a natural boundary so the learner advances when ready
   (learner-paced segmenting — this is the primary mechanism, not quizzing).
2. At a segment boundary you MAY add ONE short, low-stakes invitation to act
   (predict / choose / restate / do one step). It is an INVITATION, not a gate:
   the learner can answer OR continue. Never block the lesson waiting for an answer.
3. Do NOT interrogate. Prefer light reflective/predictive prompts over "quiz me"
   comprehension grilling. At most ~1 invitation per segment, and often none —
   fewer, well-placed checks beat many forced ones.
4. Be adaptive (contingent + fading):
   - If the learner answered the last check wrong, asked again, or seems stuck:
     slow down, add a worked step, and check more often.
   - If the learner is answering well / saying "got it" / skipping checks:
     fade the checks, take bigger segments, get out of the way.
5. When the learner DOES respond, react to what they actually said first
   (confirm / gently correct / build on it) in 1-2 sentences, then continue.
6. Keep interactions low-stakes (no scores, immediate feedback, framed as
   "let's think", not "test"). Save any heavier recall check for the end recap.
```

### 改动 3 — 收尾:课末一次轻量回顾检查
> "End with a brief, optional recap check (1-2 retrieval prompts) rather than scattering heavy questions mid-lesson."

### 改动 4 — 删除 v1 里"每 3–5 元素必须停下等作答、end your turn"等强制措辞;"Style Guidelines" 的 "Lead with questions" 改为:"Invite thinking at segment boundaries, but keep the learner in control of pace; don't force responses."

---

## 四、配套代码改动(把"自控节奏"做出来,而非"强制暂停")

1. **学习者自控分段**(`core/streaming/lesson_generator.py` + 板 WS + `BoardCanvas`):
   按"段"流式输出,每段音频讲完后**停在段界并显示"继续 ▶"**(及可选的邀请式检查);学习者点继续/作答才进下一段。这天然修复"音频比板面慢"且符合分段原则。**autoplay 模式**(连续播放)作为可选开关给想躺着看的人。
2. **非阻塞检查**:邀请式检查用现有 `comprehension_check` / 元素 `metadata.invite_response=true`;学习者**可答可跳**;答了就走 `POST /board/checkpoint-response` 喂回下一段,跳过就直接继续。**绝不**因为没答而卡住。
3. **自适应信号**:用"上一题对错 / 重复提问 / 段内停留时长 / 是否连续跳过检查"驱动"多帮 or fade";`checkpoint_generator.py` 从"固定启发式插入"改成"按这些信号决定是否邀请"。
4. **学习者拉取帮助**常驻:复用 `ExplainDifferentlyButton` + "为什么这步/提问"。
5. 开关:`BOARD_PACING_MODE = learner_paced | autoplay`(默认 learner_paced;可一键回退连续播放)。

工程量:提示词 XS;分段 + 自控继续 + 非阻塞检查 + 自适应信号 S–M(约 1–1.5 天),可在 `/board-test` + 一节真实课验证。

---

## 五、与 v1 的关键区别(直接回应"硬停惹人烦")

| | v1(已否决) | v2(本稿) |
|---|---|---|
| 暂停由谁控制 | **AI 每 3–5 屏强制停、等作答** | **学习者点"继续"自定步** |
| 检查 | 必答、阻塞 | 邀请、可跳、低压力 |
| 频率 | 固定高频 | 自适应 + 渐隐(默认少) |
| 求助 | — | 学习者随时拉取 |
| 重检索 | 塞在中途 | 放课末/间隔 |

---

### 需要你拍的点
1. 默认走 **learner_paced(学习者点继续)**,autoplay 作为可选?(建议是)
2. 检查频率默认"少而精 + 卡顿时才多",可接受?
3. 接受配套分段/自控代码改动(约 1–1.5 天),还是先只上提示词(让 AI 少强制、多邀请,但暂不做真正分段暂停)?
