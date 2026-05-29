"""
Content Validation System
Ensures generated content is complete and meets quality standards
"""

import re
import logging
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """Content validation result"""
    is_complete: bool
    issues: List[str]
    content_length: int
    completeness_score: float
    suggested_fixes: List[str]
    metadata: Dict[str, Any]


class ContentValidator:
    """Validates content completeness and quality"""
    
    def __init__(self):
        # Indicators that content has been truncated
        self.truncation_indicators = [
            "...", 
            "...truncated", 
            "[continued]", 
            "etc.",
            "[...]",
            "and so on",
            "and more",
            "继续...",  # Chinese
            "等等",     # Chinese
            "省略",     # Chinese
            "未完",     # Chinese
        ]
        
        # Minimum content thresholds
        self.min_content_length = 500  # Minimum characters for complete content
        self.min_scene_count = 3      # Minimum number of scenes
        self.min_narration_length = 50  # Minimum narration per scene
        
        # Quality patterns
        self.quality_patterns = {
            "has_introduction": [
                r"\b(welcome|hello|today|let.?s start|开始|欢迎|大家好)\b",
                r"\b(introduction|intro|beginning|开场|介绍)\b"
            ],
            "has_conclusion": [
                r"\b(conclusion|summary|recap|finally|in summary|总结|最后|结论)\b",
                r"\b(thank you|thanks|谢谢|感谢)\b"
            ],
            "has_examples": [
                r"\b(example|for instance|let.?s see|比如|例如|举例)\b",
                r"\b(demonstration|demo|演示)\b"
            ],
            "has_transitions": [
                r"\b(next|now|then|moving on|接下来|现在|然后)\b",
                r"\b(furthermore|additionally|另外|此外)\b"
            ]
        }
    
    def validate_generation_bundle(self, bundle: Dict[str, Any]) -> ValidationResult:
        """Validate complete generation bundle"""
        issues = []
        suggested_fixes = []
        metadata = {}
        
        # Extract key components (use `or {}` because value may be explicitly None)
        syllabus = bundle.get("syllabus") or {}
        storyboard = bundle.get("storyboard") or {}
        render_plan = bundle.get("render_plan") or {}
        
        # Validate each component
        syllabus_result = self._validate_syllabus(syllabus)
        storyboard_result = self._validate_storyboard(storyboard)
        render_plan_result = self._validate_render_plan(render_plan)
        
        # Combine results
        all_issues = syllabus_result.issues + storyboard_result.issues + render_plan_result.issues
        all_fixes = syllabus_result.suggested_fixes + storyboard_result.suggested_fixes + render_plan_result.suggested_fixes
        
        # Calculate overall completeness
        total_length = (
            syllabus_result.content_length + 
            storyboard_result.content_length + 
            render_plan_result.content_length
        )
        
        overall_score = (
            syllabus_result.completeness_score + 
            storyboard_result.completeness_score + 
            render_plan_result.completeness_score
        ) / 3
        
        # Check for cross-component consistency
        consistency_issues, consistency_fixes = self._validate_consistency(syllabus, storyboard, render_plan)
        all_issues.extend(consistency_issues)
        all_fixes.extend(consistency_fixes)
        
        metadata.update({
            "syllabus_score": syllabus_result.completeness_score,
            "storyboard_score": storyboard_result.completeness_score,
            "render_plan_score": render_plan_result.completeness_score,
            "total_scenes": len(render_plan.get("scenes", [])),
            "has_truncation": any("truncation" in issue for issue in all_issues)
        })
        
        is_complete = len(all_issues) == 0 and overall_score >= 0.8
        
        return ValidationResult(
            is_complete=is_complete,
            issues=all_issues,
            content_length=total_length,
            completeness_score=overall_score,
            suggested_fixes=all_fixes,
            metadata=metadata
        )
    
    def validate_content_completeness(self, content: str, topic: str) -> ValidationResult:
        """Validate content completeness for a given topic"""
        issues = []
        suggested_fixes = []
        metadata = {}
        
        content_length = len(content.strip())
        
        # Check for truncation indicators
        for indicator in self.truncation_indicators:
            if indicator.lower() in content.lower():
                issues.append(f"Content appears truncated (found: '{indicator}')")
                suggested_fixes.append("Request complete content generation without truncation")
        
        # Check content length
        if content_length < self.min_content_length:
            issues.append(f"Content too short ({content_length} chars, minimum {self.min_content_length})")
            suggested_fixes.append("Generate longer, more detailed content")
        
        # Check topic coverage
        topic_coverage = self._check_topic_coverage(content, topic)
        if topic_coverage < 0.6:
            issues.append(f"Content does not adequately cover the topic '{topic}' (coverage: {topic_coverage:.1%})")
            suggested_fixes.append(f"Ensure content includes key aspects of {topic}")
        
        # Check for quality markers
        quality_score = self._assess_content_quality(content)
        metadata["quality_markers"] = quality_score
        
        if quality_score["overall"] < 0.5:
            issues.append("Content lacks educational structure (missing introduction/examples/conclusion)")
            suggested_fixes.append("Add clear introduction, examples, and conclusion")
        
        # Check for incomplete sentences
        incomplete_sentences = self._find_incomplete_sentences(content)
        if incomplete_sentences:
            issues.append(f"Found {len(incomplete_sentences)} incomplete sentences")
            suggested_fixes.append("Complete all partial sentences")
        
        completeness_score = self._calculate_completeness_score(content, topic, len(issues))
        
        return ValidationResult(
            is_complete=len(issues) == 0 and completeness_score >= 0.8,
            issues=issues,
            content_length=content_length,
            completeness_score=completeness_score,
            suggested_fixes=suggested_fixes,
            metadata=metadata
        )
    
    def _validate_syllabus(self, syllabus: Dict[str, Any]) -> ValidationResult:
        """Validate syllabus completeness"""
        issues = []
        suggested_fixes = []
        
        # Required fields
        required_fields = ["title", "big_idea", "chapters"]
        for field in required_fields:
            if not syllabus.get(field):
                issues.append(f"Missing required syllabus field: {field}")
                suggested_fixes.append(f"Add {field} to syllabus")
        
        # Check chapters
        chapters = syllabus.get("chapters", [])
        if len(chapters) < 2:
            issues.append("Syllabus has too few chapters")
            suggested_fixes.append("Add more chapters for comprehensive coverage")
        
        # Check chapter completeness
        for i, chapter in enumerate(chapters):
            if not isinstance(chapter, dict):
                issues.append(f"Chapter {i+1} is not properly structured")
                continue
            
            required_chapter_fields = ["id", "title", "learning_goal"]
            for field in required_chapter_fields:
                if not chapter.get(field):
                    issues.append(f"Chapter {i+1} missing {field}")
                    suggested_fixes.append(f"Add {field} to chapter {i+1}")
        
        # Calculate content length
        syllabus_text = str(syllabus.get("big_idea", "")) + " ".join(
            str(ch.get("learning_goal", "")) for ch in chapters if isinstance(ch, dict)
        )
        content_length = len(syllabus_text)
        
        completeness_score = max(0.0, 1.0 - len(issues) * 0.2)
        
        return ValidationResult(
            is_complete=len(issues) == 0,
            issues=issues,
            content_length=content_length,
            completeness_score=completeness_score,
            suggested_fixes=suggested_fixes,
            metadata={"chapter_count": len(chapters)}
        )
    
    def _validate_storyboard(self, storyboard: Dict[str, Any]) -> ValidationResult:
        """Validate storyboard completeness"""
        issues = []
        suggested_fixes = []
        
        # Check required fields
        if not storyboard.get("title"):
            issues.append("Storyboard missing title")
            suggested_fixes.append("Add title to storyboard")
        
        # Check scenes
        scenes = storyboard.get("scenes", [])
        if len(scenes) < self.min_scene_count:
            issues.append(f"Storyboard has too few scenes ({len(scenes)}, minimum {self.min_scene_count})")
            suggested_fixes.append("Add more scenes for complete story")
        
        # Validate individual scenes
        total_narration_length = 0
        for i, scene in enumerate(scenes):
            scene_issues = self._validate_scene(scene, i+1)
            issues.extend(scene_issues)
            
            narration = scene.get("narration", "")
            total_narration_length += len(narration)
            
            if len(narration) < self.min_narration_length:
                issues.append(f"Scene {i+1} narration too short ({len(narration)} chars)")
                suggested_fixes.append(f"Expand narration for scene {i+1}")
        
        # Check for truncation in narration
        for i, scene in enumerate(scenes):
            narration = scene.get("narration", "")
            for indicator in self.truncation_indicators:
                if indicator in narration:
                    issues.append(f"Scene {i+1} narration appears truncated")
                    suggested_fixes.append(f"Complete narration for scene {i+1}")
                    break
        
        completeness_score = max(0.0, 1.0 - len(issues) * 0.1)
        
        return ValidationResult(
            is_complete=len(issues) == 0,
            issues=issues,
            content_length=total_narration_length,
            completeness_score=completeness_score,
            suggested_fixes=suggested_fixes,
            metadata={
                "scene_count": len(scenes),
                "avg_narration_length": total_narration_length / max(1, len(scenes))
            }
        )
    
    def _validate_render_plan(self, render_plan: Dict[str, Any]) -> ValidationResult:
        """Validate render plan completeness"""
        issues = []
        suggested_fixes = []
        
        # Check required fields
        if not render_plan.get("title"):
            issues.append("Render plan missing title")
            suggested_fixes.append("Add title to render plan")
        
        # Check scenes
        scenes = render_plan.get("scenes", [])
        if len(scenes) < self.min_scene_count:
            issues.append(f"Render plan has too few scenes ({len(scenes)}, minimum {self.min_scene_count})")
            suggested_fixes.append("Add more scenes for complete video")
        
        total_narration_length = 0
        total_duration = 0
        
        # Validate individual scenes
        for i, scene in enumerate(scenes):
            scene_issues = self._validate_render_scene(scene, i+1)
            issues.extend(scene_issues)
            
            narration = scene.get("narration", "")
            total_narration_length += len(narration)
            
            duration = scene.get("duration", 0)
            try:
                total_duration += float(duration)
            except (ValueError, TypeError):
                issues.append(f"Scene {i+1} has invalid duration: {duration}")
        
        # Check minimum video duration (should be at least 2 minutes)
        if total_duration < 120:
            issues.append(f"Total video duration too short ({total_duration:.1f}s, minimum 120s)")
            suggested_fixes.append("Increase scene durations or add more content")
        
        completeness_score = max(0.0, 1.0 - len(issues) * 0.1)
        
        return ValidationResult(
            is_complete=len(issues) == 0,
            issues=issues,
            content_length=total_narration_length,
            completeness_score=completeness_score,
            suggested_fixes=suggested_fixes,
            metadata={
                "scene_count": len(scenes),
                "total_duration": total_duration,
                "avg_scene_duration": total_duration / max(1, len(scenes))
            }
        )
    
    def _validate_scene(self, scene: Dict[str, Any], scene_num: int) -> List[str]:
        """Validate individual storyboard scene"""
        issues = []
        
        required_fields = ["id", "narration", "teaching_move"]
        for field in required_fields:
            if not scene.get(field):
                issues.append(f"Scene {scene_num} missing {field}")
        
        return issues
    
    def _validate_render_scene(self, scene: Dict[str, Any], scene_num: int) -> List[str]:
        """Validate individual render scene"""
        issues = []
        
        required_fields = ["id", "narration", "action", "param"]
        for field in required_fields:
            if not scene.get(field):
                issues.append(f"Scene {scene_num} missing {field}")
        
        # Check for truncated narration
        narration = scene.get("narration", "")
        for indicator in self.truncation_indicators:
            if indicator in narration:
                issues.append(f"Scene {scene_num} narration truncated")
                break
        
        return issues
    
    def _validate_consistency(
        self, 
        syllabus: Dict[str, Any], 
        storyboard: Dict[str, Any], 
        render_plan: Dict[str, Any]
    ) -> Tuple[List[str], List[str]]:
        """Validate consistency across components"""
        issues = []
        fixes = []
        
        # Check title consistency
        syllabus_title = syllabus.get("title", "").strip()
        storyboard_title = storyboard.get("title", "").strip()
        render_title = render_plan.get("title", "").strip()
        
        titles = [t for t in [syllabus_title, storyboard_title, render_title] if t]
        if len(set(titles)) > 1:
            issues.append("Inconsistent titles across components")
            fixes.append("Align titles across syllabus, storyboard, and render plan")
        
        # Check scene count consistency
        storyboard_scenes = len(storyboard.get("scenes", []))
        render_scenes = len(render_plan.get("scenes", []))
        
        if abs(storyboard_scenes - render_scenes) > 2:  # Allow some variation
            issues.append(f"Scene count mismatch: storyboard({storyboard_scenes}) vs render({render_scenes})")
            fixes.append("Align scene counts between storyboard and render plan")
        
        return issues, fixes
    
    def _check_topic_coverage(self, content: str, topic: str) -> float:
        """Check how well content covers the given topic"""
        topic_words = set(re.findall(r'\b\w+\b', topic.lower()))
        content_words = set(re.findall(r'\b\w+\b', content.lower()))
        
        if not topic_words:
            return 1.0
        
        overlap = len(topic_words.intersection(content_words))
        return overlap / len(topic_words)
    
    def _assess_content_quality(self, content: str) -> Dict[str, float]:
        """Assess content quality based on educational markers"""
        scores = {}
        
        for marker, patterns in self.quality_patterns.items():
            score = 0.0
            for pattern in patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    score = 1.0
                    break
            scores[marker] = score
        
        scores["overall"] = sum(scores.values()) / len(scores)
        return scores
    
    def _find_incomplete_sentences(self, content: str) -> List[str]:
        """Find sentences that appear incomplete"""
        incomplete = []
        
        # Split into sentences
        sentences = re.split(r'[.!?]+', content)
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            
            # Check for common incomplete patterns
            if (
                len(sentence) < 10 or  # Very short
                sentence.endswith(('and', 'or', 'but', 'because', 'so', 'that')) or
                sentence.endswith(('的', '了', '和', '或者', '但是'))  # Chinese incomplete endings
            ):
                incomplete.append(sentence)
        
        return incomplete
    
    def _calculate_completeness_score(self, content: str, topic: str, issue_count: int) -> float:
        """Calculate overall completeness score"""
        score = 1.0
        
        # Reduce score for issues
        score -= issue_count * 0.1
        
        # Reduce score for truncation indicators
        for indicator in self.truncation_indicators:
            if indicator.lower() in content.lower():
                score -= 0.3
        
        # Score based on length (optimal around 1500 chars)
        length_score = min(1.0, len(content) / 1500)
        score *= length_score
        
        # Score based on topic coverage
        coverage_score = self._check_topic_coverage(content, topic)
        score *= coverage_score
        
        return max(0.0, min(1.0, score))
    
    def suggest_content_improvements(self, content: str, topic: str) -> List[str]:
        """Suggest specific improvements for content"""
        suggestions = []
        
        validation = self.validate_content_completeness(content, topic)
        
        if not validation.is_complete:
            suggestions.extend(validation.suggested_fixes)
        
        # Additional suggestions based on content analysis
        quality_markers = validation.metadata.get("quality_markers", {})
        
        if not quality_markers.get("has_introduction"):
            suggestions.append("Add a clear introduction to set context")
        
        if not quality_markers.get("has_examples"):
            suggestions.append("Include concrete examples to illustrate concepts")
        
        if not quality_markers.get("has_conclusion"):
            suggestions.append("Add a summary or conclusion section")
        
        if validation.content_length < 800:
            suggestions.append("Expand content with more detailed explanations")
        
        return suggestions


# Utility function for integration with existing pipeline
def validate_with_retry_suggestions(
    bundle: Dict[str, Any], 
    max_retry_attempts: int = 3
) -> Tuple[bool, List[str], Dict[str, Any]]:
    """
    Validate bundle and provide retry suggestions if validation fails
    
    Returns:
        (is_valid, retry_suggestions, validation_metadata)
    """
    validator = ContentValidator()
    result = validator.validate_generation_bundle(bundle)
    
    retry_suggestions = []
    if not result.is_complete:
        # Generate specific retry instructions
        if result.metadata.get("has_truncation"):
            retry_suggestions.append("Increase max_tokens parameter to prevent truncation")
            retry_suggestions.append("Use temperature=0.3 for more focused generation")
        
        if result.metadata.get("total_scenes", 0) < 5:
            retry_suggestions.append("Request more detailed scene breakdown")
        
        if result.completeness_score < 0.5:
            retry_suggestions.append("Request complete regeneration with explicit requirements")
        
        # Add general improvement suggestions
        retry_suggestions.extend(result.suggested_fixes[:3])  # Top 3 fixes
    
    return (
        result.is_complete,
        retry_suggestions,
        {
            "completeness_score": result.completeness_score,
            "issue_count": len(result.issues),
            "content_length": result.content_length,
            **result.metadata
        }
    )