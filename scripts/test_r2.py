"""Quick test: R2 upload → public URL accessible → delete."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).parent.parent / '.env')

import scripts.stt_apis as m
import os, requests

e = m.ExternalWhisperClient(None, {
    'server_ip': '192.168.10.19', 'port': '8100',
    'language': 'th', 'include_speaker_labels': False
})

files = [f for f in pathlib.Path('web/uploads').glob('*.mp3') if f.stat().st_size > 100000]
if not files:
    print('No audio files in web/uploads'); sys.exit(1)

p = files[0]
print(f'File: {p.name}  ({p.stat().st_size//1024} KB)')

print('Uploading to R2...')
key = e._r2_upload(p)
print(f'Key: {key}')
if not key:
    print('FAIL: upload returned empty key'); sys.exit(1)

pub = os.getenv('R2_PUBLIC_URL', '').rstrip('/')
url = f'{pub}/{key}'
print(f'Public URL: {url}')

print('Checking public URL reachable...')
r = requests.head(url, timeout=10)
print(f'HEAD status: {r.status_code}')

print('Deleting from R2...')
e._r2_delete(key)
print('Done.')
