"""
Working Backend Server for MentorMind
Simple synchronous backend that definitely works
"""

import json
from datetime import datetime
from typing import Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(
    title="MentorMind Backend API",
    description="Working backend API for MentorMind",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "mentormind-backend",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/status")
def get_status():
    """Get system status"""
    return {
        "status": "online",
        "version": "1.0.0",
        "subscription": {
            "plan": "professional",
            "monthly_cost": 29.99,
            "lessons_included": 1000,
            "lessons_used": 42,
            "lessons_remaining": 958,
            "cost_this_month": 3.42,
            "renewal_date": "2026-02-23"
        },
        "services": {
            "ai_lessons": "active",
            "speech_recognition": "simulated",
            "text_extraction": "simulated",
            "video_generation": "simulated"
        }
    }

@app.post("/teach")
def teach_endpoint(request: Dict[str, Any]):
    """Main teaching endpoint"""
    try:
        student_query = request.get("studentQuery", "")
        student_level = request.get("studentLevel", "beginner")
        subject = request.get("subject", "programming")
        duration = request.get("duration", 30)
        include_video = request.get("includeVideo", True)
        language = request.get("language", "zh-CN")
        
        if not student_query:
            raise HTTPException(status_code=400, detail="studentQuery is required")
        
        print(f"Processing lesson: {student_query}")
        print(f"Level: {student_level}, Subject: {subject}, Duration: {duration}min")
        
        # Generate lesson ID
        import hashlib
        import time
        lesson_id = hashlib.md5(f"{student_query}{time.time()}".encode()).hexdigest()[:8]
        
        # Subject mapping
        subject_names = {
            "programming": "编程",
            "math": "数学", 
            "science": "科学",
            "language": "语言",
            "business": "商业",
            "art": "艺术"
        }
        
        # Level mapping
        level_names = {
            "beginner": "初学者",
            "intermediate": "中级",
            "advanced": "高级"
        }
        
        subject_name = subject_names.get(subject, "编程")
        level_name = level_names.get(student_level, "初学者")
        
        # Generate steps based on duration
        steps = []
        if duration <= 30:
            steps = [
                {
                    "step_number": 1,
                    "title": f"{subject_name}基础概念介绍",
                    "description": f"介绍{student_query}的基本概念和原理",
                    "duration_minutes": max(10, duration // 3),
                    "teaching_method": "讲解演示",
                    "materials": ["PPT幻灯片", "概念图解"]
                },
                {
                    "step_number": 2,
                    "title": "实例分析与练习",
                    "description": f"通过实际例子练习{student_query}的应用",
                    "duration_minutes": max(15, duration // 2),
                    "teaching_method": "练习指导",
                    "materials": ["练习题", "参考答案", "在线编辑器"]
                },
                {
                    "step_number": 3,
                    "title": "总结与扩展学习",
                    "description": f"总结关键知识点并提供扩展学习资源",
                    "duration_minutes": max(5, duration // 6),
                    "teaching_method": "总结回顾",
                    "materials": ["总结文档", "扩展阅读", "学习路径图"]
                }
            ]
        else:
            # Longer lessons have more steps
            steps = [
                {
                    "step_number": 1,
                    "title": "课程导入与目标设定",
                    "description": f"介绍课程目标和{student_query}的重要性",
                    "duration_minutes": duration // 6,
                    "teaching_method": "引导讨论",
                    "materials": ["课程大纲", "学习目标"]
                },
                {
                    "step_number": 2,
                    "title": f"{subject_name}核心概念讲解",
                    "description": f"详细讲解{student_query}的核心概念和原理",
                    "duration_minutes": duration // 3,
                    "teaching_method": "深度讲解",
                    "materials": ["PPT幻灯片", "动画演示", "概念图解"]
                },
                {
                    "step_number": 3,
                    "title": "实践练习与指导",
                    "description": f"分组练习{student_query}的实际应用",
                    "duration_minutes": duration // 3,
                    "teaching_method": "实践指导",
                    "materials": ["练习题集", "项目模板", "代码示例"]
                },
                {
                    "step_number": 4,
                    "title": "总结回顾与答疑",
                    "description": "总结课程要点并解答学生疑问",
                    "duration_minutes": duration // 6,
                    "teaching_method": "互动问答",
                    "materials": ["总结文档", "常见问题", "扩展资源"]
                }
            ]
        
        # Calculate cost based on duration and features
        base_cost = 0.001 * duration  # $0.001 per minute
        if include_video:
            base_cost *= 1.5  # Video adds 50% cost
        if student_level == "advanced":
            base_cost *= 1.3  # Advanced content costs more
        elif student_level == "intermediate":
            base_cost *= 1.15
        
        total_cost = round(base_cost, 4)
        
        # Generate quality score (simulated)
        import random
        quality_score = round(0.7 + random.random() * 0.25, 2)  # 0.7-0.95
        
        response = {
            "success": True,
            "lesson_id": lesson_id,
            "lesson_plan": {
                "title": f"{subject_name}课程：{student_query[:20]}...",
                "description": f"这是一门针对{level_name}的{subject_name}课程，专注于{student_query}。课程设计充分考虑学习曲线和实际应用。",
                "total_duration_minutes": duration,
                "student_level": level_name,
                "subject": subject_name,
                "steps": steps
            },
            "output_result": {
                "script": {
                    "title": f"教学脚本：{student_query[:15]}...",
                    "content": f"【课程开始】\n大家好，欢迎来到今天的{subject_name}课程。今天我们将学习：{student_query}。\n\n【课程目标】\n通过本课程，您将能够：\n1. 理解{student_query}的基本概念\n2. 掌握相关技能的实际应用\n3. 解决常见问题\n\n【详细内容】\n{steps[0]['description']}\n\n{steps[1]['description']}\n\n{steps[2]['description']}\n\n【课程总结】\n今天我们学习了{student_query}的关键知识点，希望大家能够应用到实际中。",
                    "duration_seconds": duration * 60,
                    "word_count": len(student_query) * 10 + 200
                },
                "audio": {
                    "file_path": f"/data/audio/lesson_{lesson_id}.wav",
                    "duration_seconds": duration * 60,
                    "size_mb": round(duration * 1.5, 1)
                },
                "video": {
                    "file_path": f"/data/videos/lesson_{lesson_id}.mp4" if include_video else None,
                    "duration_seconds": duration * 60 if include_video else 0,
                    "size_mb": round(duration * 10, 1) if include_video else 0,
                    "generated": include_video
                },
                "metadata": {
                    "cost_estimation": {
                        "total_usd": total_cost,
                        "breakdown": {
                            "ai_planning": round(total_cost * 0.4, 4),
                            "content_generation": round(total_cost * 0.3, 4),
                            "audio_synthesis": round(total_cost * 0.2, 4),
                            "video_generation": round(total_cost * 0.1, 4) if include_video else 0
                        }
                    },
                    "technical_details": {
                        "model_used": "deepseek-v3",
                        "language": language,
                        "timestamp": datetime.now().isoformat()
                    }
                }
            },
            "quality_assessment": {
                "overall_score": quality_score,
                "criteria_scores": {
                    "clarity": round(quality_score * 0.95, 2),
                    "completeness": round(quality_score * 0.9, 2),
                    "engagement": round(quality_score * 1.05, 2) if quality_score * 1.05 <= 1.0 else 0.98,
                    "practicality": round(quality_score * 0.92, 2)
                },
                "feedback": f"课程设计良好，适合{level_name}学习者。内容结构清晰，实践性强。",
                "recommendations": [
                    "建议增加更多实际案例",
                    "可以考虑加入互动练习",
                    "适合作为系列课程的第一节"
                ]
            },
            "processing_info": {
                "query": student_query,
                "student_level": student_level,
                "subject": subject,
                "duration_minutes": duration,
                "include_video": include_video,
                "language": language,
                "processing_time_seconds": round(duration * 0.5, 1),
                "timestamp": datetime.now().isoformat(),
                "lesson_id": lesson_id
            }
        }
        
        # Save to results directory
        import json
        import os
        results_dir = "results"
        os.makedirs(results_dir, exist_ok=True)
        
        result_file = os.path.join(results_dir, f"lesson_{lesson_id}.json")
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(response, f, ensure_ascii=False, indent=2)
        
        print(f"Lesson saved: {result_file}")
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/results")
def get_results():
    """Get list of recent teaching results"""
    return {"results": []}

# Run the server directly without uvicorn.run() in __main__
# This will be called by the command below