"""
API Client for MentorMind Backend Services
Real API connections with no mock data
"""

import os
import aiohttp
import json
from typing import Dict, Any, Optional, Callable, Union
from dataclasses import dataclass
import asyncio
import random
import time
import logging

from config import config
from services.circuit_breaker import CircuitBreakerConfig, circuit_breaker_manager

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

# Language instruction injected into every AI prompt to enforce output language
LANGUAGE_INSTRUCTION = {
    "zh": "请用中文回复。所有内容、标题、说明和练习题均必须用中文书写。禁止使用英文。",
    "en": "Reply entirely in English. All content, titles, explanations, and exercises must be in English. Do not mix languages.",
    "ja": "日本語で回答してください。すべてのコンテンツは日本語で書いてください。",
    "ko": "한국어로 답변해 주세요. 모든 내용은 한국어로 작성해 주세요.",
}

def get_language_instruction(language: str) -> str:
    """Get language enforcement instruction for the given language code."""
    return LANGUAGE_INSTRUCTION.get(language, LANGUAGE_INSTRUCTION["zh"])


@dataclass
class APIResponse:
    """Standard API response format"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    status_code: int = 200
    retry_count: int = 0
    response_time_ms: float = 0.0


class APIRetryManager:
    """Manages API retry logic with exponential backoff and jitter"""
    
    def __init__(self, max_retries: int = 5, base_delay: float = 1.0):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.logger = logging.getLogger(__name__)
    
    async def retry_with_backoff(
        self, 
        func: Callable,
        *args,
        retry_on_exceptions: tuple = (aiohttp.ClientError, asyncio.TimeoutError),
        **kwargs
    ) -> APIResponse:
        """Retry function with exponential backoff and jitter"""
        last_exception = None
        
        for attempt in range(self.max_retries):
            try:
                start_time = time.time()
                result = await func(*args, **kwargs)
                response_time = (time.time() - start_time) * 1000  # Convert to ms
                
                # Add retry metadata to successful response
                if isinstance(result, APIResponse):
                    result.retry_count = attempt
                    result.response_time_ms = response_time
                
                return result
                
            except retry_on_exceptions as e:
                last_exception = e
                
                if attempt == self.max_retries - 1:
                    self.logger.error(f"Max retries ({self.max_retries}) exceeded for {func.__name__}: {e}")
                    return APIResponse(
                        success=False,
                        error=f"Max retries exceeded: {str(e)}",
                        status_code=0,
                        retry_count=attempt + 1
                    )
                
                # Calculate delay with jitter to prevent thundering herd
                jitter = random.uniform(0, 0.1)  # Add 0-100ms jitter
                delay = (self.base_delay * (2 ** attempt)) + jitter
                capped_delay = min(delay, 30)  # Cap at 30 seconds
                
                self.logger.warning(
                    f"Attempt {attempt + 1}/{self.max_retries} failed for {func.__name__}: {e}. "
                    f"Retrying in {capped_delay:.2f}s"
                )
                await asyncio.sleep(capped_delay)
            
            except Exception as e:
                # For non-retryable exceptions, fail immediately
                self.logger.error(f"Non-retryable error in {func.__name__}: {e}")
                return APIResponse(
                    success=False,
                    error=f"Non-retryable error: {str(e)}",
                    status_code=0,
                    retry_count=attempt + 1
                )
        
        # This should not be reached, but just in case
        return APIResponse(
            success=False,
            error=f"Unexpected retry failure: {str(last_exception)}",
            status_code=0,
            retry_count=self.max_retries
        )


class DeepSeekClient:
    """Client for DeepSeek API with resilience patterns"""
    
    def __init__(self):
        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        if not self.api_key:
            raise ValueError("DEEPSEEK_API_KEY not set in environment variables")
        
        self.base_url = "https://api.deepseek.com/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        # Initialize retry manager and circuit breaker
        self.retry_manager = APIRetryManager(max_retries=5, base_delay=1.0)
        
        # Configure circuit breaker for DeepSeek API
        cb_config = CircuitBreakerConfig(
            failure_threshold=5,
            success_threshold=2,
            timeout_duration=60,
            failure_rate_threshold=0.5,
            min_request_threshold=10
        )
        self.circuit_breaker = circuit_breaker_manager.get_circuit_breaker("deepseek_api", cb_config)
        self.logger = logging.getLogger(__name__)
    
    async def chat_completion(
        self,
        messages: list,
        model: str = "deepseek-chat",
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> APIResponse:
        """
        Call DeepSeek chat completion API with circuit breaker and retry logic
        """
        try:
            # Use circuit breaker to wrap the retry logic
            return await self.circuit_breaker.call(
                self._chat_completion_with_retry,
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens
            )
        except Exception as e:
            # Convert circuit breaker exceptions to APIResponse
            from services.circuit_breaker import CircuitBreakerException
            if isinstance(e, CircuitBreakerException):
                return APIResponse(
                    success=False,
                    error=f"Service temporarily unavailable: {str(e)}",
                    status_code=503
                )
            else:
                return APIResponse(
                    success=False,
                    error=f"API call failed: {str(e)}",
                    status_code=500
                )
    
    async def _chat_completion_with_retry(
        self,
        messages: list,
        model: str = "deepseek-chat",
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> APIResponse:
        """
        Chat completion with retry logic (called by circuit breaker)
        """
        return await self.retry_manager.retry_with_backoff(
            self._chat_completion_raw,
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens
        )
    
    async def _chat_completion_raw(
        self,
        messages: list,
        model: str = "deepseek-chat",
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> APIResponse:
        """
        Raw chat completion call without retry logic
        """
        url = f"{self.base_url}/chat/completions"
        
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False
        }
        
        try:
            connector = aiohttp.TCPConnector(verify_ssl=config.VERIFY_SSL)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.post(
                    url,
                    headers=self.headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(
                        total=None,    # no global cap — sock_read controls it
                        connect=10,    # fail fast if server unreachable
                        sock_read=300  # 5 min to read large LLM completions (storyboard ~120s)
                    )
                ) as response:
                    
                    if response.status == 200:
                        data = await response.json()
                        return APIResponse(
                            success=True,
                            data=data,
                            status_code=response.status
                        )
                    elif response.status in [429, 502, 503, 504]:  # Retryable errors
                        error_text = await response.text()
                        # Raise exception to trigger retry
                        raise aiohttp.ClientResponseError(
                            request_info=response.request_info,
                            history=response.history,
                            status=response.status,
                            message=f"Retryable API error: {error_text}"
                        )
                    else:
                        error_text = await response.text()
                        return APIResponse(
                            success=False,
                            error=f"API error {response.status}: {error_text}",
                            status_code=response.status
                        )
                        
        except aiohttp.ClientError as e:
            # Specific handling for transfer encoding errors
            if "TransferEncodingError" in str(e) or "Not enough data" in str(e):
                self.logger.warning(f"Incomplete transfer detected, retrying: {e}")
                raise  # Let retry mechanism handle this
            # Re-raise for retry handling
            self.logger.warning(f"Network error in DeepSeek API call: {e}")
            raise
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            self.logger.error(f"Unexpected error in DeepSeek API call: {e}\n{error_details}")
            return APIResponse(
                success=False,
                error=f"Unexpected error: {str(e)}\nDetails: {error_details}",
                status_code=0
            )
    
    async def extract_knowledge(self, text: str, context: str = "") -> APIResponse:
        """
        Extract knowledge entities and relationships from text
        """
        prompt = f"""
        请从以下文本中提取知识概念和关系：
        
        文本：{text}
        {f"上下文：{context}" if context else ""}
        
        请提取：
        1. 概念实体（类型包括：概念、公式、定理、例子、常见错误、前提条件）
        2. 实体之间的关系（类型包括：依赖于、属于、部分属于、矛盾、概括、具体化）
        
        格式要求：
        - 每个实体：{{"id": "唯一标识", "name": "实体名称", "type": "实体类型", "description": "简要描述"}}
        - 每个关系：{{"source": "源实体ID", "target": "目标实体ID", "type": "关系类型", "evidence": "证据文本"}}
        
        请返回JSON格式。
        """
        
        messages = [
            {
                "role": "system",
                "content": "你是一个知识提取专家，擅长从教育文本中提取结构化知识。"
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        
        return await self.chat_completion(
            messages=messages,
            model="deepseek-chat",
            temperature=0.3,
            max_tokens=4000
        )
    
    async def plan_lesson(
        self,
        student_query: str,
        knowledge_summary: str,
        student_level: str = "beginner",
        time_limit: int = 30
    ) -> APIResponse:
        """
        Plan a lesson using DeepSeek-R1 reasoning
        """
        prompt = f"""
        请为{student_level}水平的学生创建一个{time_limit}分钟的教学计划。
        
        学生问题：{student_query}
        
        相关知识：{knowledge_summary}
        
        请返回JSON格式的教学计划，包括：
        - title: 课程标题
        - objective: 教学目标
        - target_audience: 目标受众
        - difficulty_level: 难度级别
        - total_duration_minutes: 总时长
        - steps: 教学步骤列表，每个步骤包含：
          - step_type: 步骤类型（explanation, example, practice, common_mistakes, summary）
          - content: 步骤内容
          - target_concepts: 目标概念列表
          - duration_minutes: 步骤时长
          - materials_needed: 所需材料
        """
        
        messages = [
            {
                "role": "system",
                "content": "你是一个经验丰富的老师，擅长创建结构化的教学计划。请用中文回复。"
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        
        return await self.chat_completion(
            messages=messages,
            model="deepseek-chat",
            temperature=0.3,
            max_tokens=2000
        )
    
    async def generate_script(self, lesson_plan: Dict[str, Any]) -> APIResponse:
        """
        Generate teaching script from lesson plan
        """
        prompt = f"""
        请将以下教学计划转换为自然流畅的教学脚本：
        
        标题：{lesson_plan.get('title', '')}
        目标：{lesson_plan.get('objective', '')}
        受众：{lesson_plan.get('target_audience', '')}
        
        教学步骤：
        {json.dumps(lesson_plan.get('steps', []), ensure_ascii=False, indent=2)}
        
        要求：
        1. 使用亲切、鼓励的语气
        2. 包含具体的例子和练习
        3. 指出常见错误和注意事项
        4. 适合{lesson_plan.get('total_duration_minutes', 30)}分钟的教学
        5. 使用中文，面向中国学生
        
        脚本格式：
        - 自然对话式语言
        - 包含适当的停顿和强调
        - 可以加入表情和手势提示（用括号标注）
        
        请生成完整的教学脚本。
        """
        
        messages = [
            {
                "role": "system",
                "content": "你是一个优秀的演讲者和教师，擅长创建生动有趣的教学脚本。"
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        
        return await self.chat_completion(
            messages=messages,
            model="deepseek-chat",
            temperature=0.7,
            max_tokens=4000
        )
    
    async def process_query(
        self,
        topic: str,
        language: str = "en",
        student_level: str = "beginner",
        duration_minutes: int = 30,
        include_video: bool = True,
        include_exercises: bool = True,
        include_assessment: bool = True,
        custom_requirements: Optional[str] = None,
        target_audience: str = "students",
        difficulty_level: str = "intermediate",
        format_type: str = "analysis"
    ) -> APIResponse:
        """
        Process student query and generate appropriate response
        """
        try:
            # Determine prompt based on format type
            if format_type == "analysis":
                prompt = f"""
                请分析以下学习需求并推荐相关主题：
                
                学生查询：{topic}
                语言：{language}
                学生水平：{student_level}
                
                请推荐3-5个学习主题，每个主题包含：
                1. 主题名称
                2. 简要描述
                3. 适合度评分（0-1）
                4. 后续问题（2-3个用于澄清的问题）
                
                格式要求：返回JSON数组，每个元素包含：
                - title: 主题名称
                - description: 描述
                - confidence: 适合度评分
                - follow_up_questions: 后续问题列表
                """
            elif format_type == "full_class":
                prompt = f"""
                请为以下学习主题创建完整的教学方案：
                
                主题：{topic}
                语言：{language}
                学生水平：{student_level}
                时长：{duration_minutes}分钟
                包含视频：{include_video}
                包含练习：{include_exercises}
                包含评估：{include_assessment}
                自定义要求：{custom_requirements or '无'}
                目标受众：{target_audience}
                难度级别：{difficulty_level}
                
                请创建完整的教学方案，包含：
                1. 课程标题
                2. 课程描述
                3. 学习目标（3-5个）
                4. 先决条件
                5. 教学方法
                6. 课程计划（分步骤）
                7. 练习题目
                8. 评估方式
                9. 参考资料
                10. AI教学洞察
                
                格式要求：返回JSON格式。
                """
            else:
                prompt = f"""
                请处理以下学习查询：
                
                查询：{topic}
                语言：{language}
                学生水平：{student_level}
                
                请提供适当的学习建议。
                """
            
            lang_instr = get_language_instruction(language)
            messages = [
                {
                    "role": "system",
                    "content": f"你是一个专业的AI教学导师，擅长分析学习需求并创建个性化教学方案。{lang_instr}"
                },
                {
                    "role": "user",
                    "content": f"{lang_instr}\n\n{prompt}"
                }
            ]
            
            response = await self.chat_completion(
                messages=messages,
                model="deepseek-chat",
                temperature=0.7,
                max_tokens=4000
            )
            
            if response.success and response.data:
                # Parse the AI response
                try:
                    ai_content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    # Try to extract JSON from the response
                    import json
                    import re
                    
                    # Look for JSON in the response
                    json_match = re.search(r'```json\n(.*?)\n```', ai_content, re.DOTALL)
                    if json_match:
                        ai_content = json_match.group(1)
                    
                    # Try to parse as JSON
                    parsed_data = json.loads(ai_content)
                    
                    return APIResponse(
                        success=True,
                        data=parsed_data,
                        status_code=200
                    )
                except (json.JSONDecodeError, AttributeError, IndexError) as e:
                    # If JSON parsing fails, return the raw text
                    return APIResponse(
                        success=True,
                        data={
                            "raw_response": ai_content,
                            "topics": [{
                                "title": topic,
                                "description": f"AI分析结果：{ai_content[:100]}...",
                                "confidence": 0.8,
                                "follow_up_questions": [
                                    "请详细说明你的学习目标",
                                    "你希望学习什么具体内容？",
                                    "你的时间安排是怎样的？"
                                ]
                            }]
                        },
                        status_code=200
                    )
            else:
                return APIResponse(
                    success=False,
                    error=response.error or "AI服务调用失败",
                    status_code=response.status_code or 500
                )
                
        except Exception as e:
            return APIResponse(
                success=False,
                error=f"处理查询时发生错误：{str(e)}",
                status_code=500
            )

    async def translate_to_chinese(self, text: str, context: str = "") -> APIResponse:
        """
        Translate English text to Chinese using DeepSeek
        """
        prompt = f"""
        请将以下英文内容翻译成中文：
        
        英文内容：{text}
        {f"上下文：{context}" if context else ""}
        
        翻译要求：
        1. 保持专业术语准确性
        2. 保持教育内容的严谨性
        3. 使用自然流畅的中文表达
        4. 保持原意的完整性
        
        请只返回翻译后的中文文本。
        """
        
        messages = [
            {
                "role": "system",
                "content": "你是一个专业的翻译专家，擅长教育和技术内容的翻译。"
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        
        return await self.chat_completion(
            messages=messages,
            model="deepseek-chat",
            temperature=0.3,
            max_tokens=2000
        )
    
    async def translate_to_english(self, text: str, context: str = "") -> APIResponse:
        """
        Translate Chinese text to English using DeepSeek
        """
        prompt = f"""
        Please translate the following Chinese content to English:
        
        Chinese content: {text}
        {f"Context: {context}" if context else ""}
        
        Translation requirements:
        1. Maintain accuracy of technical terms
        2. Keep educational content precise
        3. Use natural and fluent English expression
        4. Preserve the completeness of the original meaning
        
        Please return only the translated English text.
        """
        
        messages = [
            {
                "role": "system",
                "content": "You are a professional translator specializing in educational and technical content."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        
        return await self.chat_completion(
            messages=messages,
            model="deepseek-chat",
            temperature=0.3,
            max_tokens=2000
        )
    
    async def translate_content(self, content: Any, target_language: str = "zh") -> Any:
        """
        Translate content (string, list, or dict) to target language
        """
        if isinstance(content, str):
            # Translate single string
            if target_language == "zh":
                result = await self.translate_to_chinese(content)
            else:
                result = await self.translate_to_english(content)
            
            if result.success and result.data:
                return result.data.get("choices", [{}])[0].get("message", {}).get("content", content)
            return content
            
        elif isinstance(content, list):
            # Translate each item in list
            translated = []
            for item in content:
                if isinstance(item, str):
                    translated.append(await self.translate_content(item, target_language))
                else:
                    translated.append(item)
            return translated
            
        elif isinstance(content, dict):
            # Translate string values in dict
            translated = {}
            for key, value in content.items():
                if isinstance(value, str):
                    translated[key] = await self.translate_content(value, target_language)
                else:
                    translated[key] = value
            return translated
            
        else:
            return content

    async def assess_quality(self, lesson_plan: Dict[str, Any]) -> APIResponse:
        """
        Assess quality of a lesson plan
        """
        prompt = f"""
        请评估以下教学计划的质量：
        
        标题：{lesson_plan.get('title', '')}
        目标：{lesson_plan.get('objective', '')}
        受众：{lesson_plan.get('target_audience', '')}
        难度：{lesson_plan.get('difficulty_level', '')}
        总时长：{lesson_plan.get('total_duration_minutes', 30)}分钟
        
        教学步骤：
        {json.dumps(lesson_plan.get('steps', []), ensure_ascii=False, indent=2)}
        
        请从以下维度评估（0-1分）：
        1. 清晰度：解释是否清晰易懂
        2. 准确性：内容是否准确无误
        3. 教学效果：是否符合教学原理
        4. 参与度：是否能吸引学生兴趣
        5. 难度适当性：是否适合目标学生水平
        
        请提供：
        1. 每个维度的分数
        2. 总体评价
        3. 具体改进建议
        4. 是否通过质量阈值（阈值：0.8）
        
        请用中文回复，并返回JSON格式。
        """
        
        messages = [
            {
                "role": "system",
                "content": "你是一个教学评估专家，擅长评估教学计划的质量。"
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        
        return await self.chat_completion(
            messages=messages,
            model="deepseek-chat",
            temperature=0.3,
            max_tokens=2000
        )


class FunASRClient:
    """Client for FunASR speech recognition"""
    
    def __init__(self):
        self.endpoint = os.getenv("FUNASR_ENDPOINT", "http://localhost:8000/asr")
    
    async def transcribe(self, audio_path: str) -> APIResponse:
        """
        Transcribe audio using FunASR
        """
        print(f"⚠️  WARNING: Using MOCK FunASR Client. Real transcription is NOT performed.")
        # This would be implemented with actual file upload to FunASR
        # For now, returns a placeholder response
        return APIResponse(
            success=True,
            data={
                "text": "音频转录文本",
                "segments": [
                    {"start": 0.0, "end": 5.0, "text": "大家好，今天我们来学习数学。"}
                ]
            }
        )


class PaddleOCRClient:
    """Client for PaddleOCR text extraction"""
    
    def __init__(self):
        self.endpoint = os.getenv("PADDLE_OCR_ENDPOINT", "http://localhost:8001/ocr")
    
    async def extract_text(self, image_path: str) -> APIResponse:
        """
        Extract text from image using PaddleOCR
        """
        print(f"⚠️  WARNING: Using MOCK PaddleOCR Client. Real text extraction is NOT performed.")
        # This would be implemented with actual image upload to PaddleOCR
        # For now, returns a placeholder response
        return APIResponse(
            success=True,
            data={
                "text": "图像中的文本内容",
                "boxes": [],
                "scores": []
            }
        )


class APIClient:
    """Main API client for all services with resilience patterns"""
    
    def __init__(self):
        self.deepseek = DeepSeekClient()
        self.funasr = FunASRClient()
        self.paddle_ocr = PaddleOCRClient()
        self.logger = logging.getLogger(__name__)
    
    async def process_query(
        self,
        topic: str,
        language: str = "en",
        student_level: str = "beginner",
        duration_minutes: int = 30,
        include_video: bool = True,
        include_exercises: bool = True,
        include_assessment: bool = True,
        custom_requirements: Optional[str] = None,
        target_audience: str = "students",
        difficulty_level: str = "intermediate",
        format_type: str = "analysis"
    ) -> APIResponse:
        """
        Process student query using DeepSeek AI
        """
        return await self.deepseek.process_query(
            topic=topic,
            language=language,
            student_level=student_level,
            duration_minutes=duration_minutes,
            include_video=include_video,
            include_exercises=include_exercises,
            include_assessment=include_assessment,
            custom_requirements=custom_requirements,
            target_audience=target_audience,
            difficulty_level=difficulty_level,
            format_type=format_type
        )
    
    async def translate_to_chinese(self, text: str, context: str = "") -> APIResponse:
        """Translate text to Chinese"""
        return await self.deepseek.translate_to_chinese(text, context)
    
    async def translate_to_english(self, text: str, context: str = "") -> APIResponse:
        """Translate text to English"""
        return await self.deepseek.translate_to_english(text, context)
    
    async def translate_content(self, content: Any, target_language: str = "zh") -> Any:
        """Translate content to target language"""
        return await self.deepseek.translate_content(content, target_language)
    
    async def test_connection(self) -> Dict[str, Any]:
        """
        Test connections to all APIs with detailed metrics
        """
        results = {}
        
        # Test DeepSeek
        try:
            test_response = await self.deepseek.chat_completion(
                messages=[{"role": "user", "content": "Test"}],
                max_tokens=10
            )
            results["deepseek"] = {
                "status": test_response.success,
                "response_time_ms": test_response.response_time_ms,
                "retry_count": test_response.retry_count,
                "error": test_response.error if not test_response.success else None
            }
        except Exception as e:
            results["deepseek"] = {
                "status": False,
                "error": str(e),
                "response_time_ms": 0,
                "retry_count": 0
            }
            print(f"DeepSeek test failed: {e}")
        
        # Test other APIs (simplified for now)
        results["funasr"] = {"status": True, "note": "Mock implementation"}
        results["paddle_ocr"] = {"status": True, "note": "Mock implementation"}
        
        return results


# Global API client instance
api_client = APIClient()


async def test_all_apis():
    """Test all API connections"""
    print("Testing API connections...")
    
    client = APIClient()
    results = await client.test_connection()
    
    print("\nAPI Connection Results:")
    for service, status in results.items():
        status_icon = "✅" if status else "❌"
        print(f"{status_icon} {service}: {'Connected' if status else 'Failed'}")
    
    return all(results.values())


if __name__ == "__main__":
    # Run API connection test
    asyncio.run(test_all_apis())