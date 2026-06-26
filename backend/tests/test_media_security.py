import asyncio
import os
import sys

import pytest
from fastapi import HTTPException


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import server


def test_public_media_path_normalization_accepts_generated_media():
    assert server._normalize_public_media_path("videos/demo.mp4") == "videos/demo.mp4"
    assert server._normalize_public_media_path("/audio/demo.mp3") == "audio/demo.mp3"
    assert server._normalize_public_media_path("/api/files/board-audio/demo.mp3") == "board-audio/demo.mp3"


@pytest.mark.parametrize(
    "path",
    [
        "",
        ".",
        "../.env",
        "/../.env",
        "videos/../uploads/raw.png",
        "uploads/raw.png",
        "user_media/user/secret.png",
        "api/files/user_media/user/secret.png",
    ],
)
def test_public_media_path_normalization_rejects_private_or_unsafe_paths(path):
    assert server._normalize_public_media_path(path) is None


def test_serve_media_serves_allowlisted_public_files(monkeypatch, tmp_path):
    public_file = tmp_path / "videos" / "lesson.mp4"
    public_file.parent.mkdir(parents=True)
    public_file.write_bytes(b"demo")
    monkeypatch.setattr(server.config, "DATA_DIR", str(tmp_path))

    response = asyncio.run(server.serve_media("videos/lesson.mp4"))

    assert os.path.samefile(response.path, public_file)


def test_serve_media_rejects_existing_private_files(monkeypatch, tmp_path):
    private_file = tmp_path / "user_media" / "user-1" / "secret.png"
    private_file.parent.mkdir(parents=True)
    private_file.write_bytes(b"secret")
    monkeypatch.setattr(server.config, "DATA_DIR", str(tmp_path))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(server.serve_media("user_media/user-1/secret.png"))

    assert exc_info.value.status_code == 404
