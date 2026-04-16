#!/usr/bin/env python3
"""
ทดสอบ Azure OpenAI Whisper API
- เช็ค deployments ที่มี
- ถอดความไฟล์เสียงด้วย Azure Whisper
"""
import os, sys, json, requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env')

ENDPOINT   = os.getenv('AZURE_OPENAI_ENDPOINT', '').rstrip('/')
KEY        = os.getenv('AZURE_OPENAI_KEY', '')
DEPLOYMENT = os.getenv('AZURE_DEPLOYMENT_NAME', 'whisper')  # ชื่อ deployment whisper

# ไฟล์ทดสอบ
AUDIO_FILE = Path(__file__).parent.parent / 'web' / 'uploads' / '07a78e25.mp3'


def list_deployments():
    print('\n=== Azure OpenAI Deployments ===')
    url = f'{ENDPOINT}/openai/deployments?api-version=2024-02-01'
    r = requests.get(url, headers={'api-key': KEY}, timeout=10)
    print(f'HTTP {r.status_code}')
    if r.status_code == 200:
        deps = r.json().get('data', [])
        for d in deps:
            name = d.get('id', '?')
            model = d.get('model', '?')
            print(f'  deployment: {name}  model: {model}')
        return [d.get('id') for d in deps]
    else:
        print(r.text[:300])
        return []


def transcribe_whisper(audio_path: Path, deployment: str = None):
    """ถอดความด้วย Azure OpenAI Whisper"""
    dep = deployment or DEPLOYMENT
    print(f'\n=== Azure Whisper Transcription ===')
    print(f'Deployment: {dep}')
    print(f'File: {audio_path.name} ({audio_path.stat().st_size/1024:.1f} KB)')

    # Azure OpenAI Whisper endpoint
    url = f'{ENDPOINT}/openai/deployments/{dep}/audio/transcriptions?api-version=2024-06-01'
    headers = {'api-key': KEY}

    with open(audio_path, 'rb') as f:
        ext = audio_path.suffix.lower().lstrip('.')
        mime_map = {'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'm4a': 'audio/mp4',
                    'flac': 'audio/flac', 'webm': 'audio/webm', 'ogg': 'audio/ogg'}
        mime = mime_map.get(ext, 'audio/mpeg')

        files = {
            'file': (audio_path.name, f, mime),
            'response_format': (None, 'verbose_json'),
            'language': (None, 'th'),
        }
        print('ส่งไฟล์ไปถอดความ...')
        resp = requests.post(url, headers=headers, files=files, timeout=300)

    print(f'HTTP {resp.status_code}')
    if resp.status_code == 200:
        data = resp.json()
        text = data.get('text', '')
        duration = data.get('duration', 0)
        segments = data.get('segments', [])
        print(f'Duration: {duration:.1f}s | Segments: {len(segments)}')
        print()
        if segments:
            print('=== TRANSCRIPT WITH TIMESTAMPS ===')
            for seg in segments[:20]:
                start = seg.get('start', 0)
                end = seg.get('end', 0)
                t = seg.get('text', '').strip()
                print(f'[{int(start//60):02d}:{int(start%60):02d}-{int(end//60):02d}:{int(end%60):02d}] {t}')
            if len(segments) > 20:
                print(f'  ... ({len(segments)-20} segments more)')
        else:
            print('=== FULL TEXT ===')
            print(text[:1000])
        return text
    else:
        print('Error:', resp.text[:500])
        return None


if __name__ == '__main__':
    if not KEY:
        print('ERROR: AZURE_OPENAI_KEY ไม่ได้ตั้งค่า')
        sys.exit(1)

    print(f'Endpoint: {ENDPOINT}')

    # 1. ดู deployments ทั้งหมด
    deps = list_deployments()

    # 2. หา whisper deployment
    whisper_dep = None
    for d in deps:
        if 'whisper' in d.lower():
            whisper_dep = d
            break

    if not whisper_dep and DEPLOYMENT:
        whisper_dep = DEPLOYMENT
        print(f'\n[INFO] ใช้ deployment จาก .env: {whisper_dep}')

    if not whisper_dep:
        print('\nERROR: ไม่พบ whisper deployment')
        sys.exit(1)

    # 3. ถอดความ
    transcribe_whisper(AUDIO_FILE, whisper_dep)
