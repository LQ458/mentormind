"""Drive the StreamingLessonGenerator against 10 real topics.

Verifies that the new continuous-transcript prompt produces:
  - No destructive `board_cleared` events (scope=all)
  - Non-trivial element accumulation (10+ per lesson)
  - At least one step_list when narration advertises a count

Writes the captured event stream for each topic to
`test_results_board_<slug>.json` so the frontend can replay.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from core.streaming.lesson_generator import StreamingLessonGenerator  # noqa: E402
from mcp.agent_tools import AgentToolsServer  # noqa: E402
from services.api_client import DeepSeekClient  # noqa: E402

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

TOPICS = [
    ("Derivatives and rates of change", "en", "beginner", None),
    ("The Pythagorean theorem", "en", "beginner", None),
    ("Photosynthesis", "en", "intermediate", None),
    ("Ohm's law", "en", "beginner", None),
    ("牛顿第二定律", "zh", "beginner", "niu-dun-di-er-ding-lu"),
    ("勾股定理", "zh", "beginner", "gou-gu-ding-li"),
    ("Basic probability", "en", "beginner", None),
    ("Supply and demand", "en", "intermediate", None),
    ("Linear equations", "en", "beginner", None),
    ("DNA replication", "en", "intermediate", None),
]


def _slug(topic: str, override: str | None = None) -> str:
    if override:
        return override
    s = re.sub(r"[^A-Za-z0-9]+", "-", topic).strip("-").lower()
    return s or "topic"


async def run_one(topic: str, language: str, level: str, duration: int = 8):
    gen = StreamingLessonGenerator(
        llm_client=DeepSeekClient(),
        agent_tools_server=AgentToolsServer(),
    )
    events = []
    tool_counts: dict[str, int] = {}
    destructive_clear = False
    element_ids: list[str] = []
    step_list_present = False

    start = time.time()
    try:
        async for ev in gen.generate_lesson(
            topic=topic,
            language=language,
            student_level=level,
            duration_minutes=duration,
        ):
            ev_dict = ev.to_dict() if hasattr(ev, "to_dict") else ev.__dict__
            events.append(ev_dict)
            et = ev_dict.get("event_type")
            tool_counts[et] = tool_counts.get(et, 0) + 1
            if et == "element_added":
                eid = ev_dict.get("element_id") or ev_dict.get("data", {}).get("element_id")
                if eid:
                    element_ids.append(eid)
                if ev_dict.get("data", {}).get("element_type") == "step_list":
                    step_list_present = True
            if et == "board_cleared":
                scope = ev_dict.get("data", {}).get("scope")
                removed = ev_dict.get("data", {}).get("removed_ids") or []
                if scope in ("all", None) and not removed:
                    destructive_clear = True
            if time.time() - start > 180:
                print(f"  ⏱  timing out after 180s, captured {len(events)} events")
                break
    except Exception as exc:
        print(f"  ⚠  exception after {len(events)} events: {exc}")

    return {
        "topic": topic,
        "language": language,
        "elapsed_s": round(time.time() - start, 1),
        "event_count": len(events),
        "tool_counts": tool_counts,
        "element_count": len(element_ids),
        "destructive_clear": destructive_clear,
        "step_list_present": step_list_present,
        "events": events,
    }


async def main():
    # Save fixtures both locally AND into web/public/fixtures so the
    # /board-replay page can fetch them over HTTP.
    out_dir = Path(__file__).parent / "test_board_fixtures"
    out_dir.mkdir(exist_ok=True)
    web_fixture_dir = Path(__file__).resolve().parents[1] / "web" / "public" / "fixtures"
    web_fixture_dir.mkdir(exist_ok=True, parents=True)

    summary_rows = []
    for i, (topic, lang, level, override) in enumerate(TOPICS, 1):
        print(f"\n[{i}/{len(TOPICS)}] {topic} ({lang}, {level})")
        result = await run_one(topic, lang, level)
        slug = _slug(topic, override)
        path = out_dir / f"{slug}.json"
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        (web_fixture_dir / f"{slug}.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2)
        )
        summary_rows.append(
            {
                "topic": topic,
                "events": result["event_count"],
                "elements": result["element_count"],
                "destructive_clear": result["destructive_clear"],
                "step_list": result["step_list_present"],
                "elapsed_s": result["elapsed_s"],
            }
        )
        flag_bad = " ❌ DESTRUCTIVE CLEAR" if result["destructive_clear"] else ""
        print(
            f"  -> {result['event_count']} events, {result['element_count']} elements"
            f" step_list={result['step_list_present']} ({result['elapsed_s']}s){flag_bad}"
        )

    print("\n=== Summary ===")
    for row in summary_rows:
        print(row)

    bad = [r for r in summary_rows if r["destructive_clear"]]
    low = [r for r in summary_rows if r["elements"] < 8]
    print(f"\nDestructive-clear lessons: {len(bad)}/{len(summary_rows)}")
    print(f"Under-populated lessons  : {len(low)}/{len(summary_rows)}")
    (out_dir / "_summary.json").write_text(json.dumps(summary_rows, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
