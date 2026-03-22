import os
import threading
import asyncio
import subprocess
import tempfile
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
    """Backward-compatible wrapper that returns only the transcribed text."""
    result = await transcribe_with_local_model_result(tmp_path, language)
    return result["text"]


def _normalize_audio_for_asr(input_path: str) -> str:
    """
    Convert uploaded audio into a stable mono 16k wav file for local ASR.
    Returns the normalized temp file path.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        output_path = tmp.name

    command = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-vn",
        output_path,
    ]
    process = subprocess.run(command, capture_output=True, text=True)
    if process.returncode != 0:
        if os.path.exists(output_path):
            os.unlink(output_path)
        raise RuntimeError((process.stderr or process.stdout or "ffmpeg conversion failed").strip())
    return output_path


def _detect_audio_language(input_path: str) -> str:
    """
    Detect the dominant language in an audio file.
    Returns 'zh' for Chinese, otherwise the detected Whisper language code.
    """
    model = _get_whisper()
    import whisper

    with _whisper_lock:
        audio = whisper.load_audio(input_path)
        audio = whisper.pad_or_trim(audio)
        mel = whisper.log_mel_spectrogram(audio).to(model.device)
        _, probabilities = model.detect_language(mel)

    detected = max(probabilities, key=probabilities.get)
    return "zh" if detected.startswith("zh") else detected


async def transcribe_with_local_model_result(tmp_path: str, language: str = "auto") -> Dict[str, str]:
    """
    Transcribe an audio file with automatic language detection.

    Chinese audio is routed to FunASR after ffmpeg normalization.
    All other languages are transcribed with Whisper.
    """
    normalized_path = await asyncio.get_event_loop().run_in_executor(None, lambda: _normalize_audio_for_asr(tmp_path))
    requested_language = (language or "auto").lower()
    detected_language = requested_language

    try:
        if requested_language in {"auto", "", "unknown"}:
            detected_language = await asyncio.get_event_loop().run_in_executor(
                None, lambda: _detect_audio_language(normalized_path)
            )

        use_funasr = detected_language == "zh"
        model = await asyncio.get_event_loop().run_in_executor(
            None, lambda: _get_funasr("zh" if use_funasr else detected_language)
        )

        if use_funasr:
            result = await asyncio.get_event_loop().run_in_executor(
                None, lambda: model.generate(input=normalized_path, batch_size_s=300)
            )

            if isinstance(result, dict):
                candidates = [result]
            else:
                candidates = result or []

            text = " ".join(item.get("text", "").strip() for item in candidates if item.get("text", "").strip())
        else:
            def _whisper_transcribe(path: str):
                with _whisper_lock:
                    return model.transcribe(path, fp16=False, language=None if requested_language == "auto" else requested_language)

            result_raw = await asyncio.get_event_loop().run_in_executor(
                None, lambda: _whisper_transcribe(normalized_path)
            )
            detected_language = result_raw.get("language") or detected_language or "en"
            text = result_raw.get("text", "").strip()

        return {
            "text": text,
            "detected_language": detected_language or "en",
            "engine": "funasr" if use_funasr else "whisper",
        }
    finally:
        if os.path.exists(normalized_path):
            os.unlink(normalized_path)

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
