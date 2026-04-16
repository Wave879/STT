# WhisperX API Server

Docker-based WhisperX API server with multilingual transcription, optional speaker diarization, and word-level timestamps.

## Features
- Multi-language ASR
- Speaker diarization (`include_speaker_labels`)
- Word-level timestamps (`include_word_timestamps`)
- Output formats: `json`, `srt`, `txt`, `vtt`, `all`
- GPU-ready via NVIDIA CUDA

## Prerequisites
- Docker + NVIDIA Container Toolkit
- NVIDIA GPU (8GB+ VRAM recommended)
- Hugging Face token (for diarization)

## Files
- `Dockerfile`
- `docker-compose.yml`
- `requirements.txt`
- `app.py`
- `config.py`

## Run
```bash
cd whisperx_api_server
docker compose up --build
```

## Health Check
```bash
curl http://localhost:5772/health
```

## Basic Transcription
```bash
curl -X POST http://localhost:5772/v1/media/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "media_url": "https://your-server.com/audio.wav"
  }'
```

## Speaker Diarization
```bash
curl -X POST http://localhost:5772/v1/media/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "media_url": "https://your-server.com/meeting.wav",
    "include_speaker_labels": true,
    "max_speakers": 5
  }'
```

## Environment Variables
- `PORT` (default: `5772`)
- `TIMEOUT_SECONDS` (default: `1200`)
- `DEFAULT_MODEL` (default: `large-v3`)
- `HUGGINGFACE_TOKEN` (required for diarization)
- `DEVICE` (default: `cuda`)
- `COMPUTE_TYPE` (default: `float16`)

## Notes
- For N8N or other containers on host Docker network: `http://host.docker.internal:5772/v1/media/transcribe`
- For local apps: `http://localhost:5772/v1/media/transcribe`
