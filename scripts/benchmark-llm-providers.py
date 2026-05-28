#!/usr/bin/env python3
"""Benchmark configured LLM providers from the deployment host.

Run on the VPS after exporting the domestic API keys you want to compare:
  python scripts/benchmark-llm-providers.py --runs 5

This measures full non-streaming response latency from the server's network.
For user-perceived chat latency, also test streaming/TTFT separately.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import time
import urllib.error
import urllib.request


PROMPT = (
    "用中文，20字以内回答：AP Calculus BC 学习计划生成前，"
    "还需要确认哪一个信息？只给一个问题。"
)


def post_chat(base_url: str, api_key: str, model: str, timeout: int) -> tuple[bool, float, str]:
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": PROMPT}],
        "temperature": 0.2,
        "max_tokens": 80,
        "stream": False,
    }
    if "deepseek.com" in base_url:
        payload["thinking"] = {"type": "disabled"}
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            elapsed_ms = (time.perf_counter() - started) * 1000
            if response.status != 200:
                return False, elapsed_ms, f"HTTP {response.status}: {body[:180]}"
            return True, elapsed_ms, "ok"
    except urllib.error.HTTPError as exc:
        elapsed_ms = (time.perf_counter() - started) * 1000
        body = exc.read().decode("utf-8", errors="replace")
        return False, elapsed_ms, f"HTTP {exc.code}: {body[:180]}"
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - started) * 1000
        return False, elapsed_ms, str(exc)


def configured_providers() -> list[tuple[str, str, str, str]]:
    providers: list[tuple[str, str, str, str]] = []
    if os.getenv("DEEPSEEK_API_KEY"):
        providers.extend(
            [
                (
                    "deepseek-v4-flash",
                    os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
                    os.environ["DEEPSEEK_API_KEY"],
                    os.getenv("BENCH_DEEPSEEK_FLASH_MODEL", "deepseek-v4-flash"),
                ),
                (
                    "deepseek-v4-pro",
                    os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
                    os.environ["DEEPSEEK_API_KEY"],
                    os.getenv("BENCH_DEEPSEEK_PRO_MODEL", "deepseek-v4-pro"),
                ),
            ]
        )
    return providers


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0
    values = sorted(values)
    index = min(len(values) - 1, round((len(values) - 1) * pct))
    return values[index]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--timeout", type=int, default=45)
    args = parser.parse_args()

    providers = configured_providers()
    if not providers:
        print("No API keys found. Set DEEPSEEK_API_KEY.")
        return 2

    print(f"Running {args.runs} calls per provider from this host...\n")
    for name, base_url, key, model in providers:
        times: list[float] = []
        errors: list[str] = []
        for _ in range(args.runs):
            ok, elapsed_ms, detail = post_chat(base_url, key, model, args.timeout)
            if ok:
                times.append(elapsed_ms)
            else:
                errors.append(detail)
        if times:
            print(
                f"{name:22} model={model:28} ok={len(times)}/{args.runs} "
                f"p50={statistics.median(times):.0f}ms p95={percentile(times, 0.95):.0f}ms "
                f"min={min(times):.0f}ms max={max(times):.0f}ms"
            )
        else:
            print(f"{name:22} model={model:28} ok=0/{args.runs}")
        if errors:
            print(f"  errors: {errors[:2]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
