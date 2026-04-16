#!/usr/bin/env python3
"""
Test STT Web UI Integration
"""
import requests
import json
import time
from pathlib import Path

BASE_URL = "http://localhost:8000"

def test_upload():
    """Test file upload"""
    print("\n=== Testing File Upload ===")
    
    # Find an audio file
    audio_file = None
    for pattern in ['**/*.mp3', '**/*.wav', '**/*.m4a']:
        found = list(Path('.').glob(pattern))
        if found:
            audio_file = found[0]
            break
    
    if not audio_file:
        print("❌ No audio file found for testing")
        return None
    
    print(f"📁 Audio file: {audio_file}")
    
    with open(audio_file, 'rb') as f:
        files = {'file': (audio_file.name, f)}
        resp = requests.post(f"{BASE_URL}/api/upload", files=files)
    
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        job_id = data.get('job_id')
        print(f"✅ Upload successful: {job_id}")
        print(f"   Filename: {data.get('filename')}")
        return job_id
    else:
        print(f"❌ Upload failed: {resp.text}")
        return None

def test_audio_serve(job_id):
    """Test audio serving endpoint"""
    print(f"\n=== Testing Audio Serve (/api/audio/{job_id}) ===")
    
    resp = requests.get(f"{BASE_URL}/api/audio/{job_id}")
    print(f"Status: {resp.status_code}")
    print(f"Content-Type: {resp.headers.get('Content-Type', 'unknown')}")
    print(f"Content-Length: {len(resp.content)} bytes")
    
    if resp.status_code == 200 and len(resp.content) > 0:
        print(f"✅ Audio serve working")
    else:
        print(f"❌ Audio serve failed")

def test_status(job_id):
    """Test status endpoint"""
    print(f"\n=== Testing Status (/api/status/{job_id}) ===")
    
    resp = requests.get(f"{BASE_URL}/api/status/{job_id}")
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Status endpoint working")
        print(f"   Job Status: {data.get('status')}")
        print(f"   Message: {data.get('message')}")
        print(f"   Step: {data.get('step')}")
    else:
        print(f"❌ Status endpoint failed: {resp.text}")

def test_process(job_id):
    """Test process endpoint"""
    print(f"\n=== Testing Process (/api/process) ===")
    
    resp = requests.post(
        f"{BASE_URL}/api/process",
        json={'job_id': job_id},
        headers={'Content-Type': 'application/json'}
    )
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Process started")
        print(f"   Job ID: {data.get('job_id')}")
        print(f"   Process Status: {data.get('status')}")
    else:
        print(f"❌ Process failed: {resp.text}")

def poll_status(job_id, max_polls=30):
    """Poll status until complete"""
    print(f"\n=== Polling Status (max {max_polls} polls) ===")
    
    for i in range(max_polls):
        resp = requests.get(f"{BASE_URL}/api/status/{job_id}")
        if resp.status_code != 200:
            print(f"❌ Poll {i+1}: Status endpoint failed")
            break
        
        data = resp.json()
        status = data.get('status')
        step = data.get('step', 0)
        msg = data.get('message', '')
        
        print(f"Poll {i+1}: Step {step}, Status: {status}, Message: {msg}")
        
        if status in ('done', 'error'):
            print(f"✅ Processing finished: {status}")
            if data.get('stt_azure'):
                print(f"\n📝 Azure result (first 100 chars):")
                print(f"   {data.get('stt_azure', '')[:100]}")
            break
        
        time.sleep(2)

def main():
    print("🧪 STT Web UI Integration Test")
    print(f"Base URL: {BASE_URL}")
    
    try:
        # Test upload
        job_id = test_upload()
        if not job_id:
            return
        
        # Test audio serve
        test_audio_serve(job_id)
        
        # Test status
        test_status(job_id)
        
        # Test process
        test_process(job_id)
        
        # Poll status
        poll_status(job_id)
        
        print("\n✅ All tests completed!")
    
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
