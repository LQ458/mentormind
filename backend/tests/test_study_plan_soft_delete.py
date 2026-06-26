from datetime import datetime, timedelta, timezone
import os
import sys
from types import SimpleNamespace


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from database.models.enums import UnitStatus
from database.models.study_plan import StudyPlan, StudyPlanUnit
import server


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


def test_stale_unit_generation_is_marked_failed():
    stale_unit = SimpleNamespace(
        id="unit-stale",
        content_status="generating",
        generation_task_id="task-1",
        generation_started_at=datetime.now(timezone.utc) - timedelta(minutes=11),
        updated_at=None,
    )
    fresh_unit = SimpleNamespace(
        id="unit-fresh",
        content_status="generating",
        generation_task_id="task-2",
        generation_started_at=datetime.now(timezone.utc) - timedelta(minutes=2),
        updated_at=None,
    )

    class FakeDb:
        commits = 0

        def commit(self):
            self.commits += 1

    db = FakeDb()

    marked = server._mark_stale_study_plan_unit_generations_failed(db, [stale_unit, fresh_unit])

    assert marked == 1
    assert db.commits == 1
    assert stale_unit.content_status == "failed"
    assert stale_unit.generation_task_id is None
    assert stale_unit.generation_started_at is None
    assert fresh_unit.content_status == "generating"
