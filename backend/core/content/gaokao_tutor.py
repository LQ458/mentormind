"""
Gaokao Tutor Agent
Chat-based learning loop for Gaokao exam preparation.
Provides conversational tutoring, resource discovery, and practice problems.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from config import config
from services.api_client import api_client, get_language_instruction

logger = logging.getLogger(__name__)

# Subjects supported for Gaokao
GAOKAO_SUBJECTS = {
    "math": "数学",
    "physics": "物理",
    "chemistry": "化学",
    "biology": "生物",
    "cs": "信息技术",
}

_GAOKAO_SYSTEM_PROMPT = """你是一位资深高考辅导教师，专门帮助学生备战中国高考{subject_zh}科目。

当前学习主题：{topic_focus}

你的职责：
1. **解答疑问**：用清晰、详细的步骤解释概念和题目，确保学生真正理解。
2. **出练习题**：在讲解完一个知识点后，给出2-3道高考风格的练习题来巩固。
3. **批改反馈**：对学生的答案给出详细批改，指出错误原因和正确思路。
4. **应试技巧**：分享高考答题技巧、时间分配策略和得分要点。

{resource_context}

注意事项：
- 使用中文回答
- 数学公式使用LaTeX格式：$公式$
- 解答题要写出完整的推导过程和步骤
- 参考高考评分标准，告诉学生每步能得几分
- 鼓励学生，但也要诚实指出不足

{language_instruction}
"""


def _build_resource_context(resources: List[Dict[str, Any]]) -> str:
    """Build context string from previously found resources."""
    if not resources:
        return ""
    lines = ["已收集的参考资料："]
    for r in resources[-5:]:  # Last 5 resources
        lines.append(f"- {r.get('title', '未命名')}: {r.get('summary', '')}")
    return "\n".join(lines)


class GaokaoTutor:
    """Chat-based Gaokao preparation tutor with resource integration."""

    def __init__(self):
        self.model_config = config.get_models()["deepseek_v3"]

    async def chat(
        self,
        subject: str,
        message: str,
        chat_history: List[Dict[str, str]],
        topic_focus: Optional[str] = None,
        resources: Optional[List[Dict[str, Any]]] = None,
        language: str = "zh",
    ) -> Dict[str, Any]:
        """
        Process a chat turn in the Gaokao tutoring session.

        Returns:
            Dict with keys: content, suggested_actions, needs_search, practice_problems
        """
        lang_instruction = get_language_instruction(language)
        subject_zh = GAOKAO_SUBJECTS.get(subject, subject)
        resource_context = _build_resource_context(resources or [])

        system_prompt = _GAOKAO_SYSTEM_PROMPT.format(
            subject_zh=subject_zh,
            topic_focus=topic_focus or "综合复习",
            resource_context=resource_context,
            language_instruction=lang_instruction,
        )

        # Build message list: system + recent history + current message
        messages = [{"role": "system", "content": system_prompt}]
        # Keep last 10 turns to stay within token limits
        for turn in chat_history[-10:]:
            messages.append({"role": turn["role"], "content": turn["content"]})
        messages.append({"role": "user", "content": message})

        try:
            response = await api_client.deepseek.chat_completion(
                messages=messages,
                temperature=0.5,
                max_tokens=4000,
            )
            content = (
                response.data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
        except Exception as e:
            logger.error(f"Gaokao tutor chat failed: {e}")
            return {
                "content": "抱歉，服务出现问题，请稍后再试。",
                "suggested_actions": [],
                "needs_search": False,
                "practice_problems": None,
            }

        # Analyze response to suggest next actions
        suggested_actions = self._suggest_actions(message, content, subject)

        # Detect if user is asking about specific exam questions or past papers
        needs_search = self._needs_resource_search(message)

        return {
            "content": content,
            "suggested_actions": suggested_actions,
            "needs_search": needs_search,
            "practice_problems": None,  # Extracted from content if present
        }

    async def generate_practice(
        self,
        subject: str,
        topic: str,
        difficulty: str = "medium",
        count: int = 3,
        language: str = "zh",
    ) -> Optional[Dict[str, Any]]:
        """Generate Gaokao-style practice problems for a specific topic."""
        lang_instruction = get_language_instruction(language)
        subject_zh = GAOKAO_SUBJECTS.get(subject, subject)

        difficulty_zh = {"easy": "基础", "medium": "中等", "hard": "压轴"}.get(
            difficulty, "中等"
        )

        prompt = f"""{lang_instruction}

你是高考{subject_zh}命题专家。请按照高考真题风格出{count}道{difficulty_zh}难度的题目。

主题：{topic}

要求：
1. 题目格式严格按照高考标准
2. 包含选择题和解答题的混合
3. 每道题附上详细解答和评分标准

输出JSON格式：
```json
{{
  "topic": "{topic}",
  "difficulty": "{difficulty}",
  "problems": [
    {{
      "id": 1,
      "type": "选择题",
      "question": "题目内容（数学公式用LaTeX）",
      "choices": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "B",
      "solution": "详细解题步骤",
      "scoring": "本题4分",
      "knowledge_points": ["知识点1"]
    }},
    {{
      "id": 2,
      "type": "解答题",
      "question": "题目内容",
      "answer": null,
      "solution": "完整解题过程，标注每步得分",
      "scoring": "本题12分：第一步3分，第二步4分，第三步5分",
      "knowledge_points": ["知识点1"]
    }}
  ]
}}
```"""

        try:
            response = await api_client.deepseek.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.4,
                max_tokens=6000,
            )
            content = (
                response.data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )

            # Parse JSON from response
            if "```json" in content:
                json_str = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                json_str = content.split("```")[1].split("```")[0].strip()
            else:
                json_str = content.strip()

            return json.loads(json_str)
        except Exception as e:
            logger.error(f"Gaokao practice generation failed: {e}")
            return None

    @staticmethod
    def _suggest_actions(user_message: str, ai_response: str, subject: str) -> List[str]:
        """Suggest next actions based on the conversation context."""
        actions = []
        msg_lower = user_message.lower()

        # If the AI just explained a concept, suggest practice
        if any(kw in ai_response for kw in ["例如", "比如", "因此", "所以", "综上"]):
            actions.append("做几道相关练习题")

        # If user is working on problems, suggest moving on or reviewing
        if any(kw in msg_lower for kw in ["答案", "对吗", "answer", "correct"]):
            actions.append("继续下一个知识点")
            actions.append("复习错题")

        # Always offer these
        if not actions:
            actions.append("出几道练习题")
            actions.append("讲解一个新知识点")

        actions.append("查看知识点总结")
        return actions[:3]  # Max 3 suggestions

    @staticmethod
    def _needs_resource_search(message: str) -> bool:
        """Detect if the user's message requires web search for resources."""
        search_signals = [
            "真题", "past paper", "历年", "最新", "2024", "2025", "2026",
            "全国卷", "试卷", "大纲", "考纲", "curriculum",
            "省", "province", "趋势", "trend",
        ]
        msg_lower = message.lower()
        return any(signal in msg_lower for signal in search_signals)
