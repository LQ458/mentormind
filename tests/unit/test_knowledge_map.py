"""Unit tests for knowledge map graph algorithms."""

import pytest
from core.knowledge.extractor import _compute_proficiency, _compute_learning_path


class TestComputeProficiency:
    def test_minimum(self):
        assert _compute_proficiency(0.5) == 0.1

    def test_one_lesson(self):
        assert _compute_proficiency(1) == 0.2

    def test_three_lessons(self):
        assert _compute_proficiency(3) == 0.6

    def test_mastery_threshold(self):
        assert _compute_proficiency(5) == 1.0

    def test_capped_at_one(self):
        assert _compute_proficiency(10) == 1.0

    def test_zero_floor(self):
        assert _compute_proficiency(0) == 0.0


class TestComputeLearningPath:
    _NODES = [
        {"id": "a", "name": "Limits", "lesson_count": 3, "subject": "math"},
        {"id": "b", "name": "Derivatives", "lesson_count": 3, "subject": "math"},
        {"id": "c", "name": "Integrals", "lesson_count": 3, "subject": "math"},
    ]

    def test_linear_chain_topological_order(self):
        edges = [
            {"from": "a", "to": "b", "kind": "prerequisite", "weight": 0.8},
            {"from": "b", "to": "c", "kind": "prerequisite", "weight": 0.9},
        ]
        path = _compute_learning_path(self._NODES, edges)
        assert len(path) == 3
        assert [p["name"] for p in path] == ["Limits", "Derivatives", "Integrals"]
        assert path[0]["order_index"] == 0
        assert path[1]["order_index"] == 1
        assert path[2]["order_index"] == 2

    def test_empty_nodes(self):
        assert _compute_learning_path([], []) == []

    def test_empty_edges(self):
        assert _compute_learning_path(self._NODES, []) == []

    def test_filters_non_prerequisite_edges(self):
        edges = [{"from": "a", "to": "b", "kind": "related_to", "weight": 0.8}]
        path = _compute_learning_path(self._NODES, edges)
        assert path == []

    def test_filters_low_weight_edges(self):
        edges = [{"from": "a", "to": "b", "kind": "prerequisite", "weight": 0.3}]
        path = _compute_learning_path(self._NODES, edges)
        assert path == []

    def test_filters_low_lesson_count_nodes(self):
        nodes = [
            {"id": "a", "name": "Low", "lesson_count": 1, "subject": "math"},
            {"id": "b", "name": "Low2", "lesson_count": 1, "subject": "math"},
        ]
        edges = [{"from": "a", "to": "b", "kind": "prerequisite", "weight": 0.8}]
        path = _compute_learning_path(nodes, edges)
        assert path == []

    def test_filters_cross_subject(self):
        nodes = [
            {"id": "a", "name": "Math", "lesson_count": 3, "subject": "math"},
            {"id": "b", "name": "Bio", "lesson_count": 3, "subject": "biology"},
        ]
        edges = [{"from": "a", "to": "b", "kind": "prerequisite", "weight": 0.8}]
        path = _compute_learning_path(nodes, edges)
        assert path == []

    def test_handles_cycle(self):
        nodes = [
            {"id": "a", "name": "Limits", "lesson_count": 3, "subject": "math"},
            {"id": "b", "name": "Derivatives", "lesson_count": 3, "subject": "math"},
        ]
        edges = [
            {"from": "a", "to": "b", "kind": "prerequisite", "weight": 0.8},
            {"from": "b", "to": "a", "kind": "prerequisite", "weight": 0.3},
        ]
        path = _compute_learning_path(nodes, edges)
        assert len(path) == 2

    def test_includes_proficiency_in_path(self):
        edges = [{"from": "a", "to": "b", "kind": "prerequisite", "weight": 0.8}]
        path = _compute_learning_path(self._NODES, edges)
        assert len(path) >= 1
        assert "proficiency" in path[0]
        assert 0 <= path[0]["proficiency"] <= 1.0

    def test_diamond_dependency(self):
        nodes = [
            {"id": "a", "name": "Limits", "lesson_count": 3, "subject": "math"},
            {"id": "b", "name": "Derivatives", "lesson_count": 3, "subject": "math"},
            {"id": "c", "name": "Integrals", "lesson_count": 3, "subject": "math"},
            {"id": "d", "name": "Advanced Calc", "lesson_count": 3, "subject": "math"},
        ]
        edges = [
            {"from": "a", "to": "b", "kind": "prerequisite", "weight": 0.8},
            {"from": "a", "to": "c", "kind": "prerequisite", "weight": 0.7},
            {"from": "b", "to": "d", "kind": "prerequisite", "weight": 0.9},
            {"from": "c", "to": "d", "kind": "prerequisite", "weight": 0.9},
        ]
        path = _compute_learning_path(nodes, edges)
        assert len(path) == 4
        assert path[0]["name"] == "Limits"
        assert path[-1]["name"] == "Advanced Calc"
        assert path[1]["name"] in ("Derivatives", "Integrals")
        assert path[2]["name"] in ("Derivatives", "Integrals")
