import os
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import server


def test_admin_metrics_rejects_non_admin_before_db_access():
    user = SimpleNamespace(role="student")

    with pytest.raises(HTTPException) as exc_info:
        server.get_admin_metrics(current_user=user, db=None)

    assert exc_info.value.status_code == 403
