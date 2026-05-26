import os
import pytest


TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(TESTS_DIR))


@pytest.fixture(scope="session")
def test_bypass_secret() -> str:
    secret = os.getenv("TEST_BYPASS_SECRET", "")
    if not secret:
        pytest.skip("TEST_BYPASS_SECRET not set — load tests require auth bypass")
    return secret


@pytest.fixture(scope="session")
def backend_url() -> str:
    return os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
