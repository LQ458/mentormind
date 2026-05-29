from datetime import datetime
import os
import sys


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from database.models.enums import UnitStatus
from database.models.study_plan import StudyPlan, StudyPlanUnit


def test_study_plan_to_dict_excludes_units_with_deleted_at():
    plan = StudyPlan(
        user_id="user-1",
        subject="math",
        framework="ap",
        title="AP Calculus",
        units=[
            StudyPlanUnit(title="Active", order_index=1, content_status=UnitStatus.PENDING.value),
            StudyPlanUnit(title="Soft deleted", order_index=2, content_status=UnitStatus.PENDING.value, deleted_at=datetime.utcnow()),
        ],
    )

    payload = plan.to_dict(include_units=True)

    assert [unit["title"] for unit in payload["units"]] == ["Active"]


def test_study_plan_to_dict_excludes_deleted_status_units():
    plan = StudyPlan(
        user_id="user-1",
        subject="math",
        framework="ap",
        title="AP Calculus",
        units=[
            StudyPlanUnit(title="Active", order_index=1, content_status=UnitStatus.PENDING.value),
            StudyPlanUnit(title="Deleted", order_index=2, content_status=UnitStatus.DELETED.value),
        ],
    )

    payload = plan.to_dict(include_units=True)

    assert [unit["title"] for unit in payload["units"]] == ["Active"]
