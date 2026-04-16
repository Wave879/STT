#!/usr/bin/env python3
"""Test script to measure STT processing performance"""

import sys
import os
import time
import json
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.resolve()
os.chdir(PROJECT_DIR)
sys.path.insert(0, str(PROJECT_DIR / 'scripts'))

from dotenv import load_dotenv
load_dotenv()

# Find test audio file
test_file = None
for pattern in ['output/stt_final/*.mp3', 'web/uploads/*', 'input/audio_files/*']:
    files = list(PROJECT_DIR.glob(pattern))
    if files:
        test_file = files[0]
        break

if not test_file:
    print("❌ ไม่พบไฟล์เสียงทดสอบ")
    sys.exit(1)

print(f"📁 Testing with: {test_file.name} ({test_file.stat().st_size / 1024 / 1024:.1f} MB)")
print()

# ── Step 1: Validate ──
print("Step 1: Validate Audio...")
start = time.time()
supported = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm', '.mp4', '.mov', '.m4v'}
if test_file.suffix.lower() not in supported:
    print(f"❌ Unsupported format: {test_file.suffix}")
    sys.exit(1)
print(f"✓ {time.time() - start:.2f}s\n")

# ── Step 2: Preprocess ──
print("Step 2: Preprocess (Clean Noise)...")
start = time.time()
try:
    from audio_preprocessor import AudioPreprocessor
    cleaned = PROJECT_DIR / 'test_cleaned.wav'
    ok, msg = AudioPreprocessor().preprocess_audio(str(test_file), str(cleaned))
    if ok and cleaned.exists():
        process_file = cleaned
        print(f"✓ Cleaned: {cleaned.stat().st_size / 1024 / 1024:.1f} MB - {time.time() - start:.2f}s")
    else:
        process_file = test_file
        print(f"⚠ Skipped - {time.time() - start:.2f}s")
except Exception as e:
    process_file = test_file
    print(f"⚠ Error: {e} - {time.time() - start:.2f}s")
print()

# ── Step 3: STT (3 models) ──
print("Step 3: STT Processing (3 models in parallel)...")

cfg_path = PROJECT_DIR / 'config' / 'stt_models_config.json'
with open(cfg_path, 'r', encoding='utf-8') as f:
    stt_cfg = json.load(f)

from stt_apis import STTAPIManager
mgr = STTAPIManager(stt_cfg.get('stt_engines', []))
engines = mgr.clients

results = {}

# Azure
print("  - Azure STT...", end='', flush=True)
start_s3 = time.time()
try:
    az_text, az_conf = engines['model1'].transcribe(str(process_file))
    results['azure'] = (len(az_text), az_conf, time.time() - start_s3)
    print(f" ✓ {len(az_text)} chars, conf={az_conf:.2f} ({time.time() - start_s3:.2f}s)")
except Exception as e:
    print(f" ❌ {e}")
    results['azure'] = (0, 0, time.time() - start_s3)

# Whisper
print("  - Whisper STT...", end='', flush=True)
start_s3 = time.time()
try:
    wh_text, wh_conf = engines['model2'].transcribe(str(process_file))
    results['whisper'] = (len(wh_text), wh_conf, time.time() - start_s3)
    print(f" ✓ {len(wh_text)} chars, conf={wh_conf:.2f} ({time.time() - start_s3:.2f}s)")
except Exception as e:
    print(f" ❌ {e}")
    results['whisper'] = (0, 0, time.time() - start_s3)

# MAI
print("  - MAI STT...", end='', flush=True)
start_s3 = time.time()
try:
    mai_text, mai_conf = engines['model3'].transcribe(str(process_file))
    results['mai'] = (len(mai_text), mai_conf, time.time() - start_s3)
    print(f" ✓ {len(mai_text)} chars, conf={mai_conf:.2f} ({time.time() - start_s3:.2f}s)")
except Exception as e:
    print(f" ❌ {e}")
    results['mai'] = (0, 0, time.time() - start_s3)

print()

# ── Summary ──
print("📊 Performance Summary:")
total_time = sum(r[2] for r in results.values())
print(f"  Total STT time (sequential): {total_time:.2f}s")
print(f"  Slowest: {max(results.items(), key=lambda x: x[1][2])[0]} ({max(r[2] for r in results.values()):.2f}s)")
print(f"  Fastest: {min(results.items(), key=lambda x: x[1][2])[0]} ({min(r[2] for r in results.values()):.2f}s)")
print()

# Cleanup
if 'cleaned' in locals() and cleaned.exists():
    cleaned.unlink()
    print("✓ Cleaned up temp files")
