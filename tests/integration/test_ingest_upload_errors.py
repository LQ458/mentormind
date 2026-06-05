"""Regression tests for upload validation/error responses."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

pytest.importorskip("celery", reason="celery not installed in this env")
pytest.importorskip("redis", reason="redis not installed in this env")
pytest.importorskip("jwt", reason="PyJWT not installed in this env")


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from auth import get_current_user  # type: ignore
    from server import app  # type: ignore

    def fake_user():
        return SimpleNamespace(id="qa-upload-user")

    app.dependency_overrides[get_current_user] = fake_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_image_ingest_unsupported_type_returns_400_not_500(client):
    response = client.post(
        "/ingest/image",
        files={"file": ("not-image.txt", b"this is not an image", "text/plain")},
    )

    assert response.status_code == 400
    assert "Unsupported format: text/plain" in response.text


def test_image_ingest_missing_file_returns_422_not_500(client):
    response = client.post(
        "/ingest/image",
        files={"not_file": ("note.txt", b"wrong field", "text/plain")},
    )

    assert response.status_code == 422
    assert response.json().get("body") == "[multipart body omitted]"
