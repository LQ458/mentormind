import os
import sys


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import server


def test_build_metadata_reports_sanitized_deployment_fingerprint(monkeypatch):
    monkeypatch.setenv("MENTORMIND_BUILD_SHA", "abc1234 dirty/value!")
    monkeypatch.setenv("MENTORMIND_IMAGE_TAG", "prod:2026-06-20")
    monkeypatch.setenv("MENTORMIND_ENV", "production")

    metadata = server._build_metadata()

    assert metadata["version"] == server.APP_VERSION
    assert metadata["sha"] == "abc1234-dirty/value-"
    assert metadata["image_tag"] == "prod:2026-06-20"
    assert metadata["environment"] == "production"


def test_media_service_status_reports_loaded_models_as_online(monkeypatch):
    monkeypatch.setattr(server, "_optional_python_module_available", lambda name: False)
    monkeypatch.setattr(server.shutil, "which", lambda name: None)

    status = server._media_service_status(
        asr_status={
            "whisper_loaded": True,
            "funasr_zh_loaded": True,
            "paddleocr_loaded": True,
        },
        funasr_external="offline",
        paddle_external="offline",
    )

    assert status["funasr"] == {"status": "online", "latency_ms": 0, "mode": "local_loaded"}
    assert status["whisper"] == {"status": "online", "latency_ms": 0, "mode": "local_loaded"}
    assert status["paddle_ocr"] == {"status": "online", "latency_ms": 0, "mode": "local_loaded"}


def test_media_service_status_reports_lazy_local_models(monkeypatch):
    monkeypatch.setattr(server, "_optional_python_module_available", lambda name: name in {"funasr", "whisper", "paddleocr"})
    monkeypatch.setattr(server.shutil, "which", lambda name: None)

    status = server._media_service_status(
        asr_status={
            "whisper_loaded": False,
            "funasr_zh_loaded": False,
            "paddleocr_loaded": False,
        },
        funasr_external="offline",
        paddle_external="offline",
    )

    assert status["funasr"]["status"] == "available"
    assert status["funasr"]["mode"] == "lazy_local_model"
    assert status["whisper"]["status"] == "available"
    assert status["whisper"]["mode"] == "lazy_local_model"
    assert status["paddle_ocr"]["status"] == "available"
    assert status["paddle_ocr"]["mode"] == "lazy_local_model"


def test_media_service_status_reports_tesseract_fallback(monkeypatch):
    monkeypatch.setattr(server, "_optional_python_module_available", lambda name: False)
    monkeypatch.setattr(server.shutil, "which", lambda name: "/usr/bin/tesseract" if name == "tesseract" else None)

    status = server._media_service_status(
        asr_status={
            "whisper_loaded": False,
            "funasr_zh_loaded": False,
            "paddleocr_loaded": False,
        },
        funasr_external="offline",
        paddle_external="offline",
    )

    assert status["funasr"] == {"status": "offline", "latency_ms": None, "mode": "not_installed"}
    assert status["whisper"] == {"status": "offline", "latency_ms": None, "mode": "not_installed"}
    assert status["paddle_ocr"] == {"status": "available", "latency_ms": None, "mode": "tesseract_fallback"}
