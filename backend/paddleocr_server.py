#!/usr/bin/env python3
"""
PaddleOCR Local Server — no Docker login required
Uses the paddleocr pip package directly.
Run: python paddleocr_server.py
Port: 8866
"""

import os
import base64
import traceback
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="PaddleOCR Local Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ocr_model = None

@app.on_event("startup")
async def load_model():
    global ocr_model
    try:
        from paddleocr import PaddleOCR
        print("⏳ Loading PaddleOCR model...")
        ocr_model = PaddleOCR(
            use_angle_cls=True,
            lang="ch",
            use_gpu=False,
        )
        print("✅ PaddleOCR model loaded")
    except ImportError:
        print("⚠️  paddleocr not installed. Run: pip install paddleocr paddlepaddle")
    except Exception as e:
        print(f"⚠️  Failed to load PaddleOCR: {e}")

@app.get("/")
async def health():
    return {"status": "ok", "service": "PaddleOCR Local Server", "model_loaded": ocr_model is not None}

class Base64Request(BaseModel):
    image: str  # base64-encoded image

@app.post("/ocr")
async def ocr_base64(req: Base64Request):
    if ocr_model is None:
        raise HTTPException(status_code=503, detail="PaddleOCR not loaded. Run: pip install paddleocr paddlepaddle")
    
    image_bytes = base64.b64decode(req.image)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        result = ocr_model.ocr(tmp_path, cls=True)
        lines = []
        for block in (result or []):
            for line in (block or []):
                # line = [[box], [text, confidence]]
                if line and len(line) >= 2:
                    text, conf = line[1]
                    lines.append({"text": text, "confidence": float(conf)})
        full_text = " ".join(l["text"] for l in lines)
        return {"success": True, "text": full_text, "lines": lines}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)

@app.post("/upload")
async def ocr_upload(image: UploadFile = File(...)):
    """Accept raw image file upload"""
    if ocr_model is None:
        raise HTTPException(status_code=503, detail="PaddleOCR not loaded")
    
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(await image.read())
        tmp_path = tmp.name

    try:
        result = ocr_model.ocr(tmp_path, cls=True)
        lines = []
        for block in (result or []):
            for line in (block or []):
                if line and len(line) >= 2:
                    text, conf = line[1]
                    lines.append({"text": text, "confidence": float(conf)})
        full_text = " ".join(l["text"] for l in lines)
        return {"success": True, "text": full_text, "lines": lines}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8866)
