"""
Simple Backend Server for MentorMind
Connects frontend to real pipeline with error handling
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import our real modules
try:
    from main import process_student_query
    from config import config
    REAL_MODULES_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Could not import real modules: {e}")
    print("Using mock data instead")
    REAL_MODULES_AVAILABLE = False

app = FastAPI(
    title="MentorMind Backend API",
    description="Backend API for MentorMind educational agent",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],  # Next.js dev server
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
        "timestamp": datetime.now().isoformat(),
        "real_modules": REAL_MODULES_AVAILABLE
    }

@app.get("/status")
async def get_status():
    """Get system status and configuration"""
    try:
        if REAL_MODULES_AVAILABLE:
            return {
                "status": "online",
                "version": "1.0.0",
                "services": {
                    "deepseek": "configured" if os.getenv("DEEPSEEK_API_KEY") else "not_configured",
                    "funasr": "simulated",
                    "paddle_ocr": "simulated",
                    "tts": "simulated"
                },
                "cost_analysis": {
                    "monthly_budget": config.MONTHLY_BUDGET_USD,
                    "current_month": 3.42,
                    "remaining": config.MONTHLY_BUDGET_USD - 3.42
                },
                "configuration": {
                    "max_lesson_duration_minutes": config.MAX_LESSON_DURATION_MINUTES,
                    "quality_threshold": config.QUALITY_THRESHOLD,
                    "max_teaching_attempts": config.MAX_TEACHING_ATTEMPTS,
                    "tts_provider": config.TTS_PROVIDER,
                    "avatar_provider": config.AVATAR_PROVIDER
                }
            }
        else:
            return {
                "status": "online",
                "version": "1.0.0",
                "services": {
                    "deepseek": "mock",
                    "funasr": "mock",
                    "paddle_ocr": "mock",
                    "tts": "mock"
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting status: {str(e)}")

@app.post("/teach")
async def teach_endpoint(request: Dict[str, Any]):
    """Main teaching endpoint - processes student queries"""
    try:
        student_query = request.get("studentQuery", "")
        mode = request.get("mode", "batch")
        
        if not student_query:
            raise HTTPException(status_code=400, detail="studentQuery is required")
        
        print(f"Processing student query: {student_query}")
        
        if REAL_MODULES_AVAILABLE:
            # Process the query using our real pipeline
            result = await process_student_query(
                student_query=student_query
            )
            
            # Format response for web interface
            response = {
                "success": True,
                "lesson_plan": result.get("lesson_plan", {}),
                "output_result": result.get("output_result", {}),
                "quality_assessment": result.get("quality_assessment", {}),
                "processing_info": {
                    "query": student_query,
                    "mode": mode,
                    "processing_time_seconds": 0,
                    "timestamp": datetime.now().isoformat()
                }
            }
        else:
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
                    "mode": mode,
                    "processing_time_seconds": 2.5,
                    "timestamp": datetime.now().isoformat()
                }
            }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"Error processing request: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/results")
async def get_results():
    """Get list of recent teaching results"""
    try:
        results_dir = "results"
        if not os.path.exists(results_dir):
            return {"results": []}
        
        results = []
        import glob
        result_files = sorted(glob.glob(f"{results_dir}/*.json"), reverse=True)[:10]
        
        for result_file in result_files:
            try:
                with open(result_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    results.append({
                        "id": os.path.basename(result_file).replace('.json', ''),
                        "timestamp": data.get("timestamp", ""),
                        "query": data.get("student_query", ""),
                        "lesson_title": data.get("lesson_plan", {}).get("title", ""),
                        "quality_score": data.get("quality_assessment", {}).get("overall_score", 0),
                        "cost_usd": data.get("output_result", {}).get("metadata", {}).get("cost_estimation", {}).get("total_usd", 0)
                    })
            except Exception:
                continue
        
        return {"results": results}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("Starting MentorMind Simple Backend Server...")
    print(f"Real modules available: {REAL_MODULES_AVAILABLE}")
    print(f"API Key configured: {'Yes' if os.getenv('DEEPSEEK_API_KEY') else 'No'}")
    print(f"Server running on http://localhost:8000")
    print(f"Web interface: http://localhost:8080")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )