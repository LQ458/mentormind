"""
Sophisticated Teaching Pipeline for MentorMind
实现闭环、连贯且适应性的智能讲授流程
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum
import uuid

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import config
from modules.cognitive import CognitiveProcessor
from modules.agentic import TeachingAgent, LessonPlan, QualityAssessment
from modules.output import OutputPipeline


class TeachingState:
    """动态记忆机制教学状态模块 - 跟踪学习进度与认知缺口"""
    
    def __init__(self, student_id: str = None):
        self.student_id = student_id or str(uuid.uuid4())
        self.learning_history: List[Dict] = []
        self.cognitive_gaps: List[str] = []
        self.mastered_concepts: List[str] = []
        self.learning_style: Optional[str] = None
        self.engagement_level: float = 0.5  # 0-1
        self.last_interaction: Optional[datetime] = None
        self.progress_tracking: Dict[str, float] = {}  # concept -> mastery (0-1)
        
    def update_from_dialogue(self, dialogue: str, understanding_score: float):
        """从对话更新教学状态"""
        self.last_interaction = datetime.now()
        self.engagement_level = min(1.0, self.engagement_level + 0.1)
        
        # 记录学习历史
        self.learning_history.append({
            "timestamp": datetime.now().isoformat(),
            "dialogue": dialogue,
            "understanding_score": understanding_score,
            "type": "dialogue_interaction"
        })
        
    def identify_cognitive_gaps(self, assessment_results: Dict) -> List[str]:
        """识别认知缺口"""
        gaps = []
        
        if assessment_results.get("misconceptions"):
            gaps.extend(assessment_results["misconceptions"])
        
        if assessment_results.get("difficulty_areas"):
            gaps.extend(assessment_results["difficulty_areas"])
        
        # 更新认知缺口列表
        self.cognitive_gaps = list(set(self.cognitive_gaps + gaps))
        return gaps
    
    def update_progress(self, concept: str, mastery: float):
        """更新学习进度"""
        self.progress_tracking[concept] = mastery
        
        if mastery >= 0.8:  # 掌握阈值
            if concept not in self.mastered_concepts:
                self.mastered_concepts.append(concept)
            if concept in self.cognitive_gaps:
                self.cognitive_gaps.remove(concept)
    
    def get_learning_profile(self) -> Dict:
        """获取学习画像"""
        return {
            "student_id": self.student_id,
            "total_interactions": len(self.learning_history),
            "cognitive_gaps": self.cognitive_gaps,
            "mastered_concepts": self.mastered_concepts,
            "engagement_level": self.engagement_level,
            "progress_summary": {
                "total_concepts": len(self.progress_tracking),
                "mastered_concepts": len(self.mastered_concepts),
                "average_mastery": sum(self.progress_tracking.values()) / len(self.progress_tracking) if self.progress_tracking else 0
            }
        }


class GraphRAGRetriever:
    """GraphRAG 多跳检索与关系推理引擎"""
    
    def __init__(self):
        self.knowledge_graph = self._load_knowledge_graph()
        self.retrieval_depth = 3  # 多跳检索深度
        
    def _load_knowledge_graph(self) -> Dict:
        """加载预构建的知识图谱（由教学视频经多模态对齐与结构化生成）"""
        # 这里应该从数据库或文件加载实际的知识图谱
        # 目前使用模拟数据
        return {
            "entities": [
                {"id": "python_basics", "name": "Python基础", "type": "concept", "level": "beginner"},
                {"id": "variables", "name": "变量", "type": "concept", "level": "beginner"},
                {"id": "data_types", "name": "数据类型", "type": "concept", "level": "beginner"},
                {"id": "functions", "name": "函数", "type": "concept", "level": "intermediate"},
                {"id": "classes", "name": "类", "type": "concept", "level": "advanced"},
                {"id": "loops", "name": "循环", "type": "concept", "level": "beginner"},
                {"id": "conditionals", "name": "条件语句", "type": "concept", "level": "beginner"},
            ],
            "relationships": [
                {"source": "python_basics", "target": "variables", "type": "contains", "weight": 0.9},
                {"source": "python_basics", "target": "data_types", "type": "contains", "weight": 0.9},
                {"source": "python_basics", "target": "functions", "type": "prerequisite", "weight": 0.7},
                {"source": "variables", "target": "data_types", "type": "related_to", "weight": 0.8},
                {"source": "functions", "target": "classes", "type": "prerequisite", "weight": 0.6},
                {"source": "loops", "target": "conditionals", "type": "related_to", "weight": 0.7},
            ],
            "content_nodes": [
                {"id": "video_001", "concept": "variables", "type": "video", "duration": 300, "difficulty": "beginner"},
                {"id": "video_002", "concept": "data_types", "type": "video", "duration": 420, "difficulty": "beginner"},
                {"id": "video_003", "concept": "functions", "type": "video", "duration": 600, "difficulty": "intermediate"},
                {"id": "exercise_001", "concept": "variables", "type": "exercise", "duration": 180, "difficulty": "beginner"},
                {"id": "quiz_001", "concept": "data_types", "type": "assessment", "duration": 120, "difficulty": "beginner"},
            ]
        }
    
    def multi_hop_retrieval(self, query: str, teaching_state: TeachingState) -> Dict:
        """多跳检索与关系推理"""
        print(f"🔍 GraphRAG 多跳检索: {query}")
        
        # 1. 实体识别
        entities = self._extract_entities(query)
        
        # 2. 多跳检索
        relevant_concepts = self._expand_retrieval(entities, depth=self.retrieval_depth)
        
        # 3. 考虑学习状态（认知缺口、掌握程度）
        filtered_concepts = self._filter_by_learning_state(relevant_concepts, teaching_state)
        
        # 4. 路径规划
        learning_path = self._plan_learning_path(filtered_concepts, teaching_state)
        
        # 5. 内容检索
        retrieved_content = self._retrieve_content(learning_path)
        
        return {
            "query": query,
            "extracted_entities": entities,
            "relevant_concepts": relevant_concepts,
            "filtered_concepts": filtered_concepts,
            "learning_path": learning_path,
            "retrieved_content": retrieved_content,
            "reasoning_chain": self._generate_reasoning_chain(entities, relevant_concepts)
        }
    
    def _extract_entities(self, query: str) -> List[str]:
        """从查询中提取实体"""
        # 这里应该使用NLP模型进行实体识别
        # 目前使用简单关键词匹配
        entities = []
        for entity in self.knowledge_graph["entities"]:
            if entity["name"] in query:
                entities.append(entity["id"])
        return entities if entities else ["python_basics"]  # 默认返回基础概念
    
    def _expand_retrieval(self, entities: List[str], depth: int) -> List[Dict]:
        """多跳扩展检索"""
        expanded = []
        visited = set()
        
        def expand(entity_id: str, current_depth: int):
            if current_depth >= depth or entity_id in visited:
                return
            
            visited.add(entity_id)
            
            # 找到实体信息
            entity_info = next((e for e in self.knowledge_graph["entities"] if e["id"] == entity_id), None)
            if entity_info:
                expanded.append(entity_info)
            
            # 查找相关关系
            for rel in self.knowledge_graph["relationships"]:
                if rel["source"] == entity_id:
                    expand(rel["target"], current_depth + 1)
                elif rel["target"] == entity_id:
                    expand(rel["source"], current_depth + 1)
        
        # 从每个实体开始扩展
        for entity in entities:
            expand(entity, 0)
        
        return expanded
    
    def _filter_by_learning_state(self, concepts: List[Dict], teaching_state: TeachingState) -> List[Dict]:
        """根据学习状态过滤概念"""
        filtered = []
        
        for concept in concepts:
            concept_id = concept["id"]
            
            # 检查是否已掌握
            if concept_id in teaching_state.mastered_concepts:
                continue
            
            # 检查是否是认知缺口（优先处理）
            if concept_id in teaching_state.cognitive_gaps:
                concept["priority"] = "high"
                filtered.append(concept)
                continue
            
            # 检查学习进度
            current_mastery = teaching_state.progress_tracking.get(concept_id, 0)
            if current_mastery < 0.7:  # 未充分掌握
                concept["priority"] = "medium" if current_mastery > 0.3 else "high"
                filtered.append(concept)
        
        # 按优先级排序
        priority_order = {"high": 0, "medium": 1, "low": 2}
        filtered.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 2))
        
        return filtered
    
    def _plan_learning_path(self, concepts: List[Dict], teaching_state: TeachingState) -> List[Dict]:
        """规划个性化学习路径"""
        # 基于先决关系排序
        path = []
        added = set()
        
        def add_concept_with_prerequisites(concept: Dict):
            concept_id = concept["id"]
            
            if concept_id in added:
                return
            
            # 查找先决概念
            prerequisites = []
            for rel in self.knowledge_graph["relationships"]:
                if rel["target"] == concept_id and rel["type"] == "prerequisite":
                    prereq_info = next((c for c in concepts if c["id"] == rel["source"]), None)
                    if prereq_info:
                        prerequisites.append(prereq_info)
            
            # 先添加先决概念
            for prereq in prerequisites:
                add_concept_with_prerequisites(prereq)
            
            # 添加当前概念
            path.append({
                **concept,
                "order": len(path) + 1,
                "estimated_time": self._estimate_learning_time(concept, teaching_state)
            })
            added.add(concept_id)
        
        # 为每个概念构建路径
        for concept in concepts:
            add_concept_with_prerequisites(concept)
        
        return path
    
    def _estimate_learning_time(self, concept: Dict, teaching_state: TeachingState) -> int:
        """估计学习时间（分钟）"""
        base_time = {
            "beginner": 30,
            "intermediate": 45,
            "advanced": 60
        }.get(concept.get("level", "beginner"), 30)
        
        # 根据掌握程度调整
        current_mastery = teaching_state.progress_tracking.get(concept["id"], 0)
        adjustment = 1.0 - (current_mastery * 0.5)  # 已掌握部分减少时间
        
        return int(base_time * adjustment)
    
    def _retrieve_content(self, learning_path: List[Dict]) -> List[Dict]:
        """检索相关内容"""
        content = []
        
        for concept in learning_path:
            concept_id = concept["id"]
            
            # 查找相关的内容节点
            related_content = [
                node for node in self.knowledge_graph["content_nodes"]
                if node["concept"] == concept_id
            ]
            
            if related_content:
                content.append({
                    "concept": concept,
                    "content_nodes": related_content,
                    "content_types": list(set(node["type"] for node in related_content))
                })
        
        return content
    
    def _generate_reasoning_chain(self, entities: List[str], concepts: List[Dict]) -> List[str]:
        """生成推理链"""
        chain = []
        
        if entities:
            chain.append(f"识别到查询中的实体: {', '.join(entities)}")
        
        if concepts:
            concept_names = [c['name'] for c in concepts[:5]]  # 显示前5个
            chain.append(f"通过多跳检索找到相关概念: {', '.join(concept_names)}")
            
            # 添加关系推理
            if len(concepts) > 1:
                chain.append("基于概念间的关系进行推理，构建知识网络")
        
        chain.append("结合学习状态进行个性化过滤和路径规划")
        
        return chain


class RAGContentSynthesizer:
    """检索增强生成技术合成讲解内容"""
    
    def __init__(self):
        self.cognitive_processor = CognitiveProcessor()
        self.teaching_agent = TeachingAgent()
        
    async def synthesize_content(self, retrieval_result: Dict, teaching_state: TeachingState) -> Dict:
        """基于检索结果合成讲解内容"""
        print(f"🧠 RAG 内容合成: {retrieval_result['query']}")
        
        # 1. 准备上下文
        context = self._prepare_context(retrieval_result, teaching_state)
        
        # 2. 生成教学计划
        lesson_plan = await self._generate_lesson_plan(context, teaching_state)
        
        # 3. 质量评估
        quality_assessment = await self._assess_quality(lesson_plan, context)
        
        # 4. 内容增强
        enhanced_content = await self._enhance_content(lesson_plan, retrieval_result)
        
        return {
            "context_preparation": context,
            "lesson_plan": lesson_plan,
            "quality_assessment": quality_assessment,
            "enhanced_content": enhanced_content,
            "synthesis_metadata": {
                "retrieval_utilization": self._calculate_retrieval_utilization(retrieval_result, enhanced_content),
                "personalization_level": self._calculate_personalization_level(teaching_state, enhanced_content)
            }
        }
    
    def _prepare_context(self, retrieval_result: Dict, teaching_state: TeachingState) -> Dict:
        """准备生成上下文"""
        learning_path = retrieval_result.get("learning_path", [])
        retrieved_content = retrieval_result.get("retrieved_content", [])
        
        # 构建结构化上下文
        context = {
            "student_profile": teaching_state.get_learning_profile(),
            "learning_objectives": [
                {
                    "concept": concept["name"],
                    "level": concept.get("level", "beginner"),
                    "priority": concept.get("priority", "medium"),
                    "estimated_time": concept.get("estimated_time", 30)
                }
                for concept in learning_path[:5]  # 聚焦前5个目标
            ],
            "available_content": [
                {
                    "concept": content_item["concept"]["name"],
                    "content_types": content_item["content_types"],
                    "count": len(content_item["content_nodes"])
                }
                for content_item in retrieved_content[:3]  # 主要相关内容
            ],
            "cognitive_gaps": teaching_state.cognitive_gaps,
            "mastered_concepts": teaching_state.mastered_concepts[:10]  # 最近掌握的
        }
        
        return context
    
    async def _generate_lesson_plan(self, context: Dict, teaching_state: TeachingState) -> LessonPlan:
        """生成个性化教学计划"""
        # 构建学生查询
        student_query = self._construct_student_query(context)
        
        # 创建知识图谱表示
        knowledge_graph = {
            "entities": [
                {
                    "id": f"obj_{i}",
                    "name": obj["concept"],
                    "type": "learning_objective",
                    "metadata": obj
                }
                for i, obj in enumerate(context["learning_objectives"])
            ],
            "relationships": [
                {
                    "source": f"obj_{i}",
                    "target": f"obj_{j}",
                    "type": "sequence",
                    "weight": 0.8
                }
                for i in range(len(context["learning_objectives"]) - 1)
                for j in [i + 1]
            ]
        }
        
        # 使用教学代理生成计划
        lesson_plan, quality_assessment, attempts = await self.teaching_agent.teach(
            student_query=student_query,
            knowledge_graph=knowledge_graph,
            student_level=teaching_state.learning_style or "adaptive",
            max_attempts=2,
            time_limit_minutes=sum(obj["estimated_time"] for obj in context["learning_objectives"])
        )
        
        return lesson_plan
    
    def _construct_student_query(self, context: Dict) -> str:
        """构建学生查询"""
        objectives = [obj["concept"] for obj in context["learning_objectives"][:3]]
        gaps = context["cognitive_gaps"][:2]
        
        if gaps:
            return f"我想学习{', '.join(objectives)}，但我在{', '.join(gaps)}方面有困难，请帮我系统性地掌握这些知识。"
        else:
            return f"我想系统学习{', '.join(objectives)}，请为我制定一个完整的学习计划。"
    
    async def _assess_quality(self, lesson_plan: LessonPlan, context: Dict) -> QualityAssessment:
        """质量评估"""
        # 这里可以添加更复杂的质量评估逻辑
        # 目前使用教学代理的评估
        _, quality_assessment, _ = await self.teaching_agent.teach(
            student_query="评估教学计划质量",
            knowledge_graph={"entities": [], "relationships": []},
            student_level="expert",
            max_attempts=1
        )
        
        return quality_assessment
    
    async def _enhance_content(self, lesson_plan: LessonPlan, retrieval_result: Dict) -> Dict:
        """增强内容 - 结合检索结果"""
        enhanced_steps = []
        
        for i, step in enumerate(lesson_plan.steps):
            # 查找相关的检索内容
            related_content = self._find_related_content(step, retrieval_result)
            
            enhanced_step = {
                **step.to_dict(),
                "enhanced": True,
                "retrieved_content": related_content,
                "rag_enhancements": self._generate_enhancements(step, related_content)
            }
            
            enhanced_steps.append(enhanced_step)
        
        return {
            "original_plan": lesson_plan.to_dict(),
            "enhanced_steps": enhanced_steps,
            "total_enhancements": sum(len(step["rag_enhancements"]) for step in enhanced_steps),
            "retrieval_integration": self._calculate_integration_score(retrieval_result, enhanced_steps)
        }
    
    def _find_related_content(self, step, retrieval_result: Dict) -> List[Dict]:
        """查找步骤相关的检索内容"""
        # 简单关键词匹配
        step_text = f"{step.title} {step.content}".lower()
        related = []
        
        for content_item in retrieval_result.get("retrieved_content", []):
            concept_name = content_item["concept"]["name"].lower()
            if concept_name in step_text:
                related.append(content_item)
        
        return related[:2]  # 返回最多2个相关内容
    
    def _generate_enhancements(self, step, related_content: List[Dict]) -> List[str]:
        """生成增强建议"""
        enhancements = []
        
        if related_content:
            content_types = set()
            for content in related_content:
                content_types.update(content["content_types"])
            
            if "video" in content_types:
                enhancements.append("添加相关教学视频演示")
            if "exercise" in content_types:
                enhancements.append("补充针对性练习")
            if "assessment" in content_types:
                enhancements.append("加入知识点检测")
        
        # 基于步骤类型添加增强
        if "example" in step.content.lower() or "示例" in step.content:
            enhancements.append("增加更多实际应用案例")
        
        if "practice" in step.content.lower() or "练习" in step.content:
            enhancements.append("提供分步骤练习指导")
        
        return enhancements
    
    def _calculate_retrieval_utilization(self, retrieval_result: Dict, enhanced_content: Dict) -> float:
        """计算检索利用率"""
        total_concepts = len(retrieval_result.get("filtered_concepts", []))
        if total_concepts == 0:
            return 0.0
        
        used_concepts = set()
        for step in enhanced_content.get("enhanced_steps", []):
            for content in step.get("retrieved_content", []):
                used_concepts.add(content["concept"]["id"])
        
        return len(used_concepts) / total_concepts
    
    def _calculate_personalization_level(self, teaching_state: TeachingState, enhanced_content: Dict) -> float:
        """计算个性化程度"""
        factors = []
        
        # 认知缺口覆盖
        gap_coverage = 0.0
        if teaching_state.cognitive_gaps:
            covered_gaps = 0
            for step in enhanced_content.get("enhanced_steps", []):
                step_text = f"{step.get('title', '')} {step.get('content', '')}".lower()
                for gap in teaching_state.cognitive_gaps:
                    if gap.lower() in step_text:
                        covered_gaps += 1
            gap_coverage = covered_gaps / len(teaching_state.cognitive_gaps)
        factors.append(gap_coverage)
        
        # 学习进度考虑
        progress_consideration = 0.5  # 基础值
        if teaching_state.progress_tracking:
            # 检查是否考虑了已掌握的概念
            progress_consideration = 0.7
        
        factors.append(progress_consideration)
        
        # 返回平均分数
        return sum(factors) / len(factors) if factors else 0.5
    
    def _calculate_integration_score(self, retrieval_result: Dict, enhanced_steps: List[Dict]) -> Dict:
        """计算检索集成分数"""
        total_retrieved = len(retrieval_result.get("retrieved_content", []))
        integrated = 0
        
        for step in enhanced_steps:
            if step.get("retrieved_content"):
                integrated += 1
        
        return {
            "total_retrieved_items": total_retrieved,
            "integrated_items": integrated,
            "integration_rate": integrated / total_retrieved if total_retrieved > 0 else 0,
            "enhancements_per_step": len(enhanced_steps) / max(integrated, 1)
        }


class DigitalHumanGenerator:
    """数字人视频实时生成"""
    
    def __init__(self):
        self.output_pipeline = OutputPipeline()
        
    async def generate_teaching_video(self, enhanced_content: Dict, teaching_state: TeachingState) -> Dict:
        """生成数字人教学视频"""
        print(f"🎥 数字人视频生成")
        
        # 1. 准备脚本
        script = self._prepare_script(enhanced_content, teaching_state)
        
        # 2. 生成音频
        audio_result = await self._generate_audio(script)
        
        # 3. 生成视频
        video_result = await self._generate_video(audio_result, script)
        
        # 4. 添加个性化元素
        personalized_result = self._add_personalization(video_result, teaching_state)
        
        return {
            "script": script,
            "audio_generation": audio_result,
            "video_generation": video_result,
            "personalization": personalized_result,
            "final_output": {
                "video_url": personalized_result.get("video_path"),
                "duration_seconds": personalized_result.get("duration_seconds", 0),
                "personalization_features": personalized_result.get("personalization_features", []),
                "generation_metadata": {
                    "script_length": len(script.get("content", "")),
                    "audio_duration": audio_result.get("duration_seconds", 0),
                    "video_quality": "hd",
                    "avatar_type": "professional_teacher"
                }
            }
        }
    
    def _prepare_script(self, enhanced_content: Dict, teaching_state: TeachingState) -> Dict:
        """准备教学脚本"""
        lesson_plan = enhanced_content.get("original_plan", {})
        enhanced_steps = enhanced_content.get("enhanced_steps", [])
        
        # 构建个性化脚本
        script_content = []
        
        # 开场白 - 个性化问候
        greeting = self._generate_greeting(teaching_state)
        script_content.append(greeting)
        
        # 学习目标介绍
        objectives = lesson_plan.get("objective", "").split("\n")
        for obj in objectives[:3]:  # 介绍前3个目标
            if obj.strip():
                script_content.append(f"今天我们将学习：{obj.strip()}")
        
        # 教学步骤
        for i, step in enumerate(enhanced_steps, 1):
            step_script = self._convert_step_to_script(step, i, teaching_state)
            script_content.extend(step_script)
        
        # 总结与鼓励
        conclusion = self._generate_conclusion(teaching_state, len(enhanced_steps))
        script_content.append(conclusion)
        
        return {
            "title": lesson_plan.get("title", "个性化教学课程"),
            "content": "\n\n".join(script_content),
            "target_duration": lesson_plan.get("total_duration_minutes", 30) * 60,  # 转换为秒
            "personalization_level": teaching_state.engagement_level,
            "teaching_style": self._determine_teaching_style(teaching_state)
        }
    
    def _generate_greeting(self, teaching_state: TeachingState) -> str:
        """生成个性化问候"""
        if teaching_state.engagement_level > 0.7:
            return f"欢迎回来！很高兴再次见到你。根据你的学习进度，我们今天将继续深入探索。"
        elif len(teaching_state.learning_history) > 0:
            return f"你好！基于我们上次的学习，我发现你在某些方面表现出色，今天我们来重点突破一些难点。"
        else:
            return f"欢迎开始学习！我是你的AI导师，我将根据你的需求为你定制个性化课程。"
    
    def _convert_step_to_script(self, step: Dict, step_number: int, teaching_state: TeachingState) -> List[str]:
        """将教学步骤转换为脚本"""
        script_parts = []
        
        # 步骤标题
        script_parts.append(f"步骤{step_number}: {step.get('title', '')}")
        
        # 主要内容
        content = step.get('content', '')
        if content:
            # 简化内容，使其更适合口语表达
            simplified = content.replace("\n", "。").replace("  ", " ")
            script_parts.append(simplified[:200] + ("..." if len(simplified) > 200 else ""))
        
        # 添加增强内容提示
        enhancements = step.get('rag_enhancements', [])
        if enhancements:
            script_parts.append(f"（提示：{enhancements[0]}）")
        
        # 添加互动元素
        if step_number % 3 == 0:  # 每3步添加一个互动
            script_parts.append("你可以暂停视频，尝试自己练习一下。")
        
        return script_parts
    
    def _generate_conclusion(self, teaching_state: TeachingState, steps_completed: int) -> str:
        """生成总结"""
        if steps_completed >= 5:
            return f"太棒了！你完成了{steps_completed}个学习步骤。记得复习今天的内容，我们下次会在此基础上继续深入。"
        else:
            return f"今天的学习就到这里。你完成了{steps_completed}个关键步骤，已经掌握了核心概念。继续加油！"
    
    def _determine_teaching_style(self, teaching_state: TeachingState) -> str:
        """确定教学风格"""
        if teaching_state.engagement_level > 0.8:
            return "enthusiastic"  # 热情型
        elif teaching_state.learning_style == "visual":
            return "visual_focused"  # 视觉型
        elif len(teaching_state.cognitive_gaps) > 2:
            return "detailed_explanation"  # 详细解释型
        else:
            return "balanced"  # 平衡型
    
    async def _generate_audio(self, script: Dict) -> Dict:
        """生成音频"""
        try:
            # 使用输出管道的TTS功能
            audio_result = await self.output_pipeline.generate_audio(
                text=script["content"],
                voice_type="professional_chinese" if script.get("teaching_style") != "enthusiastic" else "enthusiastic_chinese"
            )
            
            return {
                "success": True,
                "audio_path": audio_result.get("audio_path", ""),
                "duration_seconds": audio_result.get("duration_seconds", 0),
                "voice_characteristics": {
                    "type": "professional" if script.get("teaching_style") != "enthusiastic" else "enthusiastic",
                    "language": "zh-CN",
                    "speed": "normal"
                }
            }
        except Exception as e:
            print(f"音频生成失败: {e}")
            return {
                "success": False,
                "error": str(e),
                "duration_seconds": script.get("target_duration", 1800)  # 默认30分钟
            }
    
    async def _generate_video(self, audio_result: Dict, script: Dict) -> Dict:
        """生成视频"""
        try:
            # 使用输出管道的视频生成功能
            video_result = await self.output_pipeline.generate_video(
                audio_path=audio_result.get("audio_path", ""),
                script=script,
                avatar_type="professional_teacher"
            )
            
            return {
                "success": True,
                "video_path": video_result.get("video_path", ""),
                "duration_seconds": video_result.get("duration_seconds", 0),
                "avatar_used": "professional_teacher",
                "visual_elements": video_result.get("visual_elements", []),
                "generation_time": video_result.get("generation_time", 0)
            }
        except Exception as e:
            print(f"视频生成失败: {e}")
            return {
                "success": False,
                "error": str(e),
                "duration_seconds": audio_result.get("duration_seconds", 0)
            }
    
    def _add_personalization(self, video_result: Dict, teaching_state: TeachingState) -> Dict:
        """添加个性化元素"""
        personalization_features = []
        
        # 根据学习状态添加个性化元素
        if teaching_state.engagement_level > 0.7:
            personalization_features.append("progress_badges")  # 进度徽章
            personalization_features.append("encouragement_overlays")  # 鼓励叠加层
        
        if len(teaching_state.mastered_concepts) > 3:
            personalization_features.append("achievement_showcase")  # 成就展示
        
        if teaching_state.cognitive_gaps:
            personalization_features.append("gap_highlighting")  # 难点高亮
        
        return {
            **video_result,
            "personalization_features": personalization_features,
            "student_specific_elements": {
                "mastered_concepts_count": len(teaching_state.mastered_concepts),
                "engagement_level": teaching_state.engagement_level,
                "learning_session": len(teaching_state.learning_history) + 1
            }
        }


class SophisticatedTeachingPipeline:
    """闭环、连贯且适应性的智能讲授管道"""
    
    def __init__(self, student_id: str = None):
        self.teaching_state = TeachingState(student_id)
        self.graph_rag = GraphRAGRetriever()
        self.content_synthesizer = RAGContentSynthesizer()
        self.digital_human = DigitalHumanGenerator()
        
    async def process_student_query(self, student_query: str, include_video: bool = True) -> Dict:
        """处理学生查询的完整管道"""
        print("=" * 60)
        print("🚀 启动智能讲授管道")
        print("=" * 60)
        
        start_time = datetime.now()
        pipeline_steps = []
        
        try:
            # 步骤1: 对话理解
            print("\n1. 🗣️ 对话理解")
            understanding_result = await self._understand_dialogue(student_query)
            pipeline_steps.append({
                "step": "dialogue_understanding",
                "result": understanding_result,
                "timestamp": datetime.now().isoformat()
            })
            
            # 更新教学状态
            self.teaching_state.update_from_dialogue(
                student_query, 
                understanding_result["understanding_score"]
            )
            
            # 步骤2: GraphRAG 多跳检索
            print("\n2. 🔍 GraphRAG 多跳检索与关系推理")
            retrieval_result = self.graph_rag.multi_hop_retrieval(
                student_query, 
                self.teaching_state
            )
            pipeline_steps.append({
                "step": "graph_rag_retrieval",
                "result": retrieval_result,
                "timestamp": datetime.now().isoformat()
            })
            
            # 识别认知缺口
            cognitive_gaps = self.teaching_state.identify_cognitive_gaps(
                retrieval_result.get("assessment", {})
            )
            
            # 步骤3: 个性化学习路径规划
            print("\n3. 🗺️ 个性化学习路径规划")
            learning_path = retrieval_result.get("learning_path", [])
            pipeline_steps.append({
                "step": "learning_path_planning",
                "result": {
                    "path": learning_path,
                    "cognitive_gaps": cognitive_gaps,
                    "personalization_factors": self.teaching_state.get_learning_profile()
                },
                "timestamp": datetime.now().isoformat()
            })
            
            # 步骤4: RAG 内容合成
            print("\n4. 🧠 检索增强生成内容合成")
            synthesis_result = await self.content_synthesizer.synthesize_content(
                retrieval_result, 
                self.teaching_state
            )
            pipeline_steps.append({
                "step": "rag_content_synthesis",
                "result": synthesis_result,
                "timestamp": datetime.now().isoformat()
            })
            
            # 步骤5: 数字人视频生成（如果启用）
            final_output = None
            if include_video:
                print("\n5. 🎥 数字人视频实时生成")
                video_result = await self.digital_human.generate_teaching_video(
                    synthesis_result["enhanced_content"],
                    self.teaching_state
                )
                pipeline_steps.append({
                    "step": "digital_human_generation",
                    "result": video_result,
                    "timestamp": datetime.now().isoformat()
                })
                final_output = video_result["final_output"]
            else:
                final_output = {
                    "type": "content_only",
                    "lesson_plan": synthesis_result["lesson_plan"].to_dict(),
                    "enhanced_content": synthesis_result["enhanced_content"]
                }
            
            # 更新学习进度
            self._update_learning_progress(synthesis_result, learning_path)
            
            # 计算处理时间
            processing_time = (datetime.now() - start_time).total_seconds()
            
            # 构建最终结果
            result = {
                "success": True,
                "pipeline_steps": pipeline_steps,
                "final_output": final_output,
                "teaching_state": self.teaching_state.get_learning_profile(),
                "processing_metrics": {
                    "total_time_seconds": processing_time,
                    "steps_completed": len(pipeline_steps),
                    "cognitive_gaps_identified": len(cognitive_gaps),
                    "concepts_in_path": len(learning_path),
                    "personalization_score": synthesis_result["synthesis_metadata"]["personalization_level"]
                },
                "metadata": {
                    "student_query": student_query,
                    "include_video": include_video,
                    "pipeline_version": "1.0",
                    "timestamp": datetime.now().isoformat()
                }
            }
            
            print(f"\n✅ 管道处理完成！总耗时: {processing_time:.1f}秒")
            print(f"   识别认知缺口: {len(cognitive_gaps)}个")
            print(f"   规划学习路径: {len(learning_path)}个概念")
            print(f"   个性化评分: {synthesis_result['synthesis_metadata']['personalization_level']:.2f}")
            
            return result
            
        except Exception as e:
            print(f"\n❌ 管道处理失败: {e}")
            import traceback
            traceback.print_exc()
            
            return {
                "success": False,
                "error": str(e),
                "pipeline_steps": pipeline_steps,
                "processing_time_seconds": (datetime.now() - start_time).total_seconds()
            }
    
    async def _understand_dialogue(self, student_query: str) -> Dict:
        """对话理解 - 分析学生查询"""
        try:
            # 使用认知处理器分析查询
            context_blocks = [{
                "timestamp": 0.0,
                "audio_text": student_query,
                "slide_text": "",
                "confidence": 1.0
            }]
            
            cognitive_result = await self.cognitive_processor.process_context_blocks(context_blocks)
            
            # 计算理解分数
            understanding_score = self._calculate_understanding_score(cognitive_result)
            
            return {
                "original_query": student_query,
                "cognitive_result": cognitive_result,
                "understanding_score": understanding_score,
                "extracted_entities": cognitive_result.get("entities", []),
                "key_concepts": [e.get("name") for e in cognitive_result.get("entities", [])[:5]]
            }
            
        except Exception as e:
            print(f"对话理解失败: {e}")
            return {
                "original_query": student_query,
                "cognitive_result": {},
                "understanding_score": 0.5,
                "extracted_entities": [],
                "key_concepts": [],
                "error": str(e)
            }
    
    def _calculate_understanding_score(self, cognitive_result: Dict) -> float:
        """计算理解分数"""
        # 基于提取的实体和关系数量
        entities_count = len(cognitive_result.get("entities", []))
        relationships_count = len(cognitive_result.get("relationships", []))
        
        # 基础分数
        base_score = min(1.0, (entities_count * 0.1 + relationships_count * 0.05))
        
        # 如果有明确的实体，提高分数
        if entities_count > 0:
            base_score = max(base_score, 0.7)
        
        return min(1.0, base_score)
    
    def _update_learning_progress(self, synthesis_result: Dict, learning_path: List[Dict]):
        """更新学习进度"""
        if not synthesis_result.get("lesson_plan"):
            return
        
        lesson_plan = synthesis_result["lesson_plan"]
        
        # 为学习路径中的每个概念更新进度
        for concept in learning_path:
            concept_id = concept["id"]
            concept_name = concept["name"]
            
            # 检查是否在课程计划中被覆盖
            covered = False
            for step in lesson_plan.steps:
                step_text = f"{step.title} {step.content}".lower()
                if concept_name.lower() in step_text:
                    covered = True
                    break
            
            if covered:
                # 增加掌握程度
                current_mastery = self.teaching_state.progress_tracking.get(concept_id, 0)
                new_mastery = min(1.0, current_mastery + 0.2)  # 每次学习增加20%
                self.teaching_state.update_progress(concept_id, new_mastery)


# 示例使用函数
async def example_sophisticated_pipeline():
    """示例：使用智能讲授管道"""
    print("智能讲授管道示例")
    print("=" * 60)
    
    # 创建管道
    pipeline = SophisticatedTeachingPipeline()
    
    # 示例查询
    student_query = "我想学习Python编程，但我不理解变量和函数的关系"
    
    # 处理查询
    result = await pipeline.process_student_query(
        student_query=student_query,
        include_video=True
    )
    
    if result["success"]:
        print(f"\n✅ 管道处理成功！")
        print(f"   总步骤: {len(result['pipeline_steps'])}")
        print(f"   处理时间: {result['processing_metrics']['total_time_seconds']:.1f}秒")
        print(f"   个性化评分: {result['processing_metrics']['personalization_score']:.2f}")
        
        # 显示教学状态
        teaching_state = result["teaching_state"]
        print(f"\n📊 教学状态:")
        print(f"   学习历史: {teaching_state['total_interactions']}次交互")
        print(f"   认知缺口: {len(teaching_state['cognitive_gaps'])}个")
        print(f"   已掌握概念: {len(teaching_state['mastered_concepts'])}个")
        print(f"   参与度: {teaching_state['engagement_level']:.2f}")
        
        # 显示最终输出
        final_output = result["final_output"]
        if final_output.get("type") == "content_only":
            print(f"\n📚 生成内容:")
            print(f"   课程标题: {final_output['lesson_plan'].get('title', 'N/A')}")
            print(f"   增强步骤: {len(final_output['enhanced_content'].get('enhanced_steps', []))}")
        else:
            print(f"\n🎥 生成视频:")
            print(f"   视频时长: {final_output.get('duration_seconds', 0)}秒")
            print(f"   个性化特征: {len(final_output.get('personalization_features', []))}个")
    
    return result


async def main():
    """主函数"""
    print("MentorMind 智能讲授管道")
    print("实现闭环、连贯且适应性的智能讲授")
    print("=" * 60)
    
    # 运行示例
    result = await example_sophisticated_pipeline()
    
    print("\n" + "=" * 60)
    print("管道架构:")
    print("1. 🗣️ 对话理解 - 理解学生学习需求")
    print("2. 🔍 GraphRAG - 多跳检索与关系推理")
    print("3. 🧠 动态记忆 - 跟踪学习进度与认知缺口")
    print("4. 🗺️ 路径规划 - 个性化学习路径")
    print("5. 📚 RAG合成 - 检索增强生成讲解内容")
    print("6. 🎥 数字人 - 实时生成定制化教学片段")
    print("=" * 60)


if __name__ == "__main__":
    # 创建必要目录
    os.makedirs("data/audio", exist_ok=True)
    os.makedirs("data/videos", exist_ok=True)
    os.makedirs("data/test", exist_ok=True)
    os.makedirs("logs", exist_ok=True)
    os.makedirs(".cache", exist_ok=True)
    os.makedirs("assets", exist_ok=True)
    os.makedirs("results", exist_ok=True)
    
    # 运行主函数
    asyncio.run(main())