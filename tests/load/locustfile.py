"""
Locust load-test definitions for MentorMind.

Usage:
    locust -f tests/load/locustfile.py --host http://127.0.0.1:8000
    locust -f tests/load/locustfile.py --headless -u 20 -r 2 -t 120s --host http://127.0.0.1:8000

Requires:
    pip install locust locust-plugins
    Set TEST_BYPASS_SECRET env var for auth bypass.
"""

import os
import random
import time
from locust import HttpUser, task, between, events
from locust.exception import StopUser


TEST_BYPASS_SECRET = os.getenv("TEST_BYPASS_SECRET", "")

TOPICS = [
    "Introduction to Derivatives",
    "Basic Algebra",
    "Newton's Laws of Motion",
    "Chemical Bonds",
    "Cell Structure",
]

LANGUAGES = ["zh", "en"]


def make_headers():
    return {"Authorization": f"Bearer {TEST_BYPASS_SECRET}"}


class MentorMindReader(HttpUser):
    """Simulates users browsing lessons and health-checking."""

    wait_time = between(1, 3)

    def on_start(self):
        if not TEST_BYPASS_SECRET:
            print("[WARN] TEST_BYPASS_SECRET not set — authenticated requests will fail")
            raise StopUser()

    @task(5)
    def health_check(self):
        self.client.get("/health", name="GET /health")

    @task(3)
    def list_lessons(self):
        self.client.get(
            "/lessons?limit=20",
            headers=make_headers(),
            name="GET /lessons",
        )

    @task(2)
    def search_lessons(self):
        topic = random.choice(TOPICS[:3])
        self.client.get(
            f"/lessons?search={topic.replace(' ', '+')}&limit=10",
            headers=make_headers(),
            name="GET /lessons?search=",
        )

    @task(1)
    def list_study_plans(self):
        self.client.get(
            "/study-plan/library",
            headers=make_headers(),
            name="GET /study-plan/library",
        )

    @task(1)
    def get_knowledge_graph(self):
        self.client.get(
            "/users/me/knowledge-graph",
            headers=make_headers(),
            name="GET /users/me/knowledge-graph",
        )


class MentorMindBoardCreator(HttpUser):
    """Simulates users creating board lessons (lightweight — minimal duration)."""

    wait_time = between(5, 15)

    def on_start(self):
        if not TEST_BYPASS_SECRET:
            raise StopUser()

    @task
    def create_board_session(self):
        topic = random.choice(TOPICS)
        lang = random.choice(LANGUAGES)
        resp = self.client.post(
            "/board/create-session",
            json={
                "topic": topic,
                "language": lang,
                "duration_minutes": 2,
                "student_level": "beginner",
            },
            headers=make_headers(),
            name="POST /board/create-session",
        )
        if resp.status_code != 200:
            resp.failure(f"create-session returned {resp.status_code}")


# ── Custom events for server metrics ──────────────────────────────────────────

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print("🚀 Load test starting...")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    print("🏁 Load test finished.")
