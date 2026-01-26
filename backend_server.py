"""
FastAPI Backend Server for MentorMind Web Interface
Connects the Next.js frontend to the real Python backend
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import our modules
from main import process_student_query
from config import config
from create_classes import ClassCreator, ClassCreationRequest, Language, ClassCreationResult
from modules.sophisticated_pipeline import SophisticatedTeachingPipeline

app = FastAPI(
    title="MentorMind Backend API",
    description="Real backend API for MentorMind educational agent",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
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
    """Get system status and configuration"""
    # Get language support info
    creator = ClassCreator()
    lang_info = creator.get_language_support_info()
    
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
            "monthly_budget": config.COST_OPTIMIZATION.monthly_budget_usd,
            "current_month": 3.42,  # Placeholder - would track real usage
            "remaining": config.COST_OPTIMIZATION.monthly_budget_usd - 3.42
        },
        "configuration": {
            "max_regeneration_attempts": config.MAX_REGENERATION_ATTEMPTS,
            "quality_threshold": config.CRITIC_QUALITY_THRESHOLD,
            "tts_voice": config.TTS_VOICE,
            "avatar_image_path": config.AVATAR_IMAGE_PATH
        },
        "language_support": lang_info
    }


@app.get("/languages")
async def get_languages():
    """Get supported languages for class creation"""
    creator = ClassCreator()
    lang_info = creator.get_language_support_info()
    
    return {
        "supported_languages": lang_info["supported_languages"],
        "default_language": lang_info["default_language"],
        "bilingual_support": lang_info["bilingual_support"],
        "endpoints": {
            "create_class": "/create-class",
            "create_bilingual_class": "/create-class-bilingual",
            "teach": "/teach"
        }
    }

@app.post("/teach")
async def teach_endpoint(request: Dict[str, Any]):
    """Main teaching endpoint - processes student queries"""
    try:
        student_query = request.get("studentQuery", "")
        mode = request.get("mode", "batch")
        
        if not student_query:
            raise HTTPException(status_code=400, detail="studentQuery is required")
        
        print(f"Processing student query: {student_query}")
        
        # Process the query using our main pipeline
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
                "processing_time_seconds": result.get("processing_time_seconds", 0),
                "timestamp": datetime.now().isoformat()
            }
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"Error processing request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/create-class")
async def create_class_endpoint(request: Dict[str, Any]):
    """Create class/lesson endpoint with English and Chinese support"""
    try:
        topic = request.get("topic", "")
        language = request.get("language", "zh").lower()
        student_level = request.get("studentLevel", "beginner")
        duration_minutes = request.get("durationMinutes", 30)
        include_video = request.get("includeVideo", True)
        include_exercises = request.get("includeExercises", True)
        include_assessment = request.get("includeAssessment", True)
        custom_requirements = request.get("customRequirements")
        target_audience = request.get("targetAudience", "students")
        difficulty_level = request.get("difficultyLevel", "intermediate")
        
        if not topic:
            raise HTTPException(status_code=400, detail="topic is required")
        
        print(f"Creating class: topic='{topic}', language='{language}', level='{student_level}'")
        
        # Initialize class creator
        creator = ClassCreator()
        
        # Create request object
        class_request = ClassCreationRequest(
            topic=topic,
            language=Language(language) if language in ["en", "zh", "ja", "ko"] else Language.CHINESE,
            student_level=student_level,
            duration_minutes=duration_minutes,
            include_video=include_video,
            include_exercises=include_exercises,
            include_assessment=include_assessment,
            custom_requirements=custom_requirements,
            target_audience=target_audience,
            difficulty_level=difficulty_level
        )
        
        # Create class based on language
        result = None
        if language == "en":
            result = await creator.create_class_english(class_request)
        elif language == "zh":
            result = await creator.create_class_chinese(class_request)
        else:
            # Default to Chinese
            result = await creator.create_class_chinese(class_request)
        
        # Format response
        response = {
            "success": result.success,
            "language": result.language_used.value if result.language_used else language,
            "lesson_plan": result.lesson_plan.to_dict() if result.lesson_plan else None,
            "quality_assessment": result.quality_assessment.to_dict() if result.quality_assessment else None,
            "output_result": result.output_result,
            "cost_usd": result.cost_usd,
            "processing_time_seconds": result.processing_time_seconds,
            "error_message": result.error_message,
            "processing_info": {
                "topic": topic,
                "language": language,
                "student_level": student_level,
                "duration_minutes": duration_minutes,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"Error creating class: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/create-class-bilingual")
async def create_class_bilingual_endpoint(request: Dict[str, Any]):
    """Create bilingual class (English + Chinese)"""
    try:
        topic = request.get("topic", "")
        student_level = request.get("studentLevel", "beginner")
        duration_minutes = request.get("durationMinutes", 30)
        include_video = request.get("includeVideo", True)
        
        if not topic:
            raise HTTPException(status_code=400, detail="topic is required")
        
        print(f"Creating bilingual class: topic='{topic}', level='{student_level}'")
        
        # Initialize class creator
        creator = ClassCreator()
        
        # Create request object
        class_request = ClassCreationRequest(
            topic=topic,
            language=Language.ENGLISH,  # Base language
            student_level=student_level,
            duration_minutes=duration_minutes,
            include_video=include_video,
            include_exercises=True,
            include_assessment=True
        )
        
        # Create bilingual class
        results = await creator.create_class_bilingual(class_request)
        
        # Format response
        response = {
            "success": True,
            "english": {
                "success": results["english"].success,
                "lesson_plan": results["english"].lesson_plan.to_dict() if results["english"].lesson_plan else None,
                "quality_assessment": results["english"].quality_assessment.to_dict() if results["english"].quality_assessment else None,
                "cost_usd": results["english"].cost_usd,
                "processing_time_seconds": results["english"].processing_time_seconds,
                "error_message": results["english"].error_message
            },
            "chinese": {
                "success": results["chinese"].success,
                "lesson_plan": results["chinese"].lesson_plan.to_dict() if results["chinese"].lesson_plan else None,
                "quality_assessment": results["chinese"].quality_assessment.to_dict() if results["chinese"].quality_assessment else None,
                "cost_usd": results["chinese"].cost_usd,
                "processing_time_seconds": results["chinese"].processing_time_seconds,
                "error_message": results["chinese"].error_message
            },
            "processing_info": {
                "topic": topic,
                "student_level": student_level,
                "duration_minutes": duration_minutes,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"Error creating bilingual class: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sophisticated-teach")
async def sophisticated_teach_endpoint(request: Dict[str, Any]):
    """Sophisticated teaching pipeline with GraphRAG and dynamic memory"""
    try:
        student_query = request.get("studentQuery", "")
        student_id = request.get("studentId")
        include_video = request.get("includeVideo", True)
        mode = request.get("mode", "interactive")
        
        if not student_query:
            raise HTTPException(status_code=400, detail="studentQuery is required")
        
        print(f"Sophisticated teaching pipeline: query='{student_query}', student_id='{student_id}'")
        
        # Initialize sophisticated pipeline
        pipeline = SophisticatedTeachingPipeline(student_id)
        
        # Process student query
        result = await pipeline.process_student_query(
            student_query=student_query,
            include_video=include_video
        )
        
        # Format response
        response = {
            "success": result["success"],
            "pipeline_version": "1.0",
            "pipeline_steps": result.get("pipeline_steps", []),
            "final_output": result.get("final_output", {}),
            "teaching_state": result.get("teaching_state", {}),
            "processing_metrics": result.get("processing_metrics", {}),
            "metadata": result.get("metadata", {}),
            "error": result.get("error")
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"Error in sophisticated teaching pipeline: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/files/{file_type}/{filename}")
async def get_file(file_type: str, filename: str):
    """Serve generated files (audio, video, etc.)"""
    try:
        # Validate file type
        if file_type not in ["audio", "video", "scripts"]:
            raise HTTPException(status_code=400, detail="Invalid file type")
        
        # Construct file path
        base_dir = Path("data")
        if file_type == "audio":
            file_path = base_dir / "audio" / filename
        elif file_type == "video":
            file_path = base_dir / "videos" / filename
        elif file_type == "scripts":
            file_path = base_dir / "scripts" / filename
        else:
            file_path = base_dir / file_type / filename
        
        # Check if file exists
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # For now, return file info - in production would serve the file
        return {
            "file_type": file_type,
            "filename": filename,
            "path": str(file_path),
            "size_bytes": file_path.stat().st_size,
            "exists": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/results")
async def get_results():
    """Get list of recent teaching results"""
    try:
        results_dir = Path("results")
        if not results_dir.exists():
            return {"results": []}
        
        results = []
        for result_file in sorted(results_dir.glob("*.json"), reverse=True)[:10]:  # Last 10 results
            try:
                with open(result_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    results.append({
                        "id": result_file.stem,
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
    print("Starting MentorMind Backend Server...")
    print(f"API Key configured: {'Yes' if os.getenv('DEEPSEEK_API_KEY') else 'No'}")
    print(f"Server running on http://localhost:8000")
    print(f"Web interface: http://localhost:3000")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )