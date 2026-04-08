"""
Shared pytest fixtures for MentorMind unit tests.

All fixtures are scoped to avoid expensive re-initialization and to keep
tests independent.  External I/O (API calls, file-system operations,
subprocess) is mocked by default so the suite runs offline.
"""

from __future__ import annotations

import sys
import os
import asyncio
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

# ── Python path ───────────────────────────────────────────────────────────────
# Allow `import core.…` / `import services.…` etc. without installing the pkg.
BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, os.path.abspath(BACKEND_DIR))


# ── Minimal env vars required to import the modules ──────────────────────────
os.environ.setdefault("DEEPSEEK_API_KEY", "test-key-placeholder")
os.environ.setdefault("MANIM_RENDER_QUALITY", "l")
os.environ.setdefault("MANIM_RENDER_TIMEOUT_SECONDS", "60")


# ─────────────────────────────────────────────────────────────────────────────
# Lightweight dataclasses & constants re-exported for test use
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def allowed_actions():
    return {"show_title", "show_text", "write_tex", "plot", "transform", "draw_shape"}


@pytest.fixture(scope="session")
def allowed_layouts():
    return {
        "title_card", "equation_focus", "graph_focus",
        "two_column", "callout_card", "recap_card",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Reusable Scene / VideoScript builders
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def make_raw_scene():
    """Factory that returns a minimal valid raw scene dict (pre-normalisation)."""
    def _factory(
        scene_id: str = "scene_1",
        action: str = "show_text",
        param: str = "Hello world",
        narration: str = "This is the narration text for the scene.",
        duration: float = 20.0,
        layout: str = "callout_card",
    ) -> Dict[str, Any]:
        return {
            "id": scene_id,
            "action": action,
            "param": param,
            "narration": narration,
            "duration": duration,
            "canvas_config": {
                "layout": layout,
                "font_size": 28,
                "safe_scale": 0.82,
                "max_chars": 72,
                "graph": {"x_range": [-6, 6], "y_range": [-6, 6]},
            },
        }
    return _factory


@pytest.fixture
def make_scene():
    """Factory for core.modules.video_scripting.Scene dataclass instances."""
    from core.modules.video_scripting import Scene

    def _factory(
        scene_id: str = "s1",
        action: str = "show_text",
        param: str = "Hello world",
        narration: str = "Narration text.",
        duration: float = 20.0,
        canvas_config: Dict[str, Any] | None = None,
    ) -> Scene:
        return Scene(
            id=scene_id,
            duration=duration,
            narration=narration,
            action=action,
            param=param,
            visual_type="manim",
            canvas_config=canvas_config or {
                "layout": "callout_card",
                "font_size": 28,
                "safe_scale": 0.82,
                "max_chars": 72,
                "graph": {"x_range": [-6, 6], "y_range": [-6, 6]},
            },
        )
    return _factory


@pytest.fixture
def make_video_script(make_scene):
    """Factory for VideoScript instances."""
    from core.modules.video_scripting import VideoScript

    def _factory(
        title: str = "Test Lesson",
        scenes=None,
        total_duration: float | None = None,
    ) -> "VideoScript":
        if scenes is None:
            scenes = [make_scene()]
        total = total_duration if total_duration is not None else sum(s.duration for s in scenes)
        return VideoScript(
            title=title,
            scenes=scenes,
            total_duration=total,
            engine="manim",
        )
    return _factory


# ─────────────────────────────────────────────────────────────────────────────
# Mocked API client
# ─────────────────────────────────────────────────────────────────────────────

def _make_api_response(payload: Dict[str, Any]):
    """Build a successful APIResponse wrapping a chat completion payload."""
    from services.api_client import APIResponse

    return APIResponse(
        success=True,
        data={
            "choices": [
                {"message": {"content": payload if isinstance(payload, str) else __import__("json").dumps(payload)}}
            ]
        },
        status_code=200,
    )


@pytest.fixture
def mock_api_client():
    """Return a MagicMock APIClient whose deepseek.chat_completion is an AsyncMock."""
    client = MagicMock()
    client.deepseek = MagicMock()
    client.deepseek.chat_completion = AsyncMock(
        return_value=_make_api_response({"scenes": [], "title": "Mock"})
    )
    return client


@pytest.fixture
def pipeline(mock_api_client):
    """RobustVideoGenerationPipeline wired to the mock API client."""
    from core.modules.robust_video_generation import RobustVideoGenerationPipeline

    with patch("prompts.loader.load_prompt", return_value="mock prompt content"), \
         patch("prompts.loader.render_prompt", return_value="mock rendered prompt"):
        return RobustVideoGenerationPipeline(api_client=mock_api_client)


@pytest.fixture
def manim_service(tmp_path):
    """ManimService with output_dir redirected to a temp directory."""
    with patch("core.rendering.manim_renderer.config") as mock_cfg:
        mock_cfg.DATA_DIR = str(tmp_path)
        from core.rendering.manim_renderer import ManimService
        svc = ManimService.__new__(ManimService)
        svc.output_dir = str(tmp_path / "videos" / "manim")
        svc.render_quality = "l"
        svc.render_timeout_seconds = 60
        os.makedirs(svc.output_dir, exist_ok=True)
        return svc


# ─────────────────────────────────────────────────────────────────────────────
# Pytest-asyncio configuration
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop_policy():
    return asyncio.DefaultEventLoopPolicy()
