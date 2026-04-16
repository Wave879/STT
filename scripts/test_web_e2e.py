#!/usr/bin/env python3
"""ทดสอบ web API end-to-end: upload → process → poll → result"""
import requests, json, time, sys

BASE = 'http://localhost:8000'
AUDIO = 'web/uploads/07a78e25.mp3'
MODEL = sys.argv[1] if len(sys.argv) > 1 else 'model1'  # model1=Azure, model3=MAI, all=ทั้งหมด

print(f'=== Web API E2E Test (model={MODEL}) ===')

# 1. Upload
with open(AUDIO, 'rb') as f:
    r = requests.post(f'{BASE}/api/upload',
        files={'file': ('test.mp3', f, 'audio/mpeg')}, timeout=30)
print(f'[1] Upload: {r.status_code}')
if r.status_code != 200:
    print('ERROR:', r.text); sys.exit(1)
job_id = r.json()['job_id']
print(f'    job_id: {job_id}')

# 2. Start process
r = requests.post(f'{BASE}/api/process',
    json={'job_id': job_id, 'model': MODEL}, timeout=10)
print(f'[2] Process start: {r.status_code} {r.text[:100]}')

# 3. Poll status until done
print('[3] Polling...')
start = time.time()
last_msg = ''
while True:
    time.sleep(2)
    r = requests.get(f'{BASE}/api/status/{job_id}', timeout=10)
    d = r.json()
    step = d.get('step', 0)
    status = d.get('status', '')
    msg = d.get('message', '')
    elapsed = time.time() - start

    if msg != last_msg:
        print(f'    [{elapsed:5.1f}s] step={step} {status}: {msg}')
        last_msg = msg

    if status == 'done':
        print()
        print('=== DONE ===')
        text = d.get('final_text', '') or d.get('stt_azure', '')
        print(f'Text length: {len(text)} chars')
        print()
        print('--- First 800 chars ---')
        print(text[:800])
        if d.get('summary'):
            print()
            print('--- Summary (first 400 chars) ---')
            print(d['summary'][:400])
        break
    elif status == 'error':
        print(f'ERROR: {msg}')
        # แสดง keys ทั้งหมด
        print('Full response:', json.dumps({k:v for k,v in d.items() if k != 'final_text'}, ensure_ascii=False, indent=2))
        sys.exit(1)
    elif elapsed > 900:
        print('TIMEOUT after 15 minutes')
        sys.exit(1)
