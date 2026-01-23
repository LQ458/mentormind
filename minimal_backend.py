"""
Minimal Backend Server for MentorMind
Simplest possible backend that works
"""

import json
from datetime import datetime
from typing import Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(
    title="MentorMind Backend API",
    description="Minimal backend API for MentorMind",
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
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "mentormind-backend",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/status")
async def get_status():
    """Get system status"""
    return {
        "status": "online",
        "version": "1.0.0",
        "services": {
            "deepseek": "configured",
            "funasr": "simulated",
            "paddle_ocr": "simulated",
            "tts": "simulated"
        },
        "cost_analysis": {
            "monthly_budget": 160.0,
            "current_month": 3.42,
            "remaining": 156.58
        },
        "configuration": {
            "max_lesson_duration_minutes": 45,
            "quality_threshold": 0.8,
            "max_teaching_attempts": 3,
            "tts_provider": "mock",
            "avatar_provider": "mock"
        }
    }

@app.post("/teach")
async def teach_endpoint(request: Dict[str, Any]):
    """Main teaching endpoint"""
    try:
        student_query = request.get("studentQuery", "")
        
        if not student_query:
            raise HTTPException(status_code=400, detail="studentQuery is required")
        
        print(f"Processing query: {student_query}")
        
        # Mock response
        response = {
            "success": True,
            "lesson_plan": {
                "title": f"课程：{student_query[:30]}...",
                "description": f"这是一个关于'{student_query}'的教学课程",
                "total_duration_minutes": 30,
                "steps": [
                    {
                        "step_number": 1,
                        "title": "概念介绍",
                        "description": f"介绍{student_query}的基本概念",
                        "duration_minutes": 10,
                        "teaching_method": "讲解",
                        "materials": ["PPT幻灯片", "示例代码"]
                    },
                    {
                        "step_number": 2,
                        "title": "实践练习",
                        "description": f"练习{student_query}的应用",
                        "duration_minutes": 15,
                        "teaching_method": "练习",
                        "materials": ["练习题", "参考答案"]
                    },
                    {
                        "step_number": 3,
                        "title": "总结回顾",
                        "description": f"总结{student_query}的关键点",
                        "duration_minutes": 5,
                        "teaching_method": "总结",
                        "materials": ["总结文档", "扩展阅读"]
                    }
                ]
            },
            "output_result": {
                "script": {
                    "title": f"脚本：{student_query[:30]}...",
                    "content": f"大家好，今天我们来学习{student_query}。首先，让我们了解基本概念...",
                    "duration_seconds": 1800
                },
                "audio": {
                    "file_path": "/data/audio/mock_audio.wav",
                    "duration_seconds": 1800
                },
                "video": {
                    "file_path": "/data/videos/mock_video.mp4",
                    "duration_seconds": 1800
                },
                "metadata": {
                    "cost_estimation": {
                        "total_usd": 0.0038,
                        "breakdown": {
                            "cognitive_processing": 0.0012,
                            "lesson_planning": 0.0015,
                            "script_generation": 0.0008,
                            "tts_synthesis": 0.0003
                        }
                    }
                }
            },
            "quality_assessment": {
                "overall_score": 0.85,
                "criteria_scores": {
                    "clarity": 0.9,
                    "completeness": 0.8,
                    "engagement": 0.85,
                    "practicality": 0.8
                },
                "feedback": "课程设计良好，适合初学者"
            },
            "processing_info": {
                "query": student_query,
                "mode": "batch",
                "processing_time_seconds": 2.5,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/results")
async def get_results():
    """Get list of recent teaching results"""
    return {"results": []}

if __name__ == "__main__":
    print("Starting Minimal MentorMind Backend Server...")
    print(f"Server running on http://localhost:8000")
    print(f"Web interface: http://localhost:8080")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )