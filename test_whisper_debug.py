#!/usr/bin/env python3
"""Debug script to test Whisper flow exactly as web server does"""

import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
os.chdir(Path.cwd())

# Load config exact เดียวกับ web server
cfg_path = Path('config') / 'stt_models_config.json'
with open(cfg_path) as f:
    stt_cfg = json.load(f)

print("=" * 60)
print("🔍 TESTING: Simulating Web Server Flow")
print("=" * 60)

# Import manager
from scripts.stt_apis import STTAPIManager

mgr = STTAPIManager(stt_cfg.get('stt_engines', []))
engines = mgr.clients

print(f"\n📦 Clients loaded:")
for model_id, client in engines.items():
    print(f"  - {model_id}: {client.__class__.__name__}")
    if hasattr(client, 'include_speaker_labels'):
        print(f"    └─ speaker_labels={client.include_speaker_labels}")

# Find audio file
audio_files = list(Path('web/uploads').glob('*.mp3'))
if not audio_files:
    print("\n❌ No files in web/uploads")
    exit(1)

audio_path = audio_files[0]
print(f"\n🎵 Audio file: {audio_path.name} ({audio_path.stat().st_size / 1024 / 1024:.2f} MB)")

# Test Whisper (model2) exactly
print("\n" + "=" * 60)
print("🔵 Testing model2 (External Whisper):")
print("=" * 60)

try:
    text, conf = engines['model2'].transcribe(str(audio_path))
    if text.startswith('['):
        print(f"❌ Error: {text}")
    else:
        print(f"✅ Success!")
        print(f"   Confidence: {conf:.2f}")
        print(f"   Text preview: {text[:100]}...")
except Exception as e:
    print(f"❌ Exception: {e}")
    import traceback
    traceback.print_exc()
