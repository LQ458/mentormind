import asyncio
import os
import sys
from io import BytesIO

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import server


def upload_file(filename: str, content_type: str) -> UploadFile:
    return UploadFile(
        file=BytesIO(b"not a supported media file"),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def test_audio_ingest_rejects_unsupported_media_type_before_processing():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            server.ingest_audio(
                file=upload_file("notes.txt", "text/plain"),
                current_user=object(),
            ),
        )

    assert exc.value.status_code == 415


def test_image_ingest_rejects_unsupported_media_type_before_processing():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            server.ingest_image(
                file=upload_file("clip.mp3", "audio/mpeg"),
                current_user=object(),
            ),
        )

    assert exc.value.status_code == 415
