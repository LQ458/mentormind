"""
Unit Tests – ContentValidator
==============================

Tests for backend/core/modules/content_validator.py covering:
- ValidationResult dataclass construction
- validate_content_completeness (short content, truncation, adequate content)
- _check_topic_coverage
- _assess_content_quality
- _find_incomplete_sentences
- _validate_syllabus
- _validate_storyboard
- _validate_render_plan
- _validate_consistency
- validate_generation_bundle
- validate_with_retry_suggestions
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from core.modules.content_validator import (
    ContentValidator,
    ValidationResult,
    validate_with_retry_suggestions,
)


# ─────────────────────────────────────────────────────────────────────────────
# Shared fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def validator() -> ContentValidator:
    return ContentValidator()


@pytest.fixture
def valid_syllabus() -> Dict[str, Any]:
    return {
        "title": "Introduction to Python",
        "big_idea": "Python is a versatile programming language used across many domains.",
        "chapters": [
            {"id": "ch1", "title": "Variables and Types", "learning_goal": "Understand basic data types."},
            {"id": "ch2", "title": "Control Flow", "learning_goal": "Master conditionals and loops."},
            {"id": "ch3", "title": "Functions", "learning_goal": "Write reusable code with functions."},
        ],
    }


@pytest.fixture
def valid_storyboard() -> Dict[str, Any]:
    long_narration = "A" * 100  # well above the 50-char minimum
    return {
        "title": "Introduction to Python",
        "scenes": [
            {"id": "s1", "narration": long_narration, "teaching_move": "hook"},
            {"id": "s2", "narration": long_narration, "teaching_move": "explain"},
            {"id": "s3", "narration": long_narration, "teaching_move": "recap"},
        ],
    }


@pytest.fixture
def valid_render_plan() -> Dict[str, Any]:
    long_narration = "B" * 100
    return {
        "title": "Introduction to Python",
        "scenes": [
            {"id": "s1", "narration": long_narration, "action": "show_title", "param": "Python", "duration": 45},
            {"id": "s2", "narration": long_narration, "action": "show_text", "param": "Variables", "duration": 45},
            {"id": "s3", "narration": long_narration, "action": "show_text", "param": "Functions", "duration": 45},
        ],
    }


@pytest.fixture
def valid_bundle(valid_syllabus, valid_storyboard, valid_render_plan) -> Dict[str, Any]:
    return {
        "syllabus": valid_syllabus,
        "storyboard": valid_storyboard,
        "render_plan": valid_render_plan,
    }


# ─────────────────────────────────────────────────────────────────────────────
# TestValidationResult
# ─────────────────────────────────────────────────────────────────────────────

class TestValidationResult:

    def test_construction_with_all_fields(self):
        result = ValidationResult(
            is_complete=True,
            issues=[],
            content_length=1200,
            completeness_score=0.95,
            suggested_fixes=[],
            metadata={"key": "value"},
        )
        assert result.is_complete is True
        assert result.issues == []
        assert result.content_length == 1200
        assert result.completeness_score == 0.95
        assert result.suggested_fixes == []
        assert result.metadata == {"key": "value"}

    def test_construction_incomplete_with_issues(self):
        result = ValidationResult(
            is_complete=False,
            issues=["Content too short"],
            content_length=100,
            completeness_score=0.2,
            suggested_fixes=["Generate longer content"],
            metadata={},
        )
        assert result.is_complete is False
        assert len(result.issues) == 1
        assert result.completeness_score == 0.2

    def test_default_metadata_is_dict(self):
        result = ValidationResult(
            is_complete=True,
            issues=[],
            content_length=0,
            completeness_score=1.0,
            suggested_fixes=[],
            metadata={},
        )
        assert isinstance(result.metadata, dict)


# ─────────────────────────────────────────────────────────────────────────────
# TestValidateContentCompleteness
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateContentCompleteness:

    def test_short_content_is_flagged(self, validator):
        short_content = "Python is a language."  # well below 500 chars
        result = validator.validate_content_completeness(short_content, "Python programming")
        assert result.is_complete is False
        assert any("too short" in issue for issue in result.issues)

    def test_truncation_indicator_ellipsis(self, validator):
        content = ("Python is a versatile language used in web development, data science, "
                   "machine learning, and automation. " * 10) + "..."
        result = validator.validate_content_completeness(content, "Python")
        assert any("truncated" in issue.lower() for issue in result.issues)

    def test_truncation_indicator_chinese(self, validator):
        base = "Python是一种通用编程语言，广泛用于数据科学和网络开发。 " * 15
        content = base + "等等"
        result = validator.validate_content_completeness(content, "Python")
        assert any("truncated" in issue.lower() for issue in result.issues)

    def test_truncation_indicator_bracket_ellipsis(self, validator):
        base = "Python programming covers variables, functions, classes, and modules. " * 10
        content = base + "[...]"
        result = validator.validate_content_completeness(content, "Python")
        assert any("truncated" in issue.lower() for issue in result.issues)

    def test_adequate_content_passes(self, validator):
        # Craft content that is long enough, on-topic, has intro/conclusion/examples,
        # and no truncation indicators.
        content = (
            "Welcome to today's lesson on Python programming. "
            "Python is a versatile, high-level programming language known for its readability. "
            "For example, you can write a Python function in just a few lines. "
            "Next, let's explore variables and data types in Python. "
            "Python supports integers, floats, strings, booleans, lists, dicts, tuples. "
            "Furthermore, Python has a rich ecosystem of libraries for data science. "
            "In conclusion, Python is an excellent first programming language. "
            "Thank you for joining this lesson on Python programming fundamentals. "
        ) * 5  # repeat to ensure length >= 500; no truncation indicators present
        result = validator.validate_content_completeness(content, "Python")
        assert result.is_complete is True
        assert result.issues == []

    def test_content_length_recorded(self, validator):
        content = "x" * 600 + " Python is great for programming tasks and data analysis."
        result = validator.validate_content_completeness(content, "Python")
        assert result.content_length > 0


# ─────────────────────────────────────────────────────────────────────────────
# TestCheckTopicCoverage
# ─────────────────────────────────────────────────────────────────────────────

class TestCheckTopicCoverage:

    def test_full_overlap_returns_one(self, validator):
        topic = "Python programming"
        content = "Python is a programming language."
        score = validator._check_topic_coverage(content, topic)
        assert score == 1.0

    def test_partial_overlap_between_zero_and_one(self, validator):
        topic = "Python data science machine learning"
        content = "Python is a popular programming language."
        score = validator._check_topic_coverage(content, topic)
        assert 0.0 < score < 1.0

    def test_empty_topic_returns_one(self, validator):
        score = validator._check_topic_coverage("Any content here.", "")
        assert score == 1.0

    def test_no_overlap_returns_zero(self, validator):
        topic = "quantum entanglement superposition"
        content = "apples oranges bananas fruits vegetables"
        score = validator._check_topic_coverage(content, topic)
        assert score == 0.0

    def test_case_insensitive_matching(self, validator):
        topic = "PYTHON PROGRAMMING"
        content = "python is a programming language"
        score = validator._check_topic_coverage(content, topic)
        assert score == 1.0


# ─────────────────────────────────────────────────────────────────────────────
# TestAssessContentQuality
# ─────────────────────────────────────────────────────────────────────────────

class TestAssessContentQuality:

    def test_welcome_scores_has_introduction(self, validator):
        content = "Welcome to this lesson."
        scores = validator._assess_content_quality(content)
        assert scores["has_introduction"] == 1.0

    def test_conclusion_scores_has_conclusion(self, validator):
        content = "In conclusion, we learned about Python."
        scores = validator._assess_content_quality(content)
        assert scores["has_conclusion"] == 1.0

    def test_example_scores_has_examples(self, validator):
        content = "For example, here is a simple function."
        scores = validator._assess_content_quality(content)
        assert scores["has_examples"] == 1.0

    def test_next_scores_has_transitions(self, validator):
        content = "Next, let's look at data types."
        scores = validator._assess_content_quality(content)
        assert scores["has_transitions"] == 1.0

    def test_overall_key_present(self, validator):
        content = "Some generic content without markers."
        scores = validator._assess_content_quality(content)
        assert "overall" in scores

    def test_all_markers_present_gives_high_overall(self, validator):
        content = (
            "Welcome to today's lesson. "
            "For example, Python is used everywhere. "
            "Next, let's dive deeper. "
            "In conclusion, thank you."
        )
        scores = validator._assess_content_quality(content)
        assert scores["overall"] == 1.0

    def test_no_markers_gives_zero_overall(self, validator):
        content = "generic text without any structural markers whatsoever"
        scores = validator._assess_content_quality(content)
        assert scores["overall"] == 0.0

    def test_introduction_via_hello_keyword(self, validator):
        # "hello" is matched by the has_introduction pattern
        content = "Hello everyone, let us begin."
        scores = validator._assess_content_quality(content)
        assert scores["has_introduction"] == 1.0

    def test_conclusion_via_thank_you_keyword(self, validator):
        # "thank you" is matched by the has_conclusion pattern
        content = "Thank you for watching this lesson."
        scores = validator._assess_content_quality(content)
        assert scores["has_conclusion"] == 1.0


# ─────────────────────────────────────────────────────────────────────────────
# TestFindIncompleteSentences
# ─────────────────────────────────────────────────────────────────────────────

class TestFindIncompleteSentences:

    def test_sentence_ending_with_and(self, validator):
        content = "Python supports integers and"
        incomplete = validator._find_incomplete_sentences(content)
        assert any("and" in s for s in incomplete)

    def test_sentence_ending_with_or(self, validator):
        content = "You can use Python or"
        incomplete = validator._find_incomplete_sentences(content)
        assert any("or" in s for s in incomplete)

    def test_sentence_ending_with_but(self, validator):
        content = "The code runs fast but"
        incomplete = validator._find_incomplete_sentences(content)
        assert any("but" in s for s in incomplete)

    def test_complete_sentences_not_flagged(self, validator):
        content = "Python is great. It is widely used. Many developers love it."
        incomplete = validator._find_incomplete_sentences(content)
        # None of these end with incomplete conjunctions
        conjunction_endings = {"and", "or", "but", "because", "so", "that"}
        for sentence in incomplete:
            last_word = sentence.strip().split()[-1].lower() if sentence.strip().split() else ""
            assert last_word not in conjunction_endings

    def test_empty_content_returns_empty_list(self, validator):
        incomplete = validator._find_incomplete_sentences("")
        assert incomplete == []

    def test_returns_list_type(self, validator):
        result = validator._find_incomplete_sentences("Some sentence.")
        assert isinstance(result, list)


# ─────────────────────────────────────────────────────────────────────────────
# TestValidateSyllabus
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateSyllabus:

    def test_missing_title_adds_issue(self, validator):
        syllabus = {
            "big_idea": "Some idea.",
            "chapters": [
                {"id": "ch1", "title": "Ch1", "learning_goal": "Goal 1"},
                {"id": "ch2", "title": "Ch2", "learning_goal": "Goal 2"},
            ],
        }
        result = validator._validate_syllabus(syllabus)
        assert any("title" in issue for issue in result.issues)

    def test_missing_big_idea_adds_issue(self, validator):
        syllabus = {
            "title": "Lesson",
            "chapters": [
                {"id": "ch1", "title": "Ch1", "learning_goal": "Goal 1"},
                {"id": "ch2", "title": "Ch2", "learning_goal": "Goal 2"},
            ],
        }
        result = validator._validate_syllabus(syllabus)
        assert any("big_idea" in issue for issue in result.issues)

    def test_missing_chapters_adds_issue(self, validator):
        syllabus = {"title": "Lesson", "big_idea": "An idea."}
        result = validator._validate_syllabus(syllabus)
        assert any("chapters" in issue for issue in result.issues)

    def test_too_few_chapters_adds_issue(self, validator):
        syllabus = {
            "title": "Lesson",
            "big_idea": "An idea.",
            "chapters": [
                {"id": "ch1", "title": "Ch1", "learning_goal": "Goal 1"},
            ],
        }
        result = validator._validate_syllabus(syllabus)
        assert any("too few chapters" in issue for issue in result.issues)

    def test_complete_syllabus_has_no_issues(self, validator, valid_syllabus):
        result = validator._validate_syllabus(valid_syllabus)
        assert result.issues == []
        assert result.is_complete is True

    def test_complete_syllabus_high_completeness_score(self, validator, valid_syllabus):
        result = validator._validate_syllabus(valid_syllabus)
        assert result.completeness_score >= 0.8

    def test_chapter_missing_learning_goal(self, validator):
        syllabus = {
            "title": "Lesson",
            "big_idea": "An idea.",
            "chapters": [
                {"id": "ch1", "title": "Ch1", "learning_goal": "Goal 1"},
                {"id": "ch2", "title": "Ch2"},  # missing learning_goal
            ],
        }
        result = validator._validate_syllabus(syllabus)
        assert any("learning_goal" in issue for issue in result.issues)


# ─────────────────────────────────────────────────────────────────────────────
# TestValidateStoryboard
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateStoryboard:

    def test_too_few_scenes_adds_issue(self, validator):
        storyboard = {
            "title": "Lesson",
            "scenes": [
                {"id": "s1", "narration": "A" * 60, "teaching_move": "hook"},
            ],
        }
        result = validator._validate_storyboard(storyboard)
        assert any("too few scenes" in issue for issue in result.issues)

    def test_short_narration_adds_issue(self, validator):
        storyboard = {
            "title": "Lesson",
            "scenes": [
                {"id": "s1", "narration": "Short", "teaching_move": "hook"},
                {"id": "s2", "narration": "Short", "teaching_move": "explain"},
                {"id": "s3", "narration": "Short", "teaching_move": "recap"},
            ],
        }
        result = validator._validate_storyboard(storyboard)
        assert any("narration too short" in issue for issue in result.issues)

    def test_missing_title_adds_issue(self, validator, valid_storyboard):
        storyboard = dict(valid_storyboard)
        del storyboard["title"]
        result = validator._validate_storyboard(storyboard)
        assert any("missing title" in issue for issue in result.issues)

    def test_valid_storyboard_has_no_issues(self, validator, valid_storyboard):
        result = validator._validate_storyboard(valid_storyboard)
        assert result.issues == []
        assert result.is_complete is True

    def test_scene_count_in_metadata(self, validator, valid_storyboard):
        result = validator._validate_storyboard(valid_storyboard)
        assert result.metadata["scene_count"] == len(valid_storyboard["scenes"])

    def test_truncated_narration_adds_issue(self, validator):
        storyboard = {
            "title": "Lesson",
            "scenes": [
                {"id": "s1", "narration": "A" * 60 + "...", "teaching_move": "hook"},
                {"id": "s2", "narration": "B" * 60, "teaching_move": "explain"},
                {"id": "s3", "narration": "C" * 60, "teaching_move": "recap"},
            ],
        }
        result = validator._validate_storyboard(storyboard)
        assert any("truncated" in issue for issue in result.issues)


# ─────────────────────────────────────────────────────────────────────────────
# TestValidateRenderPlan
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateRenderPlan:

    def test_duration_below_120_adds_issue(self, validator):
        render_plan = {
            "title": "Lesson",
            "scenes": [
                {"id": "s1", "narration": "A" * 60, "action": "show_title", "param": "Title", "duration": 30},
                {"id": "s2", "narration": "B" * 60, "action": "show_text", "param": "Text", "duration": 30},
                {"id": "s3", "narration": "C" * 60, "action": "show_text", "param": "Text2", "duration": 30},
            ],
        }
        result = validator._validate_render_plan(render_plan)
        assert any("duration too short" in issue for issue in result.issues)

    def test_missing_scene_fields_adds_issue(self, validator):
        render_plan = {
            "title": "Lesson",
            "scenes": [
                # Missing "action" and "param"
                {"id": "s1", "narration": "A" * 60, "duration": 50},
                {"id": "s2", "narration": "B" * 60, "action": "show_text", "param": "Text", "duration": 50},
                {"id": "s3", "narration": "C" * 60, "action": "show_text", "param": "Text2", "duration": 50},
            ],
        }
        result = validator._validate_render_plan(render_plan)
        assert any("missing" in issue for issue in result.issues)

    def test_valid_render_plan_has_no_issues(self, validator, valid_render_plan):
        result = validator._validate_render_plan(valid_render_plan)
        assert result.issues == []
        assert result.is_complete is True

    def test_total_duration_in_metadata(self, validator, valid_render_plan):
        result = validator._validate_render_plan(valid_render_plan)
        # 3 scenes × 45s each = 135s
        assert result.metadata["total_duration"] == pytest.approx(135.0)

    def test_too_few_scenes_adds_issue(self, validator):
        render_plan = {
            "title": "Lesson",
            "scenes": [
                {"id": "s1", "narration": "A" * 60, "action": "show_title", "param": "Title", "duration": 130},
            ],
        }
        result = validator._validate_render_plan(render_plan)
        assert any("too few scenes" in issue for issue in result.issues)

    def test_scene_count_in_metadata(self, validator, valid_render_plan):
        result = validator._validate_render_plan(valid_render_plan)
        assert result.metadata["scene_count"] == 3


# ─────────────────────────────────────────────────────────────────────────────
# TestValidateConsistency
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateConsistency:

    def test_mismatched_titles_adds_issue(self, validator, valid_storyboard, valid_render_plan):
        syllabus = {"title": "Different Title"}
        issues, fixes = validator._validate_consistency(syllabus, valid_storyboard, valid_render_plan)
        assert any("Inconsistent titles" in issue for issue in issues)
        assert len(fixes) > 0

    def test_aligned_titles_no_issue(self, validator, valid_syllabus, valid_storyboard, valid_render_plan):
        issues, fixes = validator._validate_consistency(valid_syllabus, valid_storyboard, valid_render_plan)
        title_issues = [i for i in issues if "title" in i.lower()]
        assert title_issues == []

    def test_large_scene_count_mismatch_adds_issue(self, validator, valid_syllabus):
        storyboard = {
            "title": "Introduction to Python",
            "scenes": [{"id": f"s{i}", "narration": "x", "teaching_move": "m"} for i in range(3)],
        }
        render_plan = {
            "title": "Introduction to Python",
            "scenes": [
                {"id": f"r{i}", "narration": "x", "action": "show_text", "param": "p", "duration": 20}
                for i in range(10)
            ],
        }
        issues, fixes = validator._validate_consistency(valid_syllabus, storyboard, render_plan)
        assert any("mismatch" in issue.lower() for issue in issues)

    def test_small_scene_variation_is_acceptable(self, validator, valid_syllabus, valid_storyboard, valid_render_plan):
        # storyboard has 3 scenes, render_plan has 3 scenes — difference is 0, well within tolerance
        issues, _ = validator._validate_consistency(valid_syllabus, valid_storyboard, valid_render_plan)
        scene_issues = [i for i in issues if "mismatch" in i.lower()]
        assert scene_issues == []

    def test_returns_tuple_of_two_lists(self, validator, valid_syllabus, valid_storyboard, valid_render_plan):
        result = validator._validate_consistency(valid_syllabus, valid_storyboard, valid_render_plan)
        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], list)
        assert isinstance(result[1], list)


# ─────────────────────────────────────────────────────────────────────────────
# TestValidateGenerationBundle
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateGenerationBundle:

    def test_complete_bundle_is_complete(self, validator, valid_bundle):
        result = validator.validate_generation_bundle(valid_bundle)
        assert result.is_complete is True
        assert result.issues == []

    def test_complete_bundle_high_completeness_score(self, validator, valid_bundle):
        result = validator.validate_generation_bundle(valid_bundle)
        assert result.completeness_score >= 0.8

    def test_incomplete_bundle_not_complete(self, validator):
        bundle = {
            "syllabus": {},   # empty — will generate issues
            "storyboard": {},
            "render_plan": {},
        }
        result = validator.validate_generation_bundle(bundle)
        assert result.is_complete is False
        assert len(result.issues) > 0

    def test_none_components_treated_as_empty(self, validator):
        bundle = {"syllabus": None, "storyboard": None, "render_plan": None}
        result = validator.validate_generation_bundle(bundle)
        assert result.is_complete is False

    def test_missing_keys_treated_as_empty(self, validator):
        result = validator.validate_generation_bundle({})
        assert result.is_complete is False

    def test_metadata_contains_scores(self, validator, valid_bundle):
        result = validator.validate_generation_bundle(valid_bundle)
        assert "syllabus_score" in result.metadata
        assert "storyboard_score" in result.metadata
        assert "render_plan_score" in result.metadata

    def test_metadata_total_scenes(self, validator, valid_bundle):
        result = validator.validate_generation_bundle(valid_bundle)
        assert result.metadata["total_scenes"] == 3

    def test_inconsistent_titles_flagged(self, validator, valid_syllabus, valid_storyboard, valid_render_plan):
        valid_syllabus = dict(valid_syllabus)
        valid_syllabus["title"] = "A Totally Different Title"
        bundle = {
            "syllabus": valid_syllabus,
            "storyboard": valid_storyboard,
            "render_plan": valid_render_plan,
        }
        result = validator.validate_generation_bundle(bundle)
        assert any("Inconsistent titles" in issue for issue in result.issues)


# ─────────────────────────────────────────────────────────────────────────────
# TestValidateWithRetrySuggestions
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateWithRetrySuggestions:

    def test_valid_bundle_returns_true(self, valid_bundle):
        is_valid, suggestions, metadata = validate_with_retry_suggestions(valid_bundle)
        assert is_valid is True

    def test_valid_bundle_empty_suggestions(self, valid_bundle):
        is_valid, suggestions, metadata = validate_with_retry_suggestions(valid_bundle)
        assert suggestions == []

    def test_invalid_bundle_returns_false(self):
        bundle = {"syllabus": {}, "storyboard": {}, "render_plan": {}}
        is_valid, suggestions, metadata = validate_with_retry_suggestions(bundle)
        assert is_valid is False

    def test_invalid_bundle_has_suggestions(self):
        bundle = {"syllabus": {}, "storyboard": {}, "render_plan": {}}
        is_valid, suggestions, metadata = validate_with_retry_suggestions(bundle)
        assert len(suggestions) > 0

    def test_returns_tuple_of_three(self, valid_bundle):
        result = validate_with_retry_suggestions(valid_bundle)
        assert isinstance(result, tuple)
        assert len(result) == 3

    def test_metadata_contains_completeness_score(self, valid_bundle):
        _, _, metadata = validate_with_retry_suggestions(valid_bundle)
        assert "completeness_score" in metadata

    def test_metadata_contains_issue_count(self):
        bundle = {"syllabus": {}, "storyboard": {}, "render_plan": {}}
        _, _, metadata = validate_with_retry_suggestions(bundle)
        assert "issue_count" in metadata
        assert metadata["issue_count"] > 0

    def test_metadata_contains_content_length(self, valid_bundle):
        _, _, metadata = validate_with_retry_suggestions(valid_bundle)
        assert "content_length" in metadata

    def test_max_retry_attempts_parameter_accepted(self, valid_bundle):
        # Verify the function accepts max_retry_attempts without error
        result = validate_with_retry_suggestions(valid_bundle, max_retry_attempts=5)
        assert isinstance(result, tuple)

    def test_low_completeness_score_triggers_regeneration_suggestion(self):
        # A near-empty bundle will have completeness_score well below 1.0 and suggestions
        bundle = {"syllabus": {}, "storyboard": {}, "render_plan": {}}
        _, suggestions, metadata = validate_with_retry_suggestions(bundle)
        assert metadata["completeness_score"] < 1.0
        # validate_with_retry_suggestions propagates suggested_fixes as retry suggestions
        assert len(suggestions) > 0
