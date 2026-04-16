#!/usr/bin/env python3
"""Quick test script - MAI Speech API transcription"""
import os, json, requests
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env')

key = os.getenv('MAI_SPEECH_KEY', '')
url = 'https://mai-speech.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15'
headers = {'Ocp-Apim-Subscription-Key': key}
definition = {
    'locales': ['th-TH'],
    'profanityFilterMode': 'None',
    'channels': [0, 1],
    'diarizationSettings': {'minSpeakerCount': 2, 'maxSpeakerCount': 2}
}

audio_file = Path(__file__).parent.parent / 'web' / 'uploads' / '07a78e25.mp3'
print(f'ส่งไฟล์: {audio_file.name} ({audio_file.stat().st_size/1024:.1f} KB)')

with open(audio_file, 'rb') as f:
    resp = requests.post(url, headers=headers,
        files={
            'audio': ('test.mp3', f, 'audio/mpeg'),
            'definition': (None, json.dumps(definition), 'application/json')
        },
        timeout=120)

data = resp.json()
phrases = data.get('phrases', [])
combined = data.get('combinedPhrases', [])

print(f'\nHTTP {resp.status_code} | phrases: {len(phrases)} | combined: {len(combined)}')
print('\n======= TRANSCRIPT BY TIMESTAMP =======')
for p in phrases:
    spk = p.get('speaker', 0) or 0
    channel = p.get('channel', '?')
    txt = p.get('text', '').strip()
    offset_sec = p.get('offsetInTicks', 0) // 10_000_000
    mins = offset_sec // 60
    secs = offset_sec % 60
    print(f'[{mins:02d}:{secs:02d}] CH{channel}: {txt}')

print('\n======= COMBINED TEXT PER CHANNEL =======')
for c in combined:
    ch = c.get('channel', '?')
    text = c.get('text', '')
    print(f'\n--- Channel {ch} ---')
    print(text[:1000])
