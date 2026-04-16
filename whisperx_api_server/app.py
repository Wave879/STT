import os
import re
import tempfile
import requests
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import config

app = FastAPI(title="WhisperX API Server", version="1.0.0")

_model = None
_align_model = None
_align_metadata = None
_diarize_model = None


def _lazy_import_whisperx():
    try:
        import whisperx  # type: ignore
        return whisperx
    except Exception as e:
        raise RuntimeError(f"Failed to import whisperx: {e}")


def _load_models(language_code: Optional[str] = None):
    global _model, _align_model, _align_metadata
    whisperx = _lazy_import_whisperx()

    if _model is None:
        _model = whisperx.load_model(config.DEFAULT_MODEL, config.DEVICE, compute_type=config.COMPUTE_TYPE)

    if language_code and (_align_model is None or _align_metadata is None):
        _align_model, _align_metadata = whisperx.load_align_model(language_code=language_code, device=config.DEVICE)


def _load_diarize_model():
    global _diarize_model
    whisperx = _lazy_import_whisperx()

    if not config.HUGGINGFACE_TOKEN:
        raise RuntimeError("HUGGINGFACE_TOKEN is not set")

    if _diarize_model is None:
        _diarize_model = whisperx.DiarizationPipeline(use_auth_token=config.HUGGINGFACE_TOKEN, device=config.DEVICE)


def _download_media(url: str) -> str:
    os.makedirs(config.TEMP_DIR, exist_ok=True)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".media", dir=config.TEMP_DIR)
    with requests.get(url, timeout=config.TIMEOUT_SECONDS, stream=True) as r:
        r.raise_for_status()
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            if chunk:
                tmp.write(chunk)
    tmp.flush()
    tmp.close()
    return tmp.name


def _to_srt(segments: List[Dict[str, Any]]) -> str:
    def _ts(t: float) -> str:
        h = int(t // 3600)
        m = int((t % 3600) // 60)
        s = int(t % 60)
        ms = int((t - int(t)) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    lines: List[str] = []
    for idx, seg in enumerate(segments, start=1):
        lines.append(str(idx))
        lines.append(f"{_ts(float(seg.get('start', 0.0)))} --> {_ts(float(seg.get('end', 0.0)))}")
        lines.append((seg.get("text") or "").strip())
        lines.append("")
    return "\n".join(lines)


def _to_vtt(segments: List[Dict[str, Any]]) -> str:
    def _ts(t: float) -> str:
        h = int(t // 3600)
        m = int((t % 3600) // 60)
        s = int(t % 60)
        ms = int((t - int(t)) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"

    lines: List[str] = ["WEBVTT", ""]
    for seg in segments:
        lines.append(f"{_ts(float(seg.get('start', 0.0)))} --> {_ts(float(seg.get('end', 0.0)))}")
        lines.append((seg.get("text") or "").strip())
        lines.append("")
    return "\n".join(lines)


class TranscribeRequest(BaseModel):
    media_url: str = Field(..., description="Direct URL to audio/video file")
    include_speaker_labels: bool = False
    include_word_timestamps: bool = False
    output_format: str = Field("json", pattern="^(json|srt|txt|vtt|all)$")
    language: Optional[str] = None
    task: str = Field("transcribe", pattern="^(transcribe|translate)$")
    max_speakers: Optional[int] = None
    beam_size: int = 5
    temperature: float = 0.0


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "port": config.PORT,
        "default_model": config.DEFAULT_MODEL,
        "diarization_enabled": bool(config.HUGGINGFACE_TOKEN),
    }


@app.post("/v1/media/transcribe")
def transcribe(req: TranscribeRequest) -> Dict[str, Any]:
    import time

    t0 = time.time()
    media_path = ""

    try:
        media_path = _download_media(req.media_url)
        whisperx = _lazy_import_whisperx()

        _load_models(language_code=req.language)
        audio = whisperx.load_audio(media_path)

        result = _model.transcribe(
            audio,
            language=req.language,
            task=req.task,
            beam_size=req.beam_size,
            temperature=req.temperature,
        )

        detected_lang = result.get("language")
        if req.include_word_timestamps:
            _load_models(language_code=detected_lang or req.language)
            result = whisperx.align(result["segments"], _align_model, _align_metadata, audio, config.DEVICE)

        if req.include_speaker_labels:
            _load_diarize_model()
            diarize_segments = _diarize_model(audio, min_speakers=1, max_speakers=req.max_speakers)
            result = whisperx.assign_word_speakers(diarize_segments, result)

        text = result.get("text") or " ".join((s.get("text") or "").strip() for s in result.get("segments", []))
        segments = result.get("segments", [])

        response_payload: Dict[str, Any] = {
            "text": text.strip(),
            "detected_language": detected_lang,
            "segments": segments,
        }

        if req.output_format in ("txt", "all"):
            response_payload["txt"] = response_payload["text"]
        if req.output_format in ("srt", "all"):
            response_payload["srt"] = _to_srt(segments)
        if req.output_format in ("vtt", "all"):
            response_payload["vtt"] = _to_vtt(segments)

        return {
            "endpoint": "/v1/media/transcribe",
            "code": 200,
            "response": response_payload,
            "processing_time": round(time.time() - t0, 2),
        }

    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"media_url download failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if media_path and os.path.exists(media_path):
            try:
                os.remove(media_path)
            except OSError:
                pass
