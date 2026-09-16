import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Point the app at a throwaway sqlite file instead of the dev Postgres
# database. Must happen before `main` (and therefore `database`) is
# imported, since the engine is built once at import time.
TEST_DB_PATH = BACKEND_DIR / "test_moodlens.db"
TEST_DB_PATH.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"

TEST_API_KEY = "test-api-key"
os.environ["API_KEY"] = TEST_API_KEY

import pytest
from fastapi.testclient import TestClient

import main  # noqa: E402 - must follow the env overrides above


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_db():
    yield
    TEST_DB_PATH.unlink(missing_ok=True)


@pytest.fixture()
def client():
    """Authenticated client - most tests exercise behavior behind the API key gate."""
    return TestClient(main.app, headers={"X-API-Key": TEST_API_KEY})


@pytest.fixture()
def anon_client():
    """Unauthenticated client, for testing the gate itself."""
    return TestClient(main.app)
