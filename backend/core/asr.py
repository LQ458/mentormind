import os
import threading
import asyncio
from typing import Dict, Any, Optional

# Lazy-loaded AI models (loaded on first use)
_funasr_models = {}  # keyed by language code ("zh")
_whisper_model = None  # for English ASR
_whisper_lock = threading.Lock()  # Whisper is NOT thread-safe; serialize inference calls

def _get_whisper():
    """Return Whisper base model for English ASR (~140MB, low memory usage)."""
    global _whisper_model
    if _whisper_model is None:
        try:
            import whisper
            print("⏳ Loading Whisper base model for English (~140MB)...")
            _whisper_model = whisper.load_model("base")
            print("✅ Whisper base model loaded")
        except ImportError:
            raise RuntimeError("openai-whisper not installed. Run: pip install openai-whisper")
        except Exception as e:
            raise RuntimeError(f"Whisper model load error: {e}")
    return _whisper_model

def _get_funasr(language: str = "zh"):
    """Return ASR model for the given language.
    English → Whisper base (low memory, ~500MB RAM).
    Chinese → FunASR paraformer-zh.
    """
    global _funasr_models
    lang_key = "en" if language in ("en", "en-US", "en-GB") else "zh"
    if lang_key == "en":
        return _get_whisper()
    if lang_key not in _funasr_models:
        try:
            from funasr import AutoModel
            print("⏳ Loading FunASR Chinese model (paraformer-zh, first run downloads ~500MB)...")
            _funasr_models[lang_key] = AutoModel(
                model="paraformer-zh",
                vad_model="fsmn-vad",
                punc_model="ct-punc",
                disable_update=True,
            )
            print(f"✅ FunASR {lang_key} model loaded")
        except ImportError:
            raise RuntimeError("funasr not installed. Run: pip install funasr modelscope")
        except Exception as e:
            raise RuntimeError(f"FunASR model load error: {e}")
    return _funasr_models[lang_key]

_paddleocr_model = None

def _get_paddleocr():
    global _paddleocr_model
    if _paddleocr_model is None:
        try:
            from paddleocr import PaddleOCR
            print("⏳ Loading PaddleOCR model...")
            _paddleocr_model = PaddleOCR(use_angle_cls=True, lang="ch", use_gpu=False, show_log=False)
            print("✅ PaddleOCR model loaded")
        except ImportError:
            raise RuntimeError("paddleocr not installed. Run: pip install paddleocr paddlepaddle")
        except Exception as e:
            raise RuntimeError(f"PaddleOCR model load error: {e}")
    return _paddleocr_model

async def transcribe_with_local_model(tmp_path: str, language: str) -> str:
    """Transcribe an audio file using local FunASR or Whisper models."""
    lang_key = "en" if language in ("en", "en-US", "en-GB") else "zh"
    model = await asyncio.get_event_loop().run_in_executor(None, lambda: _get_funasr(language))

    if lang_key == "en":
        # Whisper is not thread-safe; acquire lock before inference
        def _whisper_transcribe(path):
            with _whisper_lock:
                # Force fp16=False to avoid CPU warnings and ensure stability
                return model.transcribe(path, fp16=False)
        result_raw = await asyncio.get_event_loop().run_in_executor(
            None, lambda: _whisper_transcribe(tmp_path)
        )
        return result_raw.get("text", "").strip()
    else:
        # FunASR paraformer-zh
        # batch_size_s=300 for faster processing on CPU
        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: model.generate(input=tmp_path, batch_size_s=300)
        )
        return " ".join(r["text"] for r in (result or []) if r.get("text", "").strip())

def extract_text_with_paddleocr(tmp_path: str) -> dict:
    """Extract text from an image using PaddleOCR."""
    ocr = _get_paddleocr()
    result = ocr.ocr(tmp_path, cls=True)
    lines = []
    for block in (result or []):
        for line in (block or []):
            if line and len(line) >= 2:
                text, conf = line[1]
                if text.strip():
                    lines.append(text)
    return {
        "text": "\n".join(lines),
        "lines": lines
    }

def get_asr_status() -> Dict[str, bool]:
    """Check the status of loaded ASR and OCR models."""
    return {
        "whisper_loaded": _whisper_model is not None,
        "funasr_zh_loaded": "zh" in _funasr_models,
        "paddleocr_loaded": _paddleocr_model is not None
    }
