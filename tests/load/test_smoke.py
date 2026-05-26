"""Smoke test: 5 concurrent users hitting critical endpoints.

Requires a running backend with ``TEST_BYPASS_SECRET`` set.
"""

import concurrent.futures
import time
import pytest
import requests


@pytest.mark.slow
class TestLoadSmoke:
    CONCURRENT_USERS = 5

    def test_concurrent_health(self, backend_url):
        """5 concurrent users hitting /health.  All should return 200."""

        def health():
            try:
                r = requests.get(f"{backend_url}/health", timeout=10)
                return r.status_code, r.elapsed.total_seconds()
            except Exception:
                return 0, 0

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.CONCURRENT_USERS) as ex:
            futures = [ex.submit(health) for _ in range(self.CONCURRENT_USERS)]
            results = [f.result() for f in futures]

        statuses = [s for s, _ in results]
        latencies = [l for _, l in results if l > 0]
        assert all(s == 200 for s in statuses), f"Non-200 responses: {statuses}"
        assert len(latencies) == self.CONCURRENT_USERS
        print(f"Health check: {self.CONCURRENT_USERS} concurrent, avg latency {sum(latencies)/len(latencies)*1000:.0f}ms")

    def test_concurrent_lessons(self, backend_url, test_bypass_secret):
        """5 concurrent users listing lessons."""

        def list_lessons():
            try:
                r = requests.get(
                    f"{backend_url}/lessons?limit=10",
                    headers={"Authorization": f"Bearer {test_bypass_secret}"},
                    timeout=15,
                )
                return r.status_code, r.elapsed.total_seconds()
            except Exception:
                return 0, 0

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.CONCURRENT_USERS) as ex:
            futures = [ex.submit(list_lessons) for _ in range(self.CONCURRENT_USERS)]
            results = [f.result() for f in futures]

        statuses = [s for s, _ in results]
        latencies = [l for _, l in results if l > 0]
        assert all(s == 200 for s in statuses), f"Non-200 responses: {statuses}"
        p95 = sorted(latencies)[int(len(latencies) * 0.95)] if latencies else 0
        assert p95 < 10, f"P95 latency {p95*1000:.0f}ms exceeds 10s threshold"
        print(f"Lessons: {self.CONCURRENT_USERS} concurrent, P95 {p95*1000:.0f}ms")
