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
            "current_month": 3.42,  # Placeholder - would track real usage
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