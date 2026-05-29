# MentorMind Video Generation Improvement Roadmap

## Overview

This document provides a detailed implementation roadmap for fixing the critical issues identified in the video generation system. Each phase includes specific code changes, file modifications, and technical implementation details.

## Phase 1: Critical Fixes (Week 1-2)

### 1.1 Implement Connectivity Resilience Patterns

#### 1.1.1 Add Exponential Backoff with Jitter

**File:** `backend/services/api_client.py`

```python
import asyncio
import random
from typing import Any, Callable, Optional
from functools import wraps

class APIRetryManager:
    def __init__(self, max_retries: int = 5, base_delay: float = 1.0):
        self.max_retries = max_retries
        self.base_delay = base_delay
    
    async def retry_with_backoff(
        self, 
        func: Callable, 
        *args, 
        retry_on_exceptions: tuple = (Exception,),
        **kwargs
    ) -> Any:
        """Retry function with exponential backoff and jitter"""
        for attempt in range(self.max_retries):
            try:
                return await func(*args, **kwargs)
            except retry_on_exceptions as e:
                if attempt == self.max_retries - 1:
                    logger.error(f"Max retries exceeded for {func.__name__}: {e}")
                    raise
                
                # Calculate delay with jitter
                jitter = random.uniform(0, 0.1)
                delay = (self.base_delay * (2 ** attempt)) + jitter
                capped_delay = min(delay, 30)  # Cap at 30 seconds
                
                logger.warning(f"Attempt {attempt + 1} failed for {func.__name__}: {e}. Retrying in {capped_delay:.2f}s")
                await asyncio.sleep(capped_delay)

# Add to APIClient class
class APIClient:
    def __init__(self):
        # ... existing init ...
        self.retry_manager = APIRetryManager()
    
    async def call_deepseek_with_retry(self, messages, **kwargs):
        return await self.retry_manager.retry_with_backoff(
            self._call_deepseek_raw,
            messages,
            retry_on_exceptions=(requests.exceptions.RequestException, ConnectionError),
            **kwargs
        )
```

#### 1.1.2 Implement Circuit Breaker Pattern

**File:** `backend/services/circuit_breaker.py` (NEW)

```python
import time
import logging
from enum import Enum
from typing import Callable, Any
from dataclasses import dataclass

class CircuitState(Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"

@dataclass
class CircuitBreakerConfig:
    failure_threshold: int = 5
    success_threshold: int = 2
    timeout_duration: int = 60
    
class CircuitBreaker:
    def __init__(self, config: CircuitBreakerConfig):
        self.config = config
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = None
        self.logger = logging.getLogger(__name__)
    
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self.state = CircuitState.HALF_OPEN
                self.logger.info(f"Circuit breaker transitioning to HALF_OPEN for {func.__name__}")
            else:
                raise Exception(f"Circuit breaker is OPEN for {func.__name__}")
        
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise
    
    def _should_attempt_reset(self) -> bool:
        return (
            self.last_failure_time and 
            time.time() - self.last_failure_time >= self.config.timeout_duration
        )
    
    def _on_success(self):
        self.failure_count = 0
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.config.success_threshold:
                self.state = CircuitState.CLOSED
                self.success_count = 0
                self.logger.info("Circuit breaker reset to CLOSED")
    
    def _on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        self.success_count = 0
        
        if self.failure_count >= self.config.failure_threshold:
            self.state = CircuitState.OPEN
            self.logger.warning(f"Circuit breaker opened after {self.failure_count} failures")
```

#### 1.1.3 Multi-Provider API Fallback

**File:** `backend/services/fallback_provider.py` (NEW)

```python
from typing import List, Dict, Any, Optional
import logging

class APIProvider:
    def __init__(self, name: str, client_func: callable, priority: int = 0):
        self.name = name
        self.client_func = client_func
        self.priority = priority
        self.circuit_breaker = CircuitBreaker(CircuitBreakerConfig())

class FallbackAPIManager:
    def __init__(self):
        self.providers: List[APIProvider] = []
        self.logger = logging.getLogger(__name__)
    
    def register_provider(self, provider: APIProvider):
        self.providers.append(provider)
        self.providers.sort(key=lambda p: p.priority)
    
    async def call_with_fallback(
        self, 
        messages: List[Dict], 
        **kwargs
    ) -> Dict[str, Any]:
        last_exception = None
        
        for provider in self.providers:
            try:
                self.logger.info(f"Attempting API call with {provider.name}")
                result = await provider.circuit_breaker.call(
                    provider.client_func, 
                    messages, 
                    **kwargs
                )
                self.logger.info(f"Success with {provider.name}")
                return result
                
            except Exception as e:
                self.logger.warning(f"Failed with {provider.name}: {e}")
                last_exception = e
                continue
        
        # All providers failed
        raise Exception(f"All API providers failed. Last error: {last_exception}")

# Usage in robust_video_generation.py
fallback_manager = FallbackAPIManager()
fallback_manager.register_provider(APIProvider("DeepSeek", deepseek_call, priority=1))
fallback_manager.register_provider(APIProvider("OpenAI", openai_call, priority=2))
fallback_manager.register_provider(APIProvider("Claude", claude_call, priority=3))
```

### 1.2 Fix Script Content Truncation

#### 1.2.1 Implement Content Completeness Validation

**File:** `backend/core/modules/robust_video_generation.py`

```python
class ContentValidator:
    def __init__(self):
        self.truncation_indicators = ["...", "...truncated", "[continued]", "etc."]
        self.min_content_length = 500  # Minimum characters for complete content
    
    def validate_content_completeness(self, content: str, topic: str) -> Dict[str, Any]:
        issues = []
        
        # Check for truncation indicators
        for indicator in self.truncation_indicators:
            if indicator in content.lower():
                issues.append(f"Content appears truncated (found: '{indicator}')")
        
        # Check content length
        if len(content.strip()) < self.min_content_length:
            issues.append(f"Content too short ({len(content)} chars, minimum {self.min_content_length})")
        
        # Check if content covers the topic adequately
        if not self._covers_topic_adequately(content, topic):
            issues.append("Content does not adequately cover the specified topic")
        
        return {
            "is_complete": len(issues) == 0,
            "issues": issues,
            "content_length": len(content),
            "estimated_completeness_score": self._calculate_completeness_score(content, topic)
        }
    
    def _covers_topic_adequately(self, content: str, topic: str) -> bool:
        # Simple keyword coverage check
        topic_words = set(topic.lower().split())
        content_words = set(content.lower().split())
        coverage = len(topic_words.intersection(content_words)) / len(topic_words)
        return coverage >= 0.6  # At least 60% of topic words should appear
    
    def _calculate_completeness_score(self, content: str, topic: str) -> float:
        score = 1.0
        
        # Reduce score for truncation indicators
        for indicator in self.truncation_indicators:
            if indicator in content.lower():
                score -= 0.3
        
        # Score based on length
        length_score = min(1.0, len(content) / 1500)  # Optimal around 1500 chars
        score *= length_score
        
        return max(0.0, score)

# Add to RobustVideoGenerationPipeline
async def build_generation_bundle(self, **kwargs):
    # ... existing code ...
    
    # Validate content before proceeding
    validator = ContentValidator()
    validation_result = validator.validate_content_completeness(
        raw_content, 
        kwargs.get("topic", "")
    )
    
    if not validation_result["is_complete"]:
        logger.warning(f"Content validation failed: {validation_result['issues']}")
        # Retry with explicit completeness instructions
        return await self._retry_with_completeness_requirements(**kwargs)
    
    # ... continue with generation ...
```

#### 1.2.2 Implement Progressive Content Chunking

**File:** `backend/core/modules/content_chunker.py` (NEW)

```python
from typing import List, Dict, Any

class EducationalContentChunker:
    def __init__(self, max_chunk_duration: int = 300):  # 5 minutes per chunk
        self.max_chunk_duration = max_chunk_duration
    
    def chunk_content_for_videos(
        self, 
        content: str, 
        topic: str
    ) -> List[Dict[str, Any]]:
        # Split content into logical sections
        sections = self._identify_content_sections(content)
        
        chunks = []
        current_chunk = {
            "content": "",
            "estimated_duration": 0,
            "concepts": [],
            "chunk_index": 0
        }
        
        for section in sections:
            section_duration = self._estimate_duration(section["content"])
            
            if (current_chunk["estimated_duration"] + section_duration > self.max_chunk_duration 
                and current_chunk["content"]):
                # Finalize current chunk
                chunks.append(current_chunk)
                current_chunk = {
                    "content": "",
                    "estimated_duration": 0,
                    "concepts": [],
                    "chunk_index": len(chunks)
                }
            
            current_chunk["content"] += section["content"] + "\n\n"
            current_chunk["estimated_duration"] += section_duration
            current_chunk["concepts"].extend(section["concepts"])
        
        # Add final chunk
        if current_chunk["content"]:
            chunks.append(current_chunk)
        
        return chunks
    
    def _identify_content_sections(self, content: str) -> List[Dict]:
        # Simple section identification based on headers and paragraph breaks
        sections = []
        paragraphs = content.split('\n\n')
        
        for para in paragraphs:
            if para.strip():
                concepts = self._extract_key_concepts(para)
                sections.append({
                    "content": para,
                    "concepts": concepts,
                    "type": "explanation"
                })
        
        return sections
    
    def _estimate_duration(self, text: str) -> int:
        # Estimate based on reading speed (150 words per minute)
        words = len(text.split())
        return max(30, int(words / 150 * 60))  # Minimum 30 seconds per section
    
    def _extract_key_concepts(self, text: str) -> List[str]:
        # Extract key concepts (simplified implementation)
        import re
        # Find terms that look like concepts (capitalized, technical terms)
        concepts = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', text)
        return list(set(concepts))[:5]  # Max 5 concepts per section
```

### 1.3 Fix Audio-Video Synchronization

#### 1.3.1 Implement Manim Voiceover Integration

**File:** `backend/core/rendering/manim_renderer.py`

```python
# Add to imports
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService
from manim_voiceover.services.elevenlabs import ElevenLabsService

class SyncedManimRenderer(VoiceoverScene):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # Configure TTS service based on language
        if kwargs.get('language') == 'zh':
            # Use Chinese TTS
            self.set_speech_service(GTTSService(lang='zh'))
        else:
            # Use English TTS
            self.set_speech_service(GTTSService(lang='en'))
    
    def create_synced_scene(self, scene_data: Dict[str, Any]):
        """Create a scene with perfect audio-video synchronization"""
        narration_text = scene_data.get("narration", "")
        visual_action = scene_data.get("action", "show_text")
        visual_param = scene_data.get("param", "")
        
        # Create visual element first
        visual_element = self._create_visual_element(visual_action, visual_param)
        
        # Use voiceover to sync audio with animation
        with self.voiceover(text=narration_text) as tracker:
            # Animation duration automatically matches audio duration
            if visual_action == "plot":
                self.play(Create(visual_element), run_time=tracker.duration)
            elif visual_action == "write_tex":
                self.play(Write(visual_element), run_time=tracker.duration)
            elif visual_action == "show_text":
                self.play(FadeIn(visual_element), run_time=tracker.duration)
            else:
                # Default animation
                self.play(Create(visual_element), run_time=tracker.duration)
        
        return tracker.duration  # Return actual duration for timing records

    def _create_visual_element(self, action: str, param: str):
        """Create visual elements based on action type"""
        if action == "plot":
            # Create mathematical plot
            return self._create_plot(param)
        elif action == "write_tex":
            # Create LaTeX text
            return MathTex(param).scale(1.2)
        elif action == "show_text":
            # Create regular text
            return Text(param).scale(0.8)
        elif action == "draw_shape":
            # Create geometric shape
            return self._create_shape(param)
        else:
            return Text("Visual Element")
    
    def render_with_timing_validation(self, output_path: str) -> Dict[str, Any]:
        """Render with audio-video timing validation"""
        start_time = time.time()
        
        # Render with --disable_caching to avoid audio sync issues
        cmd = [
            self.manim_path, 
            "--disable_caching",
            "--quality", "medium_quality",
            "--output_file", output_path,
            self.scene_file_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        render_time = time.time() - start_time
        
        # Validate audio-video sync
        sync_validation = self._validate_av_sync(output_path)
        
        return {
            "success": result.returncode == 0,
            "render_time": render_time,
            "output_path": output_path,
            "sync_validation": sync_validation,
            "stderr": result.stderr
        }
    
    def _validate_av_sync(self, video_path: str) -> Dict[str, Any]:
        """Validate audio-video synchronization"""
        try:
            import cv2
            import librosa
            
            # Get video duration
            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
            video_duration = frame_count / fps
            cap.release()
            
            # Get audio duration
            audio, sr = librosa.load(video_path)
            audio_duration = len(audio) / sr
            
            # Check sync
            duration_diff = abs(video_duration - audio_duration)
            is_synced = duration_diff < 0.1  # Allow 100ms tolerance
            
            return {
                "is_synced": is_synced,
                "video_duration": video_duration,
                "audio_duration": audio_duration,
                "duration_difference": duration_diff
            }
            
        except Exception as e:
            return {
                "is_synced": False,
                "error": str(e)
            }
```

## Phase 2: High Impact Improvements (Week 3-4)

### 2.1 Subtitle Generation Support

#### 2.1.1 Automatic Subtitle Generation

**File:** `backend/services/subtitle_generator.py` (NEW)

```python
import json
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class SubtitleSegment:
    start_time: float
    end_time: float
    text: str
    
class SubtitleGenerator:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    async def generate_subtitles(
        self, 
        scenes: List[Dict], 
        language: str = "en"
    ) -> List[SubtitleSegment]:
        """Generate subtitles synchronized with scene timing"""
        subtitles = []
        current_time = 0.0
        
        for scene in scenes:
            narration = scene.get("narration", "")
            duration = scene.get("duration", 5.0)
            
            if narration.strip():
                # Split long narration into smaller segments for readability
                segments = self._split_narration(narration, duration)
                
                for segment in segments:
                    subtitle = SubtitleSegment(
                        start_time=current_time,
                        end_time=current_time + segment["duration"],
                        text=segment["text"]
                    )
                    subtitles.append(subtitle)
                    current_time += segment["duration"]
            else:
                current_time += duration
        
        return subtitles
    
    def _split_narration(self, text: str, total_duration: float) -> List[Dict]:
        """Split narration into readable segments"""
        sentences = text.split('. ')
        if len(sentences) == 1:
            return [{"text": text, "duration": total_duration}]
        
        segments = []
        duration_per_sentence = total_duration / len(sentences)
        
        for sentence in sentences:
            if sentence.strip():
                segments.append({
                    "text": sentence.strip() + ('.' if not sentence.endswith('.') else ''),
                    "duration": duration_per_sentence
                })
        
        return segments
    
    def export_srt(self, subtitles: List[SubtitleSegment]) -> str:
        """Export subtitles in SRT format"""
        srt_content = []
        
        for i, subtitle in enumerate(subtitles, 1):
            start_time = self._format_time(subtitle.start_time)
            end_time = self._format_time(subtitle.end_time)
            
            srt_content.extend([
                str(i),
                f"{start_time} --> {end_time}",
                subtitle.text,
                ""
            ])
        
        return "\n".join(srt_content)
    
    def export_vtt(self, subtitles: List[SubtitleSegment]) -> str:
        """Export subtitles in WebVTT format"""
        vtt_content = ["WEBVTT", ""]
        
        for subtitle in subtitles:
            start_time = self._format_time(subtitle.start_time, vtt_format=True)
            end_time = self._format_time(subtitle.end_time, vtt_format=True)
            
            vtt_content.extend([
                f"{start_time} --> {end_time}",
                subtitle.text,
                ""
            ])
        
        return "\n".join(vtt_content)
    
    def _format_time(self, seconds: float, vtt_format: bool = False) -> str:
        """Format time for subtitle files"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = seconds % 60
        
        if vtt_format:
            return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"
        else:
            return f"{hours:02d}:{minutes:02d}:{secs:06.3f}".replace('.', ',')
```

### 2.2 Whiteboard-Style Visual Design

#### 2.2.1 Key Concept Extractor

**File:** `backend/core/modules/concept_extractor.py` (NEW)

```python
import re
import spacy
from typing import List, Dict, Set
from collections import Counter

class KeyConceptExtractor:
    def __init__(self):
        # Load language model for NLP processing
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            self.nlp = None
            
    def extract_whiteboard_concepts(
        self, 
        narration: str, 
        max_concepts: int = 3
    ) -> List[Dict[str, str]]:
        """Extract key concepts that should appear on whiteboard"""
        
        # Extract different types of concepts
        concepts = []
        
        # 1. Mathematical expressions and formulas
        math_concepts = self._extract_math_concepts(narration)
        concepts.extend([{"type": "formula", "text": concept} for concept in math_concepts])
        
        # 2. Key terms and definitions
        key_terms = self._extract_key_terms(narration)
        concepts.extend([{"type": "term", "text": term} for term in key_terms])
        
        # 3. Lists and bullet points
        lists = self._extract_lists(narration)
        concepts.extend([{"type": "list", "text": item} for item in lists])
        
        # 4. Important names and dates
        entities = self._extract_entities(narration)
        concepts.extend([{"type": "entity", "text": entity} for entity in entities])
        
        # Rank and filter concepts
        ranked_concepts = self._rank_concepts(concepts, narration)
        return ranked_concepts[:max_concepts]
    
    def _extract_math_concepts(self, text: str) -> List[str]:
        """Extract mathematical expressions and formulas"""
        # LaTeX expressions
        latex_pattern = r'\$([^$]+)\$|\\\([^\\]+\\\)|\\\[[^\]]+\\\]'
        latex_matches = re.findall(latex_pattern, text)
        
        # Mathematical symbols and operators
        math_pattern = r'[α-ωΑ-Ω]|∫|∑|∏|√|∞|π|≈|≤|≥|±|×|÷'
        
        # Equations (simplified detection)
        equation_pattern = r'[a-zA-Z]\s*[=+\-*/]\s*[a-zA-Z0-9]+'
        equation_matches = re.findall(equation_pattern, text)
        
        math_concepts = []
        math_concepts.extend(latex_matches)
        math_concepts.extend(equation_matches)
        
        if re.search(math_pattern, text):
            # Extract surrounding context for mathematical content
            words = text.split()
            for i, word in enumerate(words):
                if re.search(math_pattern, word):
                    # Get context around mathematical symbols
                    start = max(0, i-2)
                    end = min(len(words), i+3)
                    context = ' '.join(words[start:end])
                    math_concepts.append(context)
        
        return list(set(math_concepts))[:3]
    
    def _extract_key_terms(self, text: str) -> List[str]:
        """Extract important terminology"""
        # Terms in quotes
        quoted_terms = re.findall(r'"([^"]+)"', text)
        
        # Capitalized terms (potential proper nouns/concepts)
        cap_pattern = r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b'
        capitalized_terms = re.findall(cap_pattern, text)
        
        # Technical terms (words ending in -tion, -ism, -ology, etc.)
        technical_pattern = r'\b\w+(?:tion|sion|ism|ology|ography|ometry)\b'
        technical_terms = re.findall(technical_pattern, text, re.IGNORECASE)
        
        # Use NLP if available
        nlp_terms = []
        if self.nlp:
            doc = self.nlp(text)
            nlp_terms = [token.text for token in doc if token.pos_ in ['NOUN', 'PROPN'] and len(token.text) > 3]
        
        all_terms = quoted_terms + capitalized_terms + technical_terms + nlp_terms
        
        # Filter and rank by frequency
        term_counts = Counter(all_terms)
        return [term for term, count in term_counts.most_common(5)]
    
    def _extract_lists(self, text: str) -> List[str]:
        """Extract list items and bullet points"""
        # Numbered lists
        numbered_pattern = r'(?:^|\n)\s*\d+\.\s*([^\n]+)'
        numbered_items = re.findall(numbered_pattern, text, re.MULTILINE)
        
        # Bullet points
        bullet_pattern = r'(?:^|\n)\s*[-•*]\s*([^\n]+)'
        bullet_items = re.findall(bullet_pattern, text, re.MULTILINE)
        
        # "First, Second, Third" patterns
        sequence_pattern = r'\b(?:first|second|third|finally),?\s*([^.!?]+)'
        sequence_items = re.findall(sequence_pattern, text, re.IGNORECASE)
        
        all_items = numbered_items + bullet_items + sequence_items
        return [item.strip() for item in all_items if len(item.strip()) > 10][:3]
    
    def _extract_entities(self, text: str) -> List[str]:
        """Extract important names, dates, and entities"""
        entities = []
        
        # Dates
        date_pattern = r'\b(?:\d{4}|\d{1,2}(?:st|nd|rd|th)?(?:\s+(?:January|February|March|April|May|June|July|August|September|October|November|December))?|\w+\s+\d{1,2},?\s+\d{4})\b'
        dates = re.findall(date_pattern, text)
        entities.extend(dates)
        
        # Names (simple heuristic)
        name_pattern = r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b'
        names = re.findall(name_pattern, text)
        entities.extend(names)
        
        # Use NLP for better entity extraction
        if self.nlp:
            doc = self.nlp(text)
            nlp_entities = [ent.text for ent in doc.ents if ent.label_ in ['PERSON', 'DATE', 'EVENT', 'LAW']]
            entities.extend(nlp_entities)
        
        return list(set(entities))[:3]
    
    def _rank_concepts(self, concepts: List[Dict], full_text: str) -> List[Dict]:
        """Rank concepts by importance and relevance"""
        scored_concepts = []
        
        for concept in concepts:
            text = concept["text"]
            concept_type = concept["type"]
            
            score = 0
            
            # Base score by type
            type_scores = {
                "formula": 10,
                "term": 7,
                "entity": 5,
                "list": 6
            }
            score += type_scores.get(concept_type, 3)
            
            # Frequency bonus
            frequency = full_text.lower().count(text.lower())
            score += min(frequency * 2, 10)
            
            # Length bonus (not too short, not too long)
            length = len(text.split())
            if 1 <= length <= 5:
                score += 3
            elif length > 10:
                score -= 2
            
            # Position bonus (concepts near beginning are often key)
            position = full_text.lower().find(text.lower())
            if position < len(full_text) * 0.3:
                score += 2
            
            scored_concepts.append({
                **concept,
                "score": score
            })
        
        # Sort by score and remove duplicates
        scored_concepts.sort(key=lambda x: x["score"], reverse=True)
        seen = set()
        unique_concepts = []
        
        for concept in scored_concepts:
            text_lower = concept["text"].lower()
            if text_lower not in seen and len(text_lower.strip()) > 0:
                seen.add(text_lower)
                unique_concepts.append(concept)
        
        return unique_concepts
```

#### 2.2.2 Whiteboard Visual Renderer

**File:** `backend/core/rendering/whiteboard_renderer.py` (NEW)

```python
from manim import *
from typing import List, Dict, Any

class WhiteboardRenderer(Scene):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.background_color = WHITE
        self.setup_whiteboard_style()
    
    def setup_whiteboard_style(self):
        """Configure whiteboard visual style"""
        # Set default colors for whiteboard look
        self.text_color = BLACK
        self.accent_color = BLUE
        self.highlight_color = RED
        self.secondary_color = GREEN
        
        # Configure default fonts and sizes
        self.title_scale = 1.2
        self.concept_scale = 0.9
        self.detail_scale = 0.7
    
    def render_whiteboard_scene(self, scene_data: Dict[str, Any]) -> None:
        """Render a scene in whiteboard style"""
        concepts = scene_data.get("key_concepts", [])
        narration = scene_data.get("narration", "")
        
        # Clear previous content with whiteboard erasing effect
        self.clear_whiteboard()
        
        # Title/Main concept
        if concepts:
            main_concept = concepts[0]
            self.write_main_concept(main_concept)
            
            # Supporting concepts
            if len(concepts) > 1:
                self.add_supporting_concepts(concepts[1:])
        
        # Add visual elements based on content type
        self.add_contextual_visuals(scene_data)
    
    def clear_whiteboard(self):
        """Animate clearing the whiteboard"""
        # Create erasing effect
        if hasattr(self, 'current_content') and self.current_content:
            eraser = Rectangle(
                width=config.frame_width + 2,
                height=config.frame_height + 2,
                fill_color=WHITE,
                fill_opacity=1
            ).move_to(ORIGIN)
            
            self.play(
                *[FadeOut(obj) for obj in self.current_content],
                run_time=0.5
            )
        
        self.current_content = []
    
    def write_main_concept(self, concept: Dict[str, Any]):
        """Write the main concept like a teacher on whiteboard"""
        concept_text = concept.get("text", "")
        concept_type = concept.get("type", "term")
        
        if concept_type == "formula":
            # Mathematical formula
            main_element = MathTex(concept_text, color=self.text_color).scale(self.title_scale)
        else:
            # Regular text
            main_element = Text(concept_text, color=self.text_color).scale(self.title_scale)
        
        main_element.move_to(UP * 2)
        
        # Animate writing
        self.play(Write(main_element), run_time=2)
        self.current_content.append(main_element)
        
        # Add underline for emphasis
        underline = Line(
            start=main_element.get_left() + DOWN * 0.3,
            end=main_element.get_right() + DOWN * 0.3,
            color=self.accent_color
        )
        self.play(Create(underline), run_time=0.5)
        self.current_content.append(underline)
    
    def add_supporting_concepts(self, concepts: List[Dict[str, Any]]):
        """Add supporting concepts below main concept"""
        for i, concept in enumerate(concepts):
            concept_text = concept.get("text", "")
            concept_type = concept.get("type", "term")
            
            # Position concepts vertically
            position = UP * (0.5 - i * 1.2)
            
            # Create bullet point
            bullet = Dot(color=self.accent_color).scale(0.5).move_to(LEFT * 5 + position)
            
            if concept_type == "formula":
                text_element = MathTex(concept_text, color=self.text_color).scale(self.concept_scale)
            else:
                text_element = Text(concept_text, color=self.text_color).scale(self.concept_scale)
            
            text_element.next_to(bullet, RIGHT, buff=0.3)
            
            # Animate appearance
            self.play(
                FadeIn(bullet),
                Write(text_element),
                run_time=1.5
            )
            
            self.current_content.extend([bullet, text_element])
            
            # Brief pause between concepts
            self.wait(0.3)
    
    def add_contextual_visuals(self, scene_data: Dict[str, Any]):
        """Add subject-appropriate visual elements"""
        action = scene_data.get("action", "")
        param = scene_data.get("param", "")
        
        if action == "plot":
            self.add_mathematical_plot(param)
        elif action == "diagram":
            self.add_diagram(param)
        elif action == "timeline":
            self.add_timeline(param)
        elif action == "process":
            self.add_process_diagram(param)
    
    def add_mathematical_plot(self, function_str: str):
        """Add mathematical plot in whiteboard style"""
        try:
            # Create simple coordinate system
            axes = Axes(
                x_range=[-3, 3, 1],
                y_range=[-2, 2, 1],
                x_length=4,
                y_length=3,
                axis_config={"color": self.text_color}
            ).move_to(DOWN * 1.5 + RIGHT * 2)
            
            # Plot function (simplified)
            if "sin" in function_str.lower():
                curve = axes.plot(lambda x: np.sin(x), color=self.accent_color)
            elif "cos" in function_str.lower():
                curve = axes.plot(lambda x: np.cos(x), color=self.accent_color)
            elif "x^2" in function_str or "x**2" in function_str:
                curve = axes.plot(lambda x: x**2, color=self.accent_color, x_range=[-2, 2])
            else:
                # Default linear function
                curve = axes.plot(lambda x: x, color=self.accent_color)
            
            # Animate drawing
            self.play(Create(axes), run_time=1)
            self.play(Create(curve), run_time=2)
            
            self.current_content.extend([axes, curve])
            
        except Exception as e:
            # Fallback to simple text
            fallback_text = Text(f"Function: {function_str}", color=self.text_color).scale(0.6)
            fallback_text.move_to(DOWN * 2)
            self.play(Write(fallback_text))
            self.current_content.append(fallback_text)
    
    def add_timeline(self, events: str):
        """Add timeline visualization for historical content"""
        # Create horizontal timeline
        timeline_line = Line(LEFT * 4, RIGHT * 4, color=self.text_color)
        timeline_line.move_to(DOWN * 1.5)
        
        # Extract events (simplified)
        event_list = events.split(',')[:4]  # Max 4 events
        
        timeline_elements = [timeline_line]
        
        for i, event in enumerate(event_list):
            # Position along timeline
            x_pos = -3 + (6 / (len(event_list) - 1)) * i if len(event_list) > 1 else 0
            
            # Event marker
            marker = Circle(radius=0.1, color=self.accent_color, fill_opacity=1)
            marker.move_to(timeline_line.get_start() + RIGHT * x_pos + UP * 0)
            
            # Event label
            label = Text(event.strip(), color=self.text_color).scale(0.5)
            label.next_to(marker, UP, buff=0.3)
            
            timeline_elements.extend([marker, label])
        
        # Animate timeline creation
        self.play(Create(timeline_line))
        for element in timeline_elements[1:]:  # Skip the line we already created
            self.play(FadeIn(element), run_time=0.5)
        
        self.current_content.extend(timeline_elements)
```

### 2.3 External Image Integration

#### 2.3.1 Multi-Source Image Manager

**File:** `backend/services/image_sources.py` (NEW)

```python
import aiohttp
import json
import logging
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import hashlib
import os

@dataclass
class ImageSource:
    url: str
    attribution: str
    license: str
    description: str
    source: str  # 'wikipedia', 'unsplash', 'pixabay'
    relevance_score: float = 0.0

class MultiSourceImageManager:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.cache_dir = "data/images/cache"
        os.makedirs(self.cache_dir, exist_ok=True)
        
        # API configurations
        self.unsplash_access_key = os.getenv("UNSPLASH_ACCESS_KEY")
        self.pixabay_api_key = os.getenv("PIXABAY_API_KEY")
    
    async def find_relevant_images(
        self, 
        topic: str, 
        keywords: List[str],
        max_images: int = 3,
        subject_area: str = "general"
    ) -> List[ImageSource]:
        """Find relevant images from multiple sources"""
        
        all_images = []
        
        # Search each source
        tasks = [
            self.search_wikipedia_images(topic, keywords),
            self.search_unsplash_images(topic, keywords),
            self.search_pixabay_images(topic, keywords)
        ]
        
        for task in tasks:
            try:
                images = await task
                all_images.extend(images)
            except Exception as e:
                self.logger.warning(f"Image search failed: {e}")
        
        # Filter and rank images
        relevant_images = self._rank_images_by_relevance(
            all_images, topic, keywords, subject_area
        )
        
        return relevant_images[:max_images]
    
    async def search_wikipedia_images(
        self, 
        topic: str, 
        keywords: List[str]
    ) -> List[ImageSource]:
        """Search Wikimedia Commons for educational images"""
        images = []
        
        async with aiohttp.ClientSession() as session:
            # Search Wikipedia articles
            search_url = "https://en.wikipedia.org/w/api.php"
            search_params = {
                "action": "query",
                "format": "json",
                "list": "search",
                "srsearch": topic,
                "srlimit": 3
            }
            
            async with session.get(search_url, params=search_params) as response:
                if response.status == 200:
                    data = await response.json()
                    articles = data.get("query", {}).get("search", [])
                    
                    # Get images from articles
                    for article in articles:
                        page_title = article["title"]
                        article_images = await self._get_wikipedia_page_images(
                            session, page_title
                        )
                        images.extend(article_images)
        
        return images[:5]  # Limit results
    
    async def _get_wikipedia_page_images(
        self, 
        session: aiohttp.ClientSession, 
        page_title: str
    ) -> List[ImageSource]:
        """Get images from a specific Wikipedia page"""
        images = []
        
        # Get page images
        url = "https://en.wikipedia.org/w/api.php"
        params = {
            "action": "query",
            "format": "json",
            "prop": "images",
            "titles": page_title,
            "imlimit": 3
        }
        
        try:
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    pages = data.get("query", {}).get("pages", {})
                    
                    for page_id, page_data in pages.items():
                        page_images = page_data.get("images", [])
                        
                        for img in page_images:
                            img_title = img["title"]
                            
                            # Get image details
                            img_details = await self._get_wikipedia_image_details(
                                session, img_title
                            )
                            if img_details:
                                images.append(img_details)
        
        except Exception as e:
            self.logger.warning(f"Failed to get Wikipedia images for {page_title}: {e}")
        
        return images
    
    async def _get_wikipedia_image_details(
        self, 
        session: aiohttp.ClientSession, 
        image_title: str
    ) -> Optional[ImageSource]:
        """Get details for a specific Wikipedia image"""
        
        # Skip non-image files
        if not any(ext in image_title.lower() for ext in ['.jpg', '.png', '.gif', '.svg', '.jpeg']):
            return None
        
        url = "https://en.wikipedia.org/w/api.php"
        params = {
            "action": "query",
            "format": "json",
            "prop": "imageinfo",
            "titles": image_title,
            "iiprop": "url|extmetadata",
            "iiurlwidth": 800
        }
        
        try:
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    pages = data.get("query", {}).get("pages", {})
                    
                    for page_id, page_data in pages.items():
                        imageinfo = page_data.get("imageinfo", [])
                        
                        if imageinfo:
                            info = imageinfo[0]
                            
                            return ImageSource(
                                url=info.get("thumburl", info.get("url", "")),
                                attribution=f"Wikipedia: {image_title}",
                                license="Creative Commons",
                                description=info.get("extmetadata", {}).get("ImageDescription", {}).get("value", ""),
                                source="wikipedia"
                            )
        except Exception as e:
            self.logger.warning(f"Failed to get details for {image_title}: {e}")
        
        return None
    
    async def search_unsplash_images(
        self, 
        topic: str, 
        keywords: List[str]
    ) -> List[ImageSource]:
        """Search Unsplash for high-quality images"""
        if not self.unsplash_access_key:
            return []
        
        images = []
        search_terms = [topic] + keywords
        
        async with aiohttp.ClientSession() as session:
            for term in search_terms[:2]:  # Limit API calls
                url = "https://api.unsplash.com/search/photos"
                headers = {"Authorization": f"Client-ID {self.unsplash_access_key}"}
                params = {
                    "query": term,
                    "per_page": 3,
                    "orientation": "landscape"
                }
                
                try:
                    async with session.get(url, headers=headers, params=params) as response:
                        if response.status == 200:
                            data = await response.json()
                            results = data.get("results", [])
                            
                            for result in results:
                                images.append(ImageSource(
                                    url=result["urls"]["regular"],
                                    attribution=f"Photo by {result['user']['name']} on Unsplash",
                                    license="Unsplash License",
                                    description=result.get("description", result.get("alt_description", "")),
                                    source="unsplash"
                                ))
                except Exception as e:
                    self.logger.warning(f"Unsplash search failed for '{term}': {e}")
        
        return images
    
    async def search_pixabay_images(
        self, 
        topic: str, 
        keywords: List[str]
    ) -> List[ImageSource]:
        """Search Pixabay for royalty-free images"""
        if not self.pixabay_api_key:
            return []
        
        images = []
        search_terms = [topic] + keywords
        
        async with aiohttp.ClientSession() as session:
            for term in search_terms[:2]:  # Limit API calls
                url = "https://pixabay.com/api/"
                params = {
                    "key": self.pixabay_api_key,
                    "q": term,
                    "image_type": "photo",
                    "category": "education",
                    "per_page": 3,
                    "min_width": 640
                }
                
                try:
                    async with session.get(url, params=params) as response:
                        if response.status == 200:
                            data = await response.json()
                            results = data.get("hits", [])
                            
                            for result in results:
                                images.append(ImageSource(
                                    url=result["webformatURL"],
                                    attribution=f"Image by {result.get('user', 'Unknown')} from Pixabay",
                                    license="Pixabay License",
                                    description=result.get("tags", ""),
                                    source="pixabay"
                                ))
                except Exception as e:
                    self.logger.warning(f"Pixabay search failed for '{term}': {e}")
        
        return images
    
    def _rank_images_by_relevance(
        self, 
        images: List[ImageSource], 
        topic: str, 
        keywords: List[str],
        subject_area: str
    ) -> List[ImageSource]:
        """Rank images by relevance to the educational content"""
        
        topic_words = set(topic.lower().split())
        keyword_words = set(' '.join(keywords).lower().split())
        all_search_words = topic_words.union(keyword_words)
        
        for image in images:
            score = 0.0
            
            # Description relevance
            description = (image.description or "").lower()
            desc_words = set(description.split())
            overlap = len(all_search_words.intersection(desc_words))
            score += overlap * 2
            
            # Source preference (educational content)
            source_scores = {
                "wikipedia": 3.0,  # Prefer educational sources
                "unsplash": 2.0,
                "pixabay": 1.5
            }
            score += source_scores.get(image.source, 1.0)
            
            # Subject area bonus
            if subject_area.lower() in description:
                score += 2.0
            
            image.relevance_score = score
        
        # Sort by relevance score
        return sorted(images, key=lambda x: x.relevance_score, reverse=True)
    
    async def download_and_cache_image(self, image: ImageSource) -> Optional[str]:
        """Download and cache an image for use in video generation"""
        
        # Generate cache filename
        url_hash = hashlib.md5(image.url.encode()).hexdigest()
        file_extension = image.url.split('.')[-1].split('?')[0] or 'jpg'
        cache_path = os.path.join(self.cache_dir, f"{url_hash}.{file_extension}")
        
        # Check if already cached
        if os.path.exists(cache_path):
            return cache_path
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(image.url) as response:
                    if response.status == 200:
                        content = await response.read()
                        
                        with open(cache_path, 'wb') as f:
                            f.write(content)
                        
                        self.logger.info(f"Cached image: {cache_path}")
                        return cache_path
        
        except Exception as e:
            self.logger.error(f"Failed to download image {image.url}: {e}")
        
        return None
```

## Phase 3: Enhanced Features (Week 5-8)

### 3.1 Advanced Animation System

**File:** `backend/core/rendering/advanced_animations.py` (NEW)

```python
from manim import *
import numpy as np
from typing import Dict, Any, List

class AdvancedAnimationRenderer(Scene):
    def create_particle_system(self, count: int = 50):
        """Create particle effects for engaging transitions"""
        particles = VGroup()
        
        for _ in range(count):
            particle = Dot(radius=0.05)
            particle.set_color(random_bright_color())
            particle.move_to([
                np.random.uniform(-7, 7),
                np.random.uniform(-4, 4),
                0
            ])
            particles.add(particle)
        
        return particles
    
    def animate_concept_emergence(self, concept_object):
        """Animate concept appearing with particle effects"""
        particles = self.create_particle_system()
        
        # Particles converge to form concept
        self.play(
            *[particle.animate.move_to(concept_object.get_center() + np.random.uniform(-0.5, 0.5, 3))
              for particle in particles],
            run_time=2
        )
        
        # Particles form the concept
        self.play(
            FadeOut(particles),
            FadeIn(concept_object),
            run_time=1
        )
    
    def create_3d_visualization(self, data_type: str, params: Dict[str, Any]):
        """Create 3D visualizations for complex concepts"""
        
        if data_type == "molecular":
            return self._create_molecular_structure(params)
        elif data_type == "geometric":
            return self._create_3d_geometry(params)
        elif data_type == "graph":
            return self._create_3d_graph(params)
        
        return VGroup()  # Empty group as fallback
    
    def _create_molecular_structure(self, params: Dict[str, Any]):
        """Create 3D molecular structure"""
        # Simplified molecular visualization
        atoms = VGroup()
        bonds = VGroup()
        
        # Create atoms (spheres)
        atom_positions = params.get("atoms", [[0, 0, 0], [1, 0, 0], [0.5, 0.866, 0]])
        
        for i, pos in enumerate(atom_positions):
            atom = Sphere(radius=0.2).move_to(pos)
            atom.set_color([RED, BLUE, GREEN][i % 3])
            atoms.add(atom)
        
        # Create bonds (lines between atoms)
        for i in range(len(atom_positions) - 1):
            bond = Line3D(atom_positions[i], atom_positions[i + 1])
            bond.set_color(GRAY)
            bonds.add(bond)
        
        molecule = VGroup(atoms, bonds)
        return molecule
```

### 3.2 Performance Optimization

**File:** `backend/core/performance/optimization_manager.py` (NEW)

```python
import asyncio
import time
import logging
from typing import Dict, Any, List
from concurrent.futures import ThreadPoolExecutor
import redis
import json

class PerformanceOptimizer:
    def __init__(self):
        self.redis_client = redis.Redis(host='localhost', port=6379, db=1)
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.logger = logging.getLogger(__name__)
    
    async def parallel_scene_processing(
        self, 
        scenes: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Process multiple scenes in parallel"""
        
        tasks = []
        for scene in scenes:
            task = asyncio.create_task(self._process_single_scene(scene))
            tasks.append(task)
        
        processed_scenes = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out failed scenes
        valid_scenes = []
        for i, result in enumerate(processed_scenes):
            if isinstance(result, Exception):
                self.logger.warning(f"Scene {i} processing failed: {result}")
                # Use fallback scene
                valid_scenes.append(self._create_fallback_scene(scenes[i]))
            else:
                valid_scenes.append(result)
        
        return valid_scenes
    
    async def _process_single_scene(self, scene: Dict[str, Any]) -> Dict[str, Any]:
        """Process a single scene with optimization"""
        
        # Check cache first
        cache_key = self._generate_cache_key(scene)
        cached_result = self.redis_client.get(cache_key)
        
        if cached_result:
            self.logger.info(f"Using cached scene: {cache_key}")
            return json.loads(cached_result)
        
        # Process scene
        start_time = time.time()
        processed_scene = await self._enhance_scene_content(scene)
        processing_time = time.time() - start_time
        
        processed_scene["processing_time"] = processing_time
        
        # Cache result
        self.redis_client.setex(
            cache_key, 
            3600,  # 1 hour cache
            json.dumps(processed_scene)
        )
        
        return processed_scene
    
    def _generate_cache_key(self, scene: Dict[str, Any]) -> str:
        """Generate cache key for scene"""
        import hashlib
        
        # Create hash from scene content
        content_str = f"{scene.get('narration', '')}{scene.get('action', '')}{scene.get('param', '')}"
        return f"scene_cache:{hashlib.md5(content_str.encode()).hexdigest()}"
    
    async def _enhance_scene_content(self, scene: Dict[str, Any]) -> Dict[str, Any]:
        """Enhance scene with optimized content"""
        
        enhanced_scene = scene.copy()
        
        # Add performance optimizations
        enhanced_scene["optimizations"] = {
            "parallel_processing": True,
            "cached_assets": await self._identify_cacheable_assets(scene),
            "compression_level": self._determine_compression_level(scene)
        }
        
        return enhanced_scene
    
    async def _identify_cacheable_assets(self, scene: Dict[str, Any]) -> List[str]:
        """Identify assets that can be cached"""
        cacheable = []
        
        action = scene.get("action", "")
        param = scene.get("param", "")
        
        if action == "plot":
            cacheable.append(f"plot_{param}")
        elif action == "write_tex":
            cacheable.append(f"tex_{param}")
        
        return cacheable
    
    def _determine_compression_level(self, scene: Dict[str, Any]) -> str:
        """Determine optimal compression based on content"""
        
        action = scene.get("action", "")
        
        if action in ["plot", "diagram"]:
            return "high"  # Visual content can be compressed more
        elif action in ["write_tex", "show_text"]:
            return "medium"  # Text needs to stay readable
        else:
            return "low"  # Conservative compression
    
    def _create_fallback_scene(self, original_scene: Dict[str, Any]) -> Dict[str, Any]:
        """Create fallback scene when processing fails"""
        return {
            "id": original_scene.get("id", "fallback"),
            "duration": 3.0,
            "narration": "Content processing in progress...",
            "action": "show_text",
            "param": "Loading...",
            "is_fallback": True
        }
```

## Phase 4: Monitoring and Analytics (Month 3+)

### 4.1 Real-time System Health Monitoring

**File:** `backend/monitoring/system_monitor.py` (NEW)

```python
import psutil
import time
import logging
from typing import Dict, Any
from dataclasses import dataclass, asdict
import redis
import json

@dataclass
class SystemMetrics:
    timestamp: float
    cpu_usage: float
    memory_usage: float
    disk_usage: float
    active_processes: int
    api_response_time: float
    video_generation_queue_size: int
    error_rate: float

class SystemHealthMonitor:
    def __init__(self):
        self.redis_client = redis.Redis(host='localhost', port=6379, db=2)
        self.logger = logging.getLogger(__name__)
        self.alert_thresholds = {
            "cpu_usage": 80.0,
            "memory_usage": 85.0,
            "disk_usage": 90.0,
            "error_rate": 10.0,
            "api_response_time": 5000  # 5 seconds
        }
    
    async def collect_metrics(self) -> SystemMetrics:
        """Collect current system metrics"""
        
        metrics = SystemMetrics(
            timestamp=time.time(),
            cpu_usage=psutil.cpu_percent(interval=1),
            memory_usage=psutil.virtual_memory().percent,
            disk_usage=psutil.disk_usage('/').percent,
            active_processes=len(psutil.pids()),
            api_response_time=await self._measure_api_response_time(),
            video_generation_queue_size=await self._get_queue_size(),
            error_rate=await self._calculate_error_rate()
        )
        
        # Store metrics
        await self._store_metrics(metrics)
        
        # Check for alerts
        await self._check_alerts(metrics)
        
        return metrics
    
    async def _measure_api_response_time(self) -> float:
        """Measure API response time"""
        try:
            start_time = time.time()
            # Ping internal health endpoint
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get("http://localhost:8000/health") as response:
                    await response.text()
            
            return (time.time() - start_time) * 1000  # Convert to milliseconds
        except:
            return 9999.0  # Error indicator
    
    async def _get_queue_size(self) -> int:
        """Get current video generation queue size"""
        try:
            # Check Celery queue size
            from celery import Celery
            app = Celery('mentormind')
            inspect = app.control.inspect()
            stats = inspect.stats()
            
            total_queued = 0
            if stats:
                for worker, worker_stats in stats.items():
                    total_queued += worker_stats.get('total', {}).get('tasks.create_class_video_task', 0)
            
            return total_queued
        except:
            return 0
    
    async def _calculate_error_rate(self) -> float:
        """Calculate recent error rate"""
        try:
            # Get recent error count from Redis
            current_time = time.time()
            hour_ago = current_time - 3600
            
            error_key = "error_count_hourly"
            error_data = self.redis_client.zrangebyscore(error_key, hour_ago, current_time)
            
            total_requests_key = "request_count_hourly"
            total_data = self.redis_client.zrangebyscore(total_requests_key, hour_ago, current_time)
            
            error_count = len(error_data)
            total_count = len(total_data)
            
            if total_count == 0:
                return 0.0
            
            return (error_count / total_count) * 100
        except:
            return 0.0
    
    async def _store_metrics(self, metrics: SystemMetrics):
        """Store metrics in Redis for historical analysis"""
        metrics_key = "system_metrics"
        
        # Store with timestamp as score for time-series data
        self.redis_client.zadd(
            metrics_key, 
            {json.dumps(asdict(metrics)): metrics.timestamp}
        )
        
        # Keep only last 24 hours of data
        day_ago = time.time() - 86400
        self.redis_client.zremrangebyscore(metrics_key, 0, day_ago)
    
    async def _check_alerts(self, metrics: SystemMetrics):
        """Check if any metrics exceed alert thresholds"""
        alerts = []
        
        if metrics.cpu_usage > self.alert_thresholds["cpu_usage"]:
            alerts.append(f"High CPU usage: {metrics.cpu_usage:.1f}%")
        
        if metrics.memory_usage > self.alert_thresholds["memory_usage"]:
            alerts.append(f"High memory usage: {metrics.memory_usage:.1f}%")
        
        if metrics.disk_usage > self.alert_thresholds["disk_usage"]:
            alerts.append(f"High disk usage: {metrics.disk_usage:.1f}%")
        
        if metrics.error_rate > self.alert_thresholds["error_rate"]:
            alerts.append(f"High error rate: {metrics.error_rate:.1f}%")
        
        if metrics.api_response_time > self.alert_thresholds["api_response_time"]:
            alerts.append(f"Slow API response: {metrics.api_response_time:.0f}ms")
        
        if alerts:
            await self._send_alerts(alerts)
    
    async def _send_alerts(self, alerts: List[str]):
        """Send alerts to monitoring channels"""
        alert_message = f"🚨 System Alert:\n" + "\n".join(f"• {alert}" for alert in alerts)
        
        # Log alerts
        self.logger.warning(alert_message)
        
        # Store alert in Redis for dashboard
        alert_key = "system_alerts"
        alert_data = {
            "timestamp": time.time(),
            "alerts": alerts
        }
        
        self.redis_client.lpush(alert_key, json.dumps(alert_data))
        self.redis_client.ltrim(alert_key, 0, 99)  # Keep last 100 alerts
    
    async def get_health_summary(self) -> Dict[str, Any]:
        """Get overall system health summary"""
        try:
            current_metrics = await self.collect_metrics()
            
            # Get recent metrics for trends
            metrics_key = "system_metrics"
            hour_ago = time.time() - 3600
            recent_data = self.redis_client.zrangebyscore(metrics_key, hour_ago, time.time())
            
            if recent_data:
                recent_metrics = [json.loads(data) for data in recent_data[-10:]]  # Last 10 data points
                
                # Calculate trends
                cpu_trend = self._calculate_trend([m["cpu_usage"] for m in recent_metrics])
                memory_trend = self._calculate_trend([m["memory_usage"] for m in recent_metrics])
            else:
                cpu_trend = memory_trend = "stable"
            
            # Determine overall health status
            health_score = self._calculate_health_score(current_metrics)
            
            if health_score >= 80:
                status = "healthy"
            elif health_score >= 60:
                status = "warning"
            else:
                status = "critical"
            
            return {
                "status": status,
                "health_score": health_score,
                "current_metrics": asdict(current_metrics),
                "trends": {
                    "cpu": cpu_trend,
                    "memory": memory_trend
                },
                "last_updated": current_metrics.timestamp
            }
            
        except Exception as e:
            self.logger.error(f"Failed to get health summary: {e}")
            return {
                "status": "unknown",
                "health_score": 0,
                "error": str(e),
                "last_updated": time.time()
            }
    
    def _calculate_trend(self, values: List[float]) -> str:
        """Calculate trend direction for metrics"""
        if len(values) < 2:
            return "stable"
        
        # Simple trend calculation
        first_half = sum(values[:len(values)//2]) / (len(values)//2)
        second_half = sum(values[len(values)//2:]) / (len(values) - len(values)//2)
        
        diff = second_half - first_half
        
        if diff > 5:
            return "increasing"
        elif diff < -5:
            return "decreasing"
        else:
            return "stable"
    
    def _calculate_health_score(self, metrics: SystemMetrics) -> float:
        """Calculate overall health score (0-100)"""
        score = 100.0
        
        # Deduct points based on metrics
        score -= max(0, metrics.cpu_usage - 50) * 0.5  # CPU penalty
        score -= max(0, metrics.memory_usage - 60) * 0.4  # Memory penalty
        score -= max(0, metrics.disk_usage - 70) * 0.3  # Disk penalty
        score -= metrics.error_rate * 2  # Error rate penalty
        
        # API response time penalty
        if metrics.api_response_time > 1000:
            score -= (metrics.api_response_time - 1000) / 100
        
        return max(0, min(100, score))
```

## Implementation Timeline

### Week 1
- [ ] Implement exponential backoff retry logic
- [ ] Add circuit breaker pattern
- [ ] Create multi-provider API fallback system
- [ ] Fix content truncation validation

### Week 2  
- [ ] Integrate Manim voiceover plugin
- [ ] Implement audio-video synchronization fixes
- [ ] Add content completeness validation
- [ ] Test and validate Phase 1 fixes

### Week 3
- [ ] Implement subtitle generation system
- [ ] Create key concept extraction
- [ ] Build whiteboard-style renderer
- [ ] Add external image search integration

### Week 4
- [ ] Complete image caching system
- [ ] Implement advanced visual layouts
- [ ] Add timeline and diagram support
- [ ] Test Phase 2 improvements

### Week 5-6
- [ ] Add particle effects and advanced animations
- [ ] Implement 3D visualization support
- [ ] Create performance optimization system
- [ ] Add parallel processing capabilities

### Week 7-8
- [ ] Implement comprehensive monitoring
- [ ] Add real-time health metrics
- [ ] Create alerting system
- [ ] Performance tuning and optimization

## Testing Strategy

### Unit Tests
```bash
# Test connectivity resilience
pytest tests/test_api_resilience.py

# Test content validation
pytest tests/test_content_completeness.py

# Test audio-video sync
pytest tests/test_av_synchronization.py

# Test image integration
pytest tests/test_image_sources.py
```

### Integration Tests
```bash
# End-to-end video generation
python test_video_generation.py --count 5

# Performance benchmarking
python test_performance_benchmark.py
```

### Manual Testing Checklist
- [ ] Generate videos for each subject area (math, history, science)
- [ ] Verify subtitle timing accuracy
- [ ] Test image relevance and attribution
- [ ] Validate whiteboard visual clarity
- [ ] Check audio-video synchronization
- [ ] Verify API fallback mechanisms

## Success Metrics

### Quality Metrics
- **Content Completeness**: 100% (no truncated scripts)
- **Audio Sync Accuracy**: <100ms deviation
- **Image Relevance Score**: >8.0/10
- **Visual Clarity Rating**: >8.5/10

### Performance Metrics  
- **Generation Speed**: <5 minutes per video
- **Success Rate**: >95% with resilience patterns
- **API Availability**: >99% with multi-provider fallback
- **System Health Score**: >85/100

### User Experience Metrics
- **Completion Rate**: >80% for generated videos
- **Quality Feedback**: >4.0/5.0 average rating
- **Error Recovery**: <30 seconds for automatic fallback
- **Accessibility Score**: 100% with subtitle support

This roadmap provides a comprehensive implementation plan to address all identified issues and create a robust, high-quality educational video generation system that follows industry best practices and educational psychology principles.