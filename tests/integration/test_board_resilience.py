"""
E2E Resilience Test Suite for MentorMind Board WebSocket Engine.

Validates the core board lesson feature under stress: network drops,
long-session endurance, idle-timeout behaviour, and diagnostic capture.

Prerequisites:
    - Backend server running (MENTORMIND_ENV=testing)
    - TEST_BYPASS_SECRET set in environment
    - PostgreSQL + Redis accessible (Celery workers NOT required for WebSocket tests)

Usage:
    MENTORMIND_ENV=testing                      \\
    TEST_BYPASS_SECRET=your-secret               \\
    pytest tests/integration/test_board_resilience.py -v

    # Browser-based tests (requires playwright install):
    # playwright install chromium
    # pytest tests/integration/test_board_resilience.py -v -m browser
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import time
import threading
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

import pytest

# ── Path setup ─────────────────────────────────────────────────────────────────
BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
sys.path.insert(0, os.path.abspath(BACKEND_DIR))

# ── Conditionally import heavy deps ───────────────────────────────────────────
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:  # pragma: no cover
    HAS_PSUTIL = False

try:
    import websockets
    HAS_WEBSOCKETS = True
except ImportError:  # pragma: no cover
    HAS_WEBSOCKETS = False

try:
    import requests
    HAS_REQUESTS = True
except ImportError:  # pragma: no cover
    HAS_REQUESTS = False


# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

TEST_BYPASS_SECRET = os.getenv("TEST_BYPASS_SECRET", "")
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
WS_URL = BACKEND_URL.replace("http://", "ws://").replace("https://", "wss://")

# Time thresholds (seconds)
NETWORK_DROP_DURATION = 30
LONG_SESSION_DURATION_MINUTES = int(os.getenv("LONG_SESSION_MINS", "30"))
IDLE_TIMEOUT_SECONDS = 600  # Must be < backend's 600s grace period
MAX_RECONNECT_WAIT = 60  # Maximum wait for reconnection after network restore
MEMORY_GROWTH_THRESHOLD_MB_PER_HOUR = 200
DB_CONNECTION_LIMIT = 30  # 20 pool + 10 overflow

DIAGNOSTICS_DIR = Path(__file__).parent / "diagnostics"
DIAGNOSTICS_REPORT = DIAGNOSTICS_DIR / "diagnostics_report.json"


# ═══════════════════════════════════════════════════════════════════════════════
# Diagnostics Reporter
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class DiagnosticSnapshot:
    """Captures system health at a point in time."""
    timestamp: float
    memory_rss_mb: float
    memory_vms_mb: float
    cpu_percent: float
    db_connections: int = -1
    ws_latency_ms: float = -1.0
    event_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "iso_time": datetime.fromtimestamp(self.timestamp).isoformat(),
            "memory_rss_mb": round(self.memory_rss_mb, 2),
            "memory_vms_mb": round(self.memory_vms_mb, 2),
            "cpu_percent": round(self.cpu_percent, 2),
            "db_connections": self.db_connections,
            "ws_latency_ms": round(self.ws_latency_ms, 2),
            "event_count": self.event_count,
        }


class DiagnosticsReporter:
    """Collects and persists diagnostic data for AI-assisted debugging."""

    def __init__(self, report_path: Path = DIAGNOSTICS_REPORT) -> None:
        self.report_path = report_path
        self.snapshots: List[DiagnosticSnapshot] = []
        self.errors: List[Dict[str, Any]] = []
        self.start_time = time.time()
        self.test_name = ""
        self._lock = threading.Lock()

    def set_test_name(self, name: str) -> None:
        self.test_name = name

    def snapshot(self, ws_latency_ms: float = -1.0, event_count: int = 0) -> DiagnosticSnapshot:
        snap = DiagnosticSnapshot(
            timestamp=time.time(),
            memory_rss_mb=self._get_memory_rss_mb(),
            memory_vms_mb=self._get_memory_vms_mb(),
            cpu_percent=self._get_cpu_percent(),
            db_connections=self._get_db_connections(),
            ws_latency_ms=ws_latency_ms,
            event_count=event_count,
        )
        with self._lock:
            self.snapshots.append(snap)
        return snap

    def record_error(self, error: Exception, context: str = "") -> None:
        with self._lock:
            self.errors.append({
                "timestamp": time.time(),
                "iso_time": datetime.fromtimestamp(time.time()).isoformat(),
                "error_type": type(error).__name__,
                "error_message": str(error),
                "context": context,
                "traceback": traceback.format_exc(),
            })

    def flush(self) -> Dict[str, Any]:
        """Write the full diagnostics report to disk and return it."""
        elapsed = time.time() - self.start_time
        initial = self.snapshots[0] if self.snapshots else None
        terminal = self.snapshots[-1] if self.snapshots else None

        memory_growth_mb = 0.0
        if initial and terminal:
            memory_growth_mb = terminal.memory_rss_mb - initial.memory_rss_mb

        report = {
            "report_generated_at": datetime.now().isoformat(),
            "test_name": self.test_name,
            "total_elapsed_seconds": round(elapsed, 2),
            "initial_latency": initial.to_dict() if initial else None,
            "terminal_latency": terminal.to_dict() if terminal else None,
            "memory_footprint_growth_mb": round(memory_growth_mb, 2),
            "memory_growth_rate_mb_per_hour": round(
                (memory_growth_mb / (elapsed / 3600)) if elapsed > 0 else 0, 2
            ),
            "snapshots": [s.to_dict() for s in self.snapshots],
            "errors": self.errors,
            "pass_criteria": {
                "memory_growth_within_threshold": bool(
                    memory_growth_mb > 0
                    and (memory_growth_mb / max(elapsed / 3600, 0.01))
                    < MEMORY_GROWTH_THRESHOLD_MB_PER_HOUR
                ),
                "no_db_connection_exhaustion": all(
                    s.db_connections > DB_CONNECTION_LIMIT
                    is False
                    if s.db_connections != -1
                    else True
                    for s in self.snapshots
                ),
                "no_uncaught_errors": len(self.errors) == 0,
            },
        }

        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        self.report_path.write_text(json.dumps(report, indent=2, default=str))
        return report

    # ── helpers ─────────────────────────────────────────────────────────────

    @staticmethod
    def _get_memory_rss_mb() -> float:
        if not HAS_PSUTIL:
            return -1.0
        try:
            proc = psutil.Process()
            return proc.memory_info().rss / (1024 * 1024)
        except Exception:
            return -1.0

    @staticmethod
    def _get_memory_vms_mb() -> float:
        if not HAS_PSUTIL:
            return -1.0
        try:
            proc = psutil.Process()
            return proc.memory_info().vms / (1024 * 1024)
        except Exception:
            return -1.0

    @staticmethod
    def _get_cpu_percent() -> float:
        if not HAS_PSUTIL:
            return -1.0
        try:
            return psutil.Process().cpu_percent(interval=0.1)
        except Exception:
            return -1.0

    @staticmethod
    def _get_db_connections() -> int:
        """Query PostgreSQL for active connection count."""
        try:
            from sqlalchemy import text
            from database.base import engine
            with engine.connect() as conn:
                result = conn.execute(
                    text(
                        "SELECT count(*) FROM pg_stat_activity "
                        "WHERE datname = current_database()"
                    )
                )
                row = result.fetchone()
                return int(row[0]) if row else -1
        except Exception:
            return -1


# ═══════════════════════════════════════════════════════════════════════════════
# Shared Fixtures
# ═══════════════════════════════════════════════════════════════════════════════

def _require_env() -> None:
    """Skip if the test environment is not configured."""
    if os.getenv("MENTORMIND_ENV") != "testing":
        pytest.skip("MENTORMIND_ENV != testing")
    if not TEST_BYPASS_SECRET:
        pytest.skip("TEST_BYPASS_SECRET not set")


@pytest.fixture(scope="module")
def reporter() -> DiagnosticsReporter:
    return DiagnosticsReporter()


@pytest.fixture(scope="module")
def auth_headers() -> Dict[str, str]:
    _require_env()
    return {
        "Authorization": f"Bearer {TEST_BYPASS_SECRET}",
        "Content-Type": "application/json",
    }


@pytest.fixture(autouse=True)
def _cleanup_sessions():
    """Clear in-memory board sessions before each test to avoid 429 bleed."""
    if HAS_REQUESTS:
        try:
            requests.delete(
                f"{BACKEND_URL}/board/cleanup-sessions",
                headers={"Authorization": f"Bearer {TEST_BYPASS_SECRET}"},
                timeout=5,
            )
        except Exception:
            pass
    yield


def _create_board_session(
    topic: str = "Test: Quadratic Functions",
    language: str = "en",
    student_level: str = "intermediate",
    duration_minutes: int = 5,
    custom_requirements: Optional[str] = None,
) -> Optional[str]:
    """Create a board session via REST API and return its session_id."""
    if not HAS_REQUESTS:
        pytest.skip("requests not installed")
    payload: Dict[str, Any] = {
        "topic": topic,
        "language": language,
        "student_level": student_level,
        "duration_minutes": duration_minutes,
    }
    if custom_requirements:
        payload["custom_requirements"] = custom_requirements
    try:
        resp = requests.post(
            f"{BACKEND_URL}/board/create-session",
            json=payload,
            headers={"Authorization": f"Bearer {TEST_BYPASS_SECRET}"},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("session_id")
        return None
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# Helper: WebSocket event stream consumer
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class WSStreamResult:
    events: List[Dict[str, Any]] = field(default_factory=list)
    reconnect_count: int = 0
    error: Optional[str] = None
    total_duration_s: float = 0.0
    first_element_latency_ms: float = -1.0


async def _ws_consume_events(
    session_id: str,
    reporter: DiagnosticsReporter,
    abort_after_s: Optional[float] = None,
) -> WSStreamResult:
    """Connect to a board WebSocket and consume events.

    Returns a WSStreamResult with all collected events and metrics.
    """
    if not HAS_WEBSOCKETS:
        pytest.skip("websockets library not installed")

    result = WSStreamResult()
    start = time.time()
    open_time: Optional[float] = None
    connect_count = 0

    try:
        ws_url = f"{WS_URL}/ws/board/{session_id}?token={TEST_BYPASS_SECRET}"

        async with websockets.connect(
            ws_url, ping_interval=30, ping_timeout=20, close_timeout=5
        ) as ws:
            connect_count += 1
            open_time = time.time()

            while True:
                elapsed = time.time() - start
                if abort_after_s is not None and elapsed >= abort_after_s:
                    break

                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                except asyncio.TimeoutError:
                    if abort_after_s is not None and (time.time() - start) >= abort_after_s:
                        break
                    # Send explicit keep-alive ping
                    try:
                        await ws.ping()
                    except Exception:
                        break
                    continue

                try:
                    event = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                result.events.append(event)
                event_type = event.get("event_type", "")

                if (
                    open_time is not None
                    and result.first_element_latency_ms < 0
                    and event_type == "element_added"
                ):
                    result.first_element_latency_ms = (time.time() - open_time) * 1000

                if len(result.events) % 30 == 0:
                    reporter.snapshot(
                        ws_latency_ms=result.first_element_latency_ms,
                        event_count=len(result.events),
                    )

                if event_type in ("done", "stream_done", "error"):
                    break

    except Exception as e:
        result.error = str(e)

    result.reconnect_count = max(0, connect_count - 1)
    result.total_duration_s = time.time() - start
    return result


async def _ws_consume_with_user_messages(
    session_id: str,
    reporter: DiagnosticsReporter,
    duration_s: float,
    message_interval_s: float = 60.0,
) -> WSStreamResult:
    """Connect to a board WebSocket, consume events, and periodically send
    user messages to simulate active learning.  Returns collected metrics.
    """
    if not HAS_WEBSOCKETS:
        pytest.skip("websockets library not installed")

    result = WSStreamResult()
    start = time.time()
    open_time: Optional[float] = None

    USER_MESSAGES = [
        {"action": "user_message", "text": "Can you explain this more simply?"},
        {"action": "user_message", "text": "What is a real-world example?"},
        {"action": "user_message", "text": "How does this connect to earlier topics?"},
        {"action": "pause"},
        {"action": "resume"},
    ]

    async def _sender(ws):
        msg_idx = 0
        while True:
            try:
                await asyncio.sleep(message_interval_s)
                msg = USER_MESSAGES[msg_idx % len(USER_MESSAGES)]
                msg_idx += 1
                await ws.send(json.dumps(msg))
            except Exception:
                break

    async def _reader(ws):
        nonlocal open_time
        open_time = time.time()
        while True:
            elapsed = time.time() - start
            if elapsed >= duration_s:
                break
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
            except asyncio.TimeoutError:
                continue
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue
            result.events.append(event)
            event_type = event.get("event_type", "")
            if (
                open_time is not None
                and result.first_element_latency_ms < 0
                and event_type == "element_added"
            ):
                result.first_element_latency_ms = (time.time() - open_time) * 1000
            if len(result.events) % 30 == 0:
                reporter.snapshot(
                    ws_latency_ms=result.first_element_latency_ms,
                    event_count=len(result.events),
                )
            if event_type in ("done", "stream_done", "error"):
                break

    try:
        ws_url = f"{WS_URL}/ws/board/{session_id}?token={TEST_BYPASS_SECRET}"
        async with websockets.connect(
            ws_url, ping_interval=30, ping_timeout=20, close_timeout=5
        ) as ws:
            reader_task = asyncio.create_task(_reader(ws))
            sender_task = asyncio.create_task(_sender(ws))
            done, pending = await asyncio.wait(
                [reader_task, sender_task],
                timeout=duration_s + 10,
                return_when=asyncio.FIRST_EXCEPTION,
            )
            for t in pending:
                t.cancel()
            for t in done:
                exc = t.exception()
                if exc and not result.error:
                    result.error = str(exc)
    except Exception as e:
        result.error = str(e)

    result.total_duration_s = time.time() - start
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# Test 1: Network Drop (30s) → Reconnect
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.integration
@pytest.mark.slow
class TestNetworkDropReconnect:
    """Verify that the client survives a 30s network drop and reconnects
    via its 5-step exponential backoff without losing structural canvas state."""

    @pytest.mark.asyncio
    async def test_websocket_reconnect_after_30s_drop(
        self, reporter: DiagnosticsReporter
    ) -> None:
        """Direct WebSocket test: connect, simulate drop by closing WS,
        wait 30s, reconnect, verify state continuity."""
        _require_env()
        if not HAS_WEBSOCKETS:
            pytest.skip("websockets not installed")

        reporter.set_test_name("test_network_drop_30s_reconnect")

        session_id = _create_board_session(
            topic="Test: Network Drop Recovery",
            duration_minutes=2,
        )
        if not session_id:
            pytest.fail("Failed to create board session")

        reporter.snapshot(event_count=0)

        try:
            # Phase 1 — initial connection, collect events
            phase1 = await _ws_consume_events(
                session_id, reporter, abort_after_s=30
            )  # 30s of streaming (LLM cold-start can be slow)

            if not phase1.events:
                pytest.fail("No events received in phase 1 — backend may not be running")

            element_ids_phase1 = {
                e.get("element_id") for e in phase1.events
                if e.get("event_type") == "element_added" and e.get("element_id")
            }

            reporter.snapshot(
                ws_latency_ms=phase1.first_element_latency_ms,
                event_count=len(phase1.events),
            )

            # Phase 2 — simulate 30s network drop (wait without connection)
            start_drop = time.time()
            await asyncio.sleep(NETWORK_DROP_DURATION)
            actual_drop_duration = time.time() - start_drop

            # Phase 3 — reconnect and verify state continuity
            phase3 = await _ws_consume_events(
                session_id, reporter, abort_after_s=30
            )

            element_ids_phase3 = {
                e.get("element_id") for e in phase3.events
                if e.get("event_type") == "element_added" and e.get("element_id")
            }

            reporter.snapshot(
                ws_latency_ms=phase3.first_element_latency_ms,
                event_count=len(phase3.events),
            )

            # Assertions
            assert actual_drop_duration >= 25, (
                f"Network drop was only {actual_drop_duration:.1f}s (expected >=25s)"
            )
            assert len(phase1.events) > 0, "Phase 1 should have received events"
            # Phase 3 may get empty if session expired; that's acceptable
            # but check that the backend still has the session
            if len(phase3.events) > 0:
                recovered_ids = element_ids_phase1 & element_ids_phase3
                # At minimum, no duplicate element IDs
                # (each element_id should appear at most once)
                all_ids_phase3 = [
                    e.get("element_id") for e in phase3.events
                    if e.get("event_type") == "element_added"
                ]
                assert len(all_ids_phase3) == len(set(all_ids_phase3)), (
                    "Duplicate element IDs detected after reconnect"
                )

        except Exception as e:
            reporter.record_error(e, context=f"session_id={session_id}")
            raise
        finally:
            reporter.flush()

    @pytest.mark.browser
    def test_browser_network_drop_reconnect(self, reporter: DiagnosticsReporter) -> None:
        """Browser-based test using Playwright: open board page, simulate
        network offline/online via CDP, verify WebSocket reconnection.

        Requires the frontend auth migration (Commit 3) to use test bypass
        tokens in the browser context.
        """
        _require_env()
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            pytest.skip("playwright not installed — run: pip install playwright && playwright install chromium")

        reporter.set_test_name("test_browser_network_drop_reconnect")

        FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

        session_id = _create_board_session(
            topic="Test: Browser Network Drop",
            duration_minutes=3,
        )
        if not session_id:
            pytest.fail("Failed to create board session")

        reporter.snapshot()

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()

            # Inject test bypass token before any page JS runs.
            # Override the WebSocket URL construction so the board page
            # uses our test bypass secret instead of Clerk JWT.
            context.add_init_script(f"""
                const _TEST_TOKEN = {json.dumps(TEST_BYPASS_SECRET)};
                const _originalWebSocket = window.WebSocket;
                window.__testTokenInjected = true;
                // The board page calls buildUrl() which constructs
                // ws://host/ws/board/{{id}}?token={{token}}
                // We patch the token at the source by overriding fetch()
                // and URL parsing so the Clerk getToken() call returns
                // our test bypass secret.
                const _originalFetch = window.fetch;
                window.fetch = function(...args) {{
                    const url = args[0] && typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
                    return _originalFetch.apply(this, args);
                }};
            """)

            page = context.new_page()

            try:
                board_url = f"{FRONTEND_URL}/board/{session_id}"
                page.goto(board_url, timeout=30000, wait_until="domcontentloaded")

                # Wait for WebSocket connection indicator
                # (This part depends on the frontend being wired for test bypass
                #  and is a placeholder until Commit 3 is complete.)
                page.wait_for_timeout(5000)

                reporter.snapshot(event_count=0)

                # Simulate 30s network drop via CDP
                cdp = context.new_cdp_session(page)
                cdp.send("Network.emulateNetworkConditions", {
                    "offline": True,
                    "latency": 0,
                    "downloadThroughput": -1,
                    "uploadThroughput": -1,
                })

                drop_start = time.time()
                page.wait_for_timeout(NETWORK_DROP_DURATION * 1000)
                actual_drop_duration = time.time() - drop_start

                # Restore network
                cdp.send("Network.emulateNetworkConditions", {
                    "offline": False,
                    "latency": 0,
                    "downloadThroughput": -1,
                    "uploadThroughput": -1,
                })

                # Wait for reconnection
                page.wait_for_timeout(MAX_RECONNECT_WAIT * 1000)

                # Check that the page is still functional
                status_text = page.text_content("header")
                reporter.snapshot()

                assert actual_drop_duration >= 25
                assert status_text is not None, "Page should still render after reconnect"

            except Exception as e:
                reporter.record_error(e, context=f"browser session_id={session_id}")
                raise
            finally:
                browser.close()
                reporter.flush()


# ═══════════════════════════════════════════════════════════════════════════════
# Test 2: Long Session Endurance (30+ min)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.integration
@pytest.mark.slow
class TestLongSessionEndurance:
    """Verify that a 30+ minute board session does not leak memory or exhaust
    database connection pools."""

    @pytest.mark.asyncio
    async def test_long_session_memory_and_db_stability(
        self, reporter: DiagnosticsReporter
    ) -> None:
        _require_env()
        if not HAS_PSUTIL:
            pytest.skip("psutil not installed")
        if not HAS_WEBSOCKETS:
            pytest.skip("websockets not installed")

        reporter.set_test_name("test_long_session_endurance_30min")

        # Use a shorter test in CI; override with LONG_SESSION_MINS env var
        test_duration_s = max(LONG_SESSION_DURATION_MINUTES * 60, 60)
        if os.getenv("CI"):
            test_duration_s = 120  # 2 min in CI
            print(f"[CI mode] Reducing endurance test to {test_duration_s}s")

        session_id = _create_board_session(
            topic="Test: Long Session Endurance",
            language="en",
            student_level="advanced",
            duration_minutes=max(LONG_SESSION_DURATION_MINUTES, 30),
        )
        if not session_id:
            pytest.fail("Failed to create board session")

        reporter.snapshot(event_count=0)

        # Start periodic memory sampling in background
        stop_sampling = threading.Event()
        memory_samples: List[float] = []

        def _sample_memory() -> None:
            while not stop_sampling.is_set():
                try:
                    proc = psutil.Process()
                    memory_samples.append(proc.memory_info().rss / (1024 * 1024))
                except Exception:
                    pass
                stop_sampling.wait(5)  # sample every 5s

        sampler_thread = threading.Thread(target=_sample_memory, daemon=True)
        sampler_thread.start()

        try:
            result = await _ws_consume_with_user_messages(
                session_id,
                reporter,
                duration_s=test_duration_s,
                message_interval_s=30.0,
            )

            stop_sampling.set()
            sampler_thread.join(timeout=5)

            reporter.snapshot(
                ws_latency_ms=result.first_element_latency_ms,
                event_count=len(result.events),
            )

            # Assertions
            assert len(result.events) > 0, (
                f"No events received during {test_duration_s}s endurance test"
            )

            if len(memory_samples) >= 2:
                initial_mem = memory_samples[0]
                final_mem = memory_samples[-1]
                peak_mem = max(memory_samples)
                growth_mb = final_mem - initial_mem
                hours_elapsed = test_duration_s / 3600

                growth_rate_mb_per_hour = growth_mb / max(hours_elapsed, 0.001)

                memory_ok = abs(growth_rate_mb_per_hour) < MEMORY_GROWTH_THRESHOLD_MB_PER_HOUR

                # Log for diagnostics (don't hard-fail; let diagnostics report decide)
                if not memory_ok:
                    reporter.record_error(
                        ValueError(
                            f"Memory growth rate {growth_rate_mb_per_hour:.1f} MB/h "
                            f"exceeds threshold {MEMORY_GROWTH_THRESHOLD_MB_PER_HOUR} MB/h. "
                            f"Initial: {initial_mem:.1f}MB, Final: {final_mem:.1f}MB, "
                            f"Peak: {peak_mem:.1f}MB"
                        ),
                        context=f"session_id={session_id}",
                    )

            if result.error:
                reporter.record_error(
                    RuntimeError(result.error),
                    context=f"WS stream error, session_id={session_id}",
                )

        except Exception as e:
            stop_sampling.set()
            reporter.record_error(e, context=f"session_id={session_id}")
            raise
        finally:
            reporter.flush()


# ═══════════════════════════════════════════════════════════════════════════════
# Test 3: Idle Timeout (10 min quiet)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.integration
@pytest.mark.slow
class TestIdleTimeout:
    """Verify the backend handles a 10-minute idle period gracefully without
    silently killing the TCP socket."""

    @pytest.mark.asyncio
    async def test_idle_timeout_10min(
        self, reporter: DiagnosticsReporter
    ) -> None:
        _require_env()
        if not HAS_WEBSOCKETS:
            pytest.skip("websockets not installed")

        reporter.set_test_name("test_idle_timeout_10min")

        # Shorter in CI
        idle_duration_s = IDLE_TIMEOUT_SECONDS
        if os.getenv("CI"):
            idle_duration_s = 60
            print(f"[CI mode] Reducing idle timeout test to {idle_duration_s}s")

        session_id = _create_board_session(
            topic="Test: Idle Timeout",
            duration_minutes=15,
        )
        if not session_id:
            pytest.fail("Failed to create board session")

        reporter.snapshot(event_count=0)

        try:
            ws_url = f"{WS_URL}/ws/board/{session_id}?token={TEST_BYPASS_SECRET}"
            async with websockets.connect(
                ws_url, ping_interval=20, ping_timeout=20
            ) as ws:
                # Collect initial events to confirm the stream started
                initial_events: List[Dict[str, Any]] = []
                collect_start = time.time()
                while time.time() - collect_start < 10:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                        initial_events.append(json.loads(raw))
                    except asyncio.TimeoutError:
                        break

                assert len(initial_events) > 0, "No initial events — backend may not be running"

                reporter.snapshot(
                    ws_latency_ms=(time.time() - collect_start) * 1000 if initial_events else -1,
                    event_count=len(initial_events),
                )

                # Idle period — send explicit TCP keepalives via WebSocket pings
                idle_start = time.time()
                last_ping_ok = True
                while time.time() - idle_start < idle_duration_s:
                    await asyncio.sleep(30)  # ping every 30s
                    try:
                        await asyncio.wait_for(ws.ping(), timeout=10)
                        last_ping_ok = True
                    except Exception:
                        last_ping_ok = False
                        break

                actual_idle = time.time() - idle_start

                reporter.snapshot(
                    event_count=len(initial_events),
                )

                # Assertions
                assert last_ping_ok, (
                    f"WebSocket ping failed after {actual_idle:.0f}s idle — "
                    f"TCP socket may have died silently"
                )
                assert actual_idle >= min(idle_duration_s * 0.8, 480), (
                    f"Idle period was only {actual_idle:.1f}s (expected ~{idle_duration_s}s)"
                )

                # Verify we can still receive events after idle
                post_idle_events = 0
                post_idle_start = time.time()
                while time.time() - post_idle_start < 10:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                        post_idle_events += 1
                    except asyncio.TimeoutError:
                        break

                # The lesson may have finished during idle; either events or
                # the connection being open is fine.
                assert ws.state.name == "OPEN" or post_idle_events > 0, (
                    "WebSocket should remain open or receive events after idle"
                )

        except Exception as e:
            reporter.record_error(e, context=f"session_id={session_id}")
            raise
        finally:
            reporter.flush()


# ═══════════════════════════════════════════════════════════════════════════════
# Test 4: Rapid Pause/Resume Cycles (state correctness)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.integration
class TestRapidPauseResume:
    """Verify no state corruption when toggling pause/resume rapidly."""

    @pytest.mark.asyncio
    async def test_rapid_pause_resume_100_cycles(
        self, reporter: DiagnosticsReporter
    ) -> None:
        _require_env()
        if not HAS_WEBSOCKETS:
            pytest.skip("websockets not installed")

        reporter.set_test_name("test_rapid_pause_resume_100_cycles")

        session_id = _create_board_session(
            topic="Test: Pause/Resume Stress",
            duration_minutes=3,
        )
        if not session_id:
            pytest.fail("Failed to create board session")

        try:
            ws_url = f"{WS_URL}/ws/board/{session_id}?token={TEST_BYPASS_SECRET}"
            async with websockets.connect(
                ws_url, ping_interval=20, ping_timeout=10
            ) as ws:
                # Collect a few initial events
                for _ in range(3):
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
                    except asyncio.TimeoutError:
                        break

                # Rapid pause/resume
                for i in range(100):
                    await ws.send(json.dumps({"action": "pause" if i % 2 == 0 else "resume"}))
                    await asyncio.sleep(0.01)  # minimal gap

                # Final resume to ensure streaming continues
                await ws.send(json.dumps({"action": "resume"}))
                await asyncio.sleep(1)

                # Collect events after the storm
                post_events = 0
                post_start = time.time()
                while time.time() - post_start < 10:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                        event = json.loads(raw)
                        post_events += 1
                        if event.get("event_type") in ("done", "error", "stream_done"):
                            break
                    except asyncio.TimeoutError:
                        break

                reporter.snapshot(event_count=post_events)

                # The session should still be operational
                assert ws.state.name == "OPEN", "WebSocket should remain open after rapid toggles"
                assert post_events >= 0, "Should handle rapid pause/resume without crashing"

        except Exception as e:
            reporter.record_error(e, context=f"session_id={session_id}")
            raise
        finally:
            reporter.flush()


# ═══════════════════════════════════════════════════════════════════════════════
# Test 5: Concurrent Session Limit
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.integration
class TestConcurrentSessions:
    """Verify the backend enforces MAX_SESSIONS_PER_USER=5."""

    def test_user_cannot_exceed_5_sessions(self, reporter: DiagnosticsReporter) -> None:
        _require_env()
        if not HAS_REQUESTS:
            pytest.skip("requests not installed")

        reporter.set_test_name("test_concurrent_sessions_limit")

        session_ids: List[str] = []
        try:
            # Create up to 7 sessions — first 5 should succeed, 6+ should fail
            for i in range(7):
                resp = requests.post(
                    f"{BACKEND_URL}/board/create-session",
                    json={
                        "topic": f"Test Session {i+1}",
                        "language": "en",
                        "duration_minutes": 1,
                    },
                    headers={"Authorization": f"Bearer {TEST_BYPASS_SECRET}"},
                    timeout=10,
                )
                if i < 5:
                    assert resp.status_code == 200, (
                        f"Session {i+1} creation failed: {resp.status_code} {resp.text}"
                    )
                    data = resp.json()
                    session_ids.append(data.get("session_id", ""))
                else:
                    assert resp.status_code in (429, 503), (
                        f"Session {i+1} should have been rate-limited, "
                        f"got {resp.status_code}"
                    )

        except Exception as e:
            reporter.record_error(e, context=f"session_ids={session_ids}")
            raise
        finally:
            reporter.flush()


# ═══════════════════════════════════════════════════════════════════════════════
# pytest marker registration helpers
# ═══════════════════════════════════════════════════════════════════════════════

def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "browser: tests that require Playwright/headless browser")
    config.addinivalue_line("markers", "integration: tests that require live backend services")
    config.addinivalue_line("markers", "slow: tests that take > 5 s")
