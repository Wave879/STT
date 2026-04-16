#!/usr/bin/env python3
"""Test full web UI workflow"""

import requests
import json
import time
from pathlib import Path

BASE_URL = "http://localhost:8000"

# Find audio file
audio_files = list(Path('web/uploads').glob('*.mp3'))
if not audio_files:
    print("❌ No audio files")
    exit(1)

audio_path = audio_files[0]
print(f"📁 Testing with: {audio_path.name}")

# Step 1: Upload
print("\n1️⃣ Uploading...")
with open(audio_path, 'rb') as f:
    files = {'audio': f}
    resp = requests.post(f'{BASE_URL}/api/upload', files=files)
    print(f"   Status: {resp.status_code}")
    data = resp.json()
    print(f"   Response: {data}")
    
    if resp.status_code != 200:
        print(f"❌ Upload failed")
        exit(1)
    
    job_id = data.get('job_id')
    print(f"✅ Job ID: {job_id}")

# Step 2: Process
print("\n2️⃣ Starting process...")
resp = requests.post(f'{BASE_URL}/api/process', json={'job_id': job_id})
print(f"   Status: {resp.status_code}")
print(f"   Response: {resp.json()}")

# Step 3: Poll status
print("\n3️⃣ Polling status...")
for i in range(60):  # 60 seconds max
    resp = requests.get(f'{BASE_URL}/api/status/{job_id}')
    if resp.status_code != 200:
        print(f"❌ Status check failed: {resp.status_code}")
        break
    
    job = resp.json()
    status = job.get('status')
    msg = job.get('message', '')
    step = job.get('step', 0)
    
    print(f"   [{i}s] Step {step}: {status} - {msg}")
    
    if status in ('complete', 'error'):
        print(f"\n{'='*60}")
        print(f"FINAL STATUS: {status}")
        print(f"{'='*60}")
        
        if status == 'error':
            print(f"Message: {job.get('message')}")
        else:
            az = (job.get('stt_azure') or '')[:100]
            wh = (job.get('stt_whisper') or '')[:100]
            mai = (job.get('stt_mai') or '')[:100]
            
            print(f"\n🔵 Azure: {az}")
            print(f"🔵 Whisper: {wh}")
            print(f"🔵 MAI: {mai}")
        
        break
    
    time.sleep(1)

print("\n✅ Test complete")
