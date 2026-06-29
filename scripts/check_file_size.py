#!/usr/bin/env python3
"""字数规范 — source-file size ratchet for MentorMind.

MentorMind already has large legacy files (e.g. backend/server.py is ~9k lines),
so a flat line cap would fail the whole repo. Instead this is a *ratchet*:

  - New source files must stay under CAP lines.
  - Files already over CAP are recorded in a baseline and may stay at or below
    their recorded size — but they may never GROW. Split, don't sprawl.
  - The baseline only shrinks: when a baselined file drops, run --update to
    re-record the smaller number, locking in the win.

Run from the repo root:
    python scripts/check_file_size.py            # enforce (exit 1 on a violation)
    python scripts/check_file_size.py --update   # re-record the baseline

Wire it into pre-commit / CI to block regressions without touching legacy debt.
See docs/standards.md for the full standard.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE_PATH = os.path.join(REPO_ROOT, "scripts", "file_size_baseline.json")

# Per-file soft cap (non-comment, non-blank lines). New files must stay under it.
CAP = 600

# Where source lives and which extensions count.
SCAN_ROOTS = {
    "backend": (".py",),
    "web": (".ts", ".tsx"),
}

# Path fragments that are never enforced (vendored, generated, tests, migrations).
EXCLUDE_FRAGMENTS = (
    "/node_modules/",
    "/.next/",
    "/venv/",
    "/.venv/",
    "/site-packages/",
    "/__pycache__/",
    "/.git/",
    "/migrations/",
    "/tests/",
    "/test/",
)
EXCLUDE_SUFFIXES = (".d.ts",)


def is_excluded(rel_path: str) -> bool:
    norm = "/" + rel_path.replace(os.sep, "/")
    if any(frag in norm for frag in EXCLUDE_FRAGMENTS):
        return True
    base = os.path.basename(rel_path)
    if base.startswith("test_") or "_test." in base or ".test." in base:
        return True
    if rel_path.endswith(EXCLUDE_SUFFIXES):
        return True
    return False


def code_lines(path: str) -> int:
    """Count non-blank, non-pure-comment lines."""
    count = 0
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            for raw in fh:
                line = raw.strip()
                if not line:
                    continue
                if line.startswith("#") or line.startswith("//"):
                    continue
                count += 1
    except OSError:
        return 0
    return count


def scan() -> dict[str, int]:
    sizes: dict[str, int] = {}
    for root, exts in SCAN_ROOTS.items():
        abs_root = os.path.join(REPO_ROOT, root)
        for dirpath, _dirs, files in os.walk(abs_root):
            for name in files:
                if not name.endswith(exts):
                    continue
                abs_path = os.path.join(dirpath, name)
                rel_path = os.path.relpath(abs_path, REPO_ROOT)
                if is_excluded(rel_path):
                    continue
                sizes[rel_path.replace(os.sep, "/")] = code_lines(abs_path)
    return sizes


def load_baseline() -> dict[str, int]:
    if not os.path.exists(BASELINE_PATH):
        return {}
    with open(BASELINE_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def write_baseline(baseline: dict[str, int]) -> None:
    ordered = dict(sorted(baseline.items(), key=lambda kv: (-kv[1], kv[0])))
    with open(BASELINE_PATH, "w", encoding="utf-8") as fh:
        json.dump(ordered, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def update(sizes: dict[str, int], prior: dict[str, int]) -> int:
    # Record every file currently over CAP. Shrink-only: never raise a number
    # that was already recorded lower, so paid-down debt stays paid down.
    new_baseline: dict[str, int] = {}
    for path, loc in sizes.items():
        if loc <= CAP:
            continue
        if path in prior:
            new_baseline[path] = min(prior[path], loc)
        else:
            new_baseline[path] = loc
    write_baseline(new_baseline)
    print(f"Baseline updated: {len(new_baseline)} files over {CAP} lines recorded.")
    return 0


def enforce(sizes: dict[str, int], baseline: dict[str, int]) -> int:
    violations: list[str] = []
    for path, loc in sorted(sizes.items()):
        limit = max(CAP, baseline.get(path, 0))
        if loc > limit:
            if path in baseline:
                violations.append(
                    f"  {path}: {loc} lines (grew past baseline {baseline[path]})"
                )
            else:
                violations.append(f"  {path}: {loc} lines (new file over cap {CAP})")
    if violations:
        print(
            "字数规范 violation — files must not grow past baseline or exceed the cap:"
        )
        print("\n".join(violations))
        print(
            "\nFix: split the file into focused modules, or — if a baselined file "
            "legitimately shrank — run `python scripts/check_file_size.py --update`."
        )
        return 1
    print(f"字数规范 OK — {len(sizes)} source files within cap/baseline.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update",
        action="store_true",
        help="Re-record the baseline from current file sizes (shrink-only).",
    )
    args = parser.parse_args()
    sizes = scan()
    prior = load_baseline()
    if args.update:
        return update(sizes, prior)
    return enforce(sizes, prior)


if __name__ == "__main__":
    sys.exit(main())
