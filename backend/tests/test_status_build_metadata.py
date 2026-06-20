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
