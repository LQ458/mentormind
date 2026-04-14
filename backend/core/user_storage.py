"""
Per-user media storage with quota management.
Saves uploaded images/audio and extracted text to a personal knowledge base.
"""

import os
import uuid
import logging
from typing import Optional

from config import config

logger = logging.getLogger(__name__)

# Storage quota: 100MB for free tier, unlimited for testing/paid
FREE_TIER_QUOTA_BYTES = 100 * 1024 * 1024  # 100 MB
TESTING_MODE = os.getenv("DISABLE_STORAGE_QUOTA", "true").lower() == "true"

USER_MEDIA_DIR = os.path.join(config.DATA_DIR, "user_media")


def _ensure_user_dir(user_id: str) -> str:
    """Ensure the user's media directory exists and return its path."""
    user_dir = os.path.join(USER_MEDIA_DIR, user_id)
    os.makedirs(user_dir, exist_ok=True)
    return user_dir


def save_media_file(user_id: str, file_bytes: bytes, extension: str = ".png") -> tuple[str, int]:
    """
    Save media bytes to the user's storage directory.

    Returns:
        (relative_path, file_size_bytes)
    """
    user_dir = _ensure_user_dir(user_id)
    filename = f"{uuid.uuid4().hex}{extension}"
    abs_path = os.path.join(user_dir, filename)

    with open(abs_path, "wb") as f:
        f.write(file_bytes)

    file_size = len(file_bytes)
    relative_path = f"user_media/{user_id}/{filename}"
    return relative_path, file_size


def delete_media_file(relative_path: str) -> bool:
    """Delete a media file from disk."""
    abs_path = os.path.join(config.DATA_DIR, relative_path)
    if os.path.exists(abs_path):
        os.unlink(abs_path)
        return True
    return False


def get_user_storage_usage_disk(user_id: str) -> int:
    """Calculate total bytes used by a user's media files on disk."""
    user_dir = os.path.join(USER_MEDIA_DIR, user_id)
    if not os.path.isdir(user_dir):
        return 0
    total = 0
    for f in os.listdir(user_dir):
        fp = os.path.join(user_dir, f)
        if os.path.isfile(fp):
            total += os.path.getsize(fp)
    return total


def check_storage_quota(user_id: str, subscription_tier: str, additional_bytes: int = 0) -> tuple[bool, int, int]:
    """
    Check if user is within their storage quota.

    Returns:
        (within_quota, current_usage_bytes, quota_limit_bytes)
    """
    if TESTING_MODE or subscription_tier != "free":
        return True, 0, 0  # No limit

    current_usage = get_user_storage_usage_disk(user_id)
    quota = FREE_TIER_QUOTA_BYTES
    within = (current_usage + additional_bytes) <= quota
    return within, current_usage, quota
