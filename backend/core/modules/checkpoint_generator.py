"""F2 — decide WHERE to insert comprehension checkpoints during narration.

Pure heuristic module. Generates the `comprehension_check` BoardEvent payload.
The LLM-backed MCQ authoring lives in the streaming generator; this module
only decides timing + produces a default emoji-only check if no MCQ is given.
"""

from dataclasses import dataclass
from typing import List, Optional


MIN_SECONDS_BETWEEN_CHECKS = 90.0
MAX_SECONDS_BETWEEN_CHECKS = 180.0


@dataclass
class CheckpointDecision:
    insert: bool
    reason: str


class CheckpointGenerator:
    """Decides when to emit a comprehension_check event.

    Rules:
    - Never before MIN_SECONDS_BETWEEN_CHECKS have elapsed since the last check.
    - Always at section boundaries (segment_index advancing past a marked one),
      provided MIN has elapsed.
    - Force-insert once MAX_SECONDS_BETWEEN_CHECKS have elapsed even without a
      section boundary (keeps the learner engaged on long monologues).
    """

    def __init__(
        self,
        min_seconds: float = MIN_SECONDS_BETWEEN_CHECKS,
        max_seconds: float = MAX_SECONDS_BETWEEN_CHECKS,
    ) -> None:
        self.min_seconds = min_seconds
        self.max_seconds = max_seconds

    def should_insert_checkpoint(
        self,
        elapsed_seconds_since_last: float,
        at_section_boundary: bool,
        is_last_segment: bool = False,
    ) -> CheckpointDecision:
        if is_last_segment:
            return CheckpointDecision(False, "last segment; skip")
        if elapsed_seconds_since_last < self.min_seconds:
            return CheckpointDecision(False, "below min interval")
        if at_section_boundary:
            return CheckpointDecision(True, "section boundary")
        if elapsed_seconds_since_last >= self.max_seconds:
            return CheckpointDecision(True, "max interval reached")
        return CheckpointDecision(False, "waiting for boundary or max")

    def generate_checkpoint(
        self,
        topic: str,
        segment_summary: str,
        include_mcq: bool = False,
        question: Optional[str] = None,
        options: Optional[List[str]] = None,
    ) -> dict:
        payload = {
            "segment_summary": segment_summary,
            "topic": topic,
            "allow_emoji": True,
        }
        if include_mcq and question and options:
            payload["question"] = question
            payload["options"] = options
        return payload
