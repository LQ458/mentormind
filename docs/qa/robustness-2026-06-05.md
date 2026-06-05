# Production Robustness QA - 2026-06-05

Base URL: `https://mentormind.cloud`

Deployed fix commit verified in production: `6a72d81`

## Fixtures Used

| Fixture | Path | Used | Notes |
| --- | --- | --- | --- |
| Text context | generated in run artifact directory | yes | H.W. Brands / business-history discussion context. |
| Image context | `/Users/LeoQin/Downloads/Screenshot 2026-06-01 at 16.10.11.png` | yes | Calculus screenshot with OCR/math explanation. |
| Long audio context | `/Users/LeoQin/Downloads/Masters of Enterprise - 01.mp3` | yes | ~8.2 MB, metadata read as about 36 minutes. |
| Short audio context |  |  | Not tested in this round. |
| PDF context |  |  | Not tested in this round. |

## Run Log

| Run ID | Purpose | Executed | Success | Success rate | Findings | Blank | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `prod-autopilot-2026-06-05T12-48-48-723Z-lvhyik` | Compact production baseline after summary fix | 23 | 23 | 100% | 0 | 2 | Image/audio fixture rows blank because no fixture env was supplied. |
| `prod-autopilot-2026-06-05T12-51-43-695Z-7389gy` | Full pre-fix robustness with image/audio/personas | 29 | 28 | 96.55% | 1 | 0 | Found real `/ask` long-audio hang/stuck upload. |
| `prod-autopilot-2026-06-05T13-04-50-362Z-8ibfqm` | Full post-deploy run, before harness correction | 29 | 29 | 100% | 1 | 0 | App behavior was fixed; finding was a harness false positive. |
| `prod-autopilot-2026-06-05T13-09-43-631Z-f2g6i2` | Targeted post-deploy run, before second harness correction | 25 | 25 | 100% | 1 | 0 | App behavior was fixed; finding was another harness false positive. |
| `prod-autopilot-2026-06-05T13-13-05-225Z-rxhvy1` | Targeted post-fix verification | 25 | 25 | 100% | 0 | 0 | Text/image upload passed; long audio became controlled rejection. |
| `prod-autopilot-2026-06-05T13-16-03-214Z-xzun4e` | Final full robustness verification | 29 | 29 | 100% | 0 | 0 | Main post-fix record. Includes all four learner baselines. |

Artifact root:

`web/.browser-sessions/prod-autopilot-qa/`

Each run has `report.json`, `report.md`, and screenshots in its run directory.

## Final Full Round Breakdown

Run: `prod-autopilot-2026-06-05T13-16-03-214Z-xzun4e`

| Area | Executed | Success | Success rate | Blank |
| --- | ---: | ---: | ---: | ---: |
| Page viewports | 12 | 12 | 100% | 0 |
| Quick question discussion text | 1 | 1 | 100% | 0 |
| Quick question upload forms | 3 | 3 | 100% | 0 |
| Study-plan personas | 4 | 4 | 100% | 0 |
| Study-plan routing | 1 | 1 | 100% | 0 |
| WebSocket smoke | 1 | 1 | 100% | 0 |
| Weird API payloads/routes | 3 | 3 | 100% | 0 |
| Upload edge API | 3 | 3 | 100% | 0 |
| Pressure | 1 | 1 | 100% | 0 |

Pressure summary:

| Requests | Concurrency | Failures | p50 | p95 | p99 | Max |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 40 | 6 | 0 | 853 ms | 1976 ms | 2489 ms | 2489 ms |

## Upload Form Results

| Run | Text upload | Image upload | Long audio upload | Short audio upload | PDF upload |
| --- | --- | --- | --- | --- | --- |
| `12-48-48-lvhyik` | passed, 11.39s |  |  |  |  |
| `12-51-43-7389gy` | passed, 10.38s | passed, 22.65s | failed, 188.51s stuck on reading context |  |  |
| `13-13-05-rxhvy1` | passed, 10.51s | passed, 14.46s | controlled rejection, 9.07s |  |  |
| `13-16-03-xzun4e` | passed, 12.67s | passed, 15.64s | controlled rejection, 8.47s |  |  |

Controlled rejection text observed after the fix:

`Upload failed: this audio is too long for quick questions. Trim it to about 10 minutes or paste the key transcript into context. Reason: Audio duration is about 36 minutes, above the quick-question limit.`

## Study-Plan Baselines

Final full run: `prod-autopilot-2026-06-05T13-16-03-214Z-xzun4e`

| Baseline persona | Latency | Reached review plan | Persona adapted | Schedule preserved | Fallback used |
| --- | ---: | --- | --- | --- | --- |
| Extra-smart ambitious learner | 22.39s | yes | yes | yes | no |
| Smart steady learner | 21.38s | yes | yes | yes | no |
| Medium learner needing structure | 22.31s | yes | yes | yes | no |
| Slow/unmotivated learner | 21.47s | yes | yes | yes | no |

## Bugs Found and Status

| Bug | Evidence run | Status | Fix |
| --- | --- | --- | --- |
| `/ask` long audio upload could remain stuck on `Reading uploaded context...` for at least 188.51s with no user-facing controlled error. | `prod-autopilot-2026-06-05T12-51-43-695Z-7389gy` | fixed | Added `/ask` quick-question audio guard: max 25 MB and max 12 minutes. Long audio now rejects before backend transcription with a specific message. |
| QA summary undercounted page-view success for the intentionally minimal homepage. | earlier compact harness run, before `12-48-48-lvhyik` | fixed | Adjusted page success scoring so homepage is judged on load/overflow/server errors, while product pages still require body content. |
| QA harness reported controlled long-audio rejection as an answer/content bug. | `13-04-50-362Z-8ibfqm`, `13-09-43-631Z-f2g6i2` | fixed | `controlled_rejection` is now counted as success for long audio fixtures and does not trigger answer/content findings. |

## Not Covered in This Round

| Case | Result |
| --- | --- |
| Short valid audio upload that should transcribe and answer | Covered in the Online Fixture Deep Round below. |
| PDF upload through `/ask` UI | Covered in the Online Fixture Deep Round below. |
| Seminar full room flow with real audio turn and AI facilitator response | Covered in the Online Fixture Deep Round below. |
| Board lesson full ask-AI workflow | Covered in the Online Fixture Deep Round below. |
| Load higher than 40 requests / concurrency 6 | Covered in the Online Fixture Deep Round below. |
| Browser visual manual review beyond automated screenshots/overflow checks | Covered in the Online Fixture Deep Round below, with latest visual-only rerun marked inconclusive. |

## Online Fixture Deep Round

Base URL: `https://mentormind.cloud`

Production product commits deployed during this round:

- `9610804` — explicit board empty-stream failure, board input gating, stricter board QA startup checks.
- `7da3646` — preserve AI plain-text board follow-up replies as board text elements and de-dupe optimistic/server user-message echoes.

### Online Fixtures

| Type | Local fixture | Source | Status |
| --- | --- | --- | --- |
| PDF | `web/.browser-sessions/online-fixtures/2026-06-05-deep/w3c-dummy.pdf` | W3C dummy PDF | tested |
| PDF | `web/.browser-sessions/online-fixtures/2026-06-05-deep/orimi-pdf-test.pdf` | orimi.com PDF test file | tested |
| Text | `web/.browser-sessions/online-fixtures/2026-06-05-deep/gutenberg-pride-and-prejudice.txt` | Project Gutenberg text | tested |
| Text | `web/.browser-sessions/online-fixtures/2026-06-05-deep/rfc9110-http-semantics.txt` | RFC Editor RFC 9110 text | tested |
| Audio | `web/.browser-sessions/online-fixtures/2026-06-05-deep/deepspeech-ldc93s1.wav` | Mozilla DeepSpeech LDC93S1 WAV fixture | tested |
| Audio | `web/.browser-sessions/online-fixtures/2026-06-05-deep/whisper-jfk.flac` | OpenAI Whisper JFK FLAC fixture | tested |

### Split Run Log

| Run ID | Scope | Executed | Success | Success rate | Findings | Blank | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `prod-autopilot-2026-06-05T17-24-47-991Z-7sajiv` | Oversized combined run |  |  |  |  |  | Killed before `report.json`; screenshots exist through text upload only. Not counted. |
| `prod-autopilot-2026-06-05T17-30-32-250Z-v05033` | Text/PDF uploads + 48x/6 pressure | 26 | 26 | 100% | 0 | 1 | Two text fixtures and two PDF fixtures passed. Audio category intentionally blank in this split. |
| `prod-autopilot-2026-06-05T17-36-03-771Z-hw59wl` | Short audio uploads | 25 | 25 | 100% | 0 | 1 | Two short online audio fixtures passed transcription + answer. Image category intentionally blank in this split. |
| `prod-autopilot-2026-06-05T17-41-17-142Z-0mcj5k` | Deep workflows before follow-up fix | 25 | 24 | 96% | 1 | 0 | Seminar and visual review passed; stricter board ask-AI failed because no assistant response was persisted after the question. |
| `prod-autopilot-2026-06-05T17-52-49-523Z-5mopyj` | Deep workflows after follow-up fix | 17 | 17 | 100% | 1 | 0 | Seminar passed. Board passed with 7 elements, 8 chat entries, and `assistant_after_question = true`. The later visual step crashed with `net::ERR_CONNECTION_CLOSED`, so this run still has a harness finding. |
| `prod-autopilot-2026-06-05T18-00-31-534Z-wszs8f` | Visual-only rerun attempt | 4 | 4 | 100% | 9 | 0 | Inconclusive: run was manually killed after repeated routing/network hangs before visual review completed. Not counted as a visual pass. |

### Required Case Coverage

| Case | Best evidence run | Result |
| --- | --- | --- |
| Short valid audio upload that should transcribe and answer | `prod-autopilot-2026-06-05T17-36-03-771Z-hw59wl` | Passed: 2/2 short audio fixtures. |
| PDF upload through `/ask` UI | `prod-autopilot-2026-06-05T17-30-32-250Z-v05033` | Passed: 2/2 PDF fixtures. |
| Seminar full room flow with real audio turn and AI facilitator response | `prod-autopilot-2026-06-05T17-52-49-523Z-5mopyj` | Passed. |
| Board lesson full ask-AI workflow | `prod-autopilot-2026-06-05T17-52-49-523Z-5mopyj` | Passed after `7da3646`; stricter check requires assistant response after the user question. |
| Load higher than 40 requests / concurrency 6 | `prod-autopilot-2026-06-05T17-30-32-250Z-v05033` | Passed: 48 requests, concurrency 6, 0 failures, p50 1081 ms, p95 2902 ms, p99/max 5501 ms. |
| Browser visual manual review beyond automated screenshots/overflow checks | `prod-autopilot-2026-06-05T17-41-17-142Z-0mcj5k` | Passed in this run with screenshots. Latest visual-only rerun was inconclusive due routing/network hang and is not counted as a pass. |

### Bugs Found and Fixed in Online Fixture Round

| Bug | Evidence | Status | Fix |
| --- | --- | --- | --- |
| Board lesson could finish as `completed` with zero board elements, hiding model/tool failure. | Earlier production run `prod-autopilot-2026-06-05T17-04-14-555Z-5jdq3o` | fixed | Backend now emits/persists an explicit `error` if no `board_created` or `element_added` event is produced. |
| Board chat allowed asking before the board existed, creating confusing early-message states. | Board startup screenshots and state polls | fixed | Board input is disabled until a board or element exists. |
| Board ask-AI could accept/persist a question but lose a plain-text AI follow-up because only board tool calls were rendered. | `prod-autopilot-2026-06-05T17-41-17-142Z-0mcj5k` | fixed | AI plain-text replies are converted to board `text_block` elements once a board exists. |
| Board chat could show duplicate student messages from optimistic local send + server echo. | `board-lesson-ask-ai.png` from `prod-autopilot-2026-06-05T17-41-17-142Z-0mcj5k` | fixed | Client reducer now suppresses near-time identical user-message echoes. |
| Production QA visual review could crash the whole report on one navigation error. | `net::ERR_CONNECTION_CLOSED` during `prod-autopilot-2026-06-05T17-52-49-523Z-5mopyj` | fixed in harness | Visual review now records per-target errors as findings instead of aborting the full report. |

### Still Open / Watch

| Issue | Evidence | Status |
| --- | --- | --- |
| Visual-only rerun was inconclusive after repeated route load failures/hangs and manual kill. | `prod-autopilot-2026-06-05T18-00-31-534Z-wszs8f` | open watch item; curl checks immediately after showed `/ask` redirect and `/api/backend/status` healthy. |
| FunASR is offline in production status, while Whisper is online. | `/api/backend/status` after the runs | acceptable for current tests because audio transcription passed through Whisper; relevant if low-latency seminar speech is required. |
