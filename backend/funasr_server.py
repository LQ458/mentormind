#!/usr/bin/env python3
"""
FunASR Local Server — no Docker login required
Uses the funasr pip package directly.
Run: python funasr_server.py
Port: 10095
"""

import os
import asyncio
import traceback
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="FunASR Local Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model once at startup
asr_model = None

@app.on_event("startup")
async def load_model():
    global asr_model
    try:
        from funasr import AutoModel
        print("⏳ Loading FunASR Paraformer model (first run downloads ~500MB)...")
        asr_model = AutoModel(
            model="paraformer-zh",
            vad_model="fsmn-vad",
            punc_model="ct-punc",
            disable_update=True,
        )
        print("✅ FunASR model loaded")
    except ImportError:
        print("⚠️  funasr package not installed. Run: pip install funasr")
    except Exception as e:
        print(f"⚠️  Failed to load FunASR model: {e}")

@app.get("/")
async def health():
    return {"status": "ok", "service": "FunASR Local Server", "model_loaded": asr_model is not None}

@app.post("/transcribe")
async def transcribe(audio_file: UploadFile = File(...)):
    if asr_model is None:
        raise HTTPException(status_code=503, detail="FunASR model not loaded. Run: pip install funasr")
    
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(await audio_file.read())
        tmp_path = tmp.name

    try:
        result = asr_model.generate(input=tmp_path, batch_size_s=300)
        text = " ".join([r["text"] for r in result]) if result else ""
        return {"success": True, "text": text, "segments": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)

@app.post("/infer")
async def infer(audio_file: UploadFile = File(...)):
    """Alias for /transcribe — matches FunASR server protocol"""
    return await transcribe(audio_file)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=10095)
