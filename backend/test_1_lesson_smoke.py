"""Smoke: run ONE lesson, assert no destructive clears, print summary."""
from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from test_10_real_lessons import run_one


async def main():
    r = await run_one("Derivatives and rates of change", "en", "beginner", duration=6)
    print(f"events={r['event_count']} elements={r['element_count']} "
          f"destructive_clear={r['destructive_clear']} "
          f"step_list={r['step_list_present']} elapsed={r['elapsed_s']}s")
    print("tool_counts:", r['tool_counts'])
    # First 3 element types
    elems = [e for e in r['events'] if e.get('event_type') == 'element_added']
    print("first 5 element types:", [e['data'].get('element_type') for e in elems[:5]])
    assert not r['destructive_clear'], "Destructive clear happened!"
    assert r['element_count'] >= 5, f"Too few elements: {r['element_count']}"
    print("SMOKE OK")


if __name__ == "__main__":
    asyncio.run(main())
