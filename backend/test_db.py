from datetime import datetime
import os
import sys

sys.path.append("/Users/LeoQin/Documents/GitHub/mentormind/backend")
from database.storage import lesson_storage_sql

lessons, count = lesson_storage_sql.get_all_lessons(limit=1)
for l in lessons:
    print(f"Lesson: {l['lesson_title']}, created: {l['timestamp']}")
    lesson_detail = lesson_storage_sql.get_lesson(l['id'])
    print(f"  video_url in detail: {lesson_detail.get('video_url', 'NOT_FOUND')}")

