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
| Short valid audio upload that should transcribe and answer |  |
| PDF upload through `/ask` UI |  |
| Seminar full room flow with real audio turn and AI facilitator response |  |
| Board lesson full ask-AI workflow |  |
| Load higher than 40 requests / concurrency 6 |  |
| Browser visual manual review beyond automated screenshots/overflow checks |  |

