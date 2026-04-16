import os, sys, json, requests
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from dotenv import load_dotenv
load_dotenv()

key = os.getenv('MAI_SPEECH_KEY', '')
url = 'https://mai-speech.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15'
headers = {'Ocp-Apim-Subscription-Key': key}
definition = {
    'locales': ['th-TH'],
    'profanityFilterMode': 'None',
    'channels': [0, 1],
    'diarizationSettings': {'minSpeakerCount': 1, 'maxSpeakerCount': 4}
}
audio_file = Path(__file__).parent.parent / 'สโรชา.mp3'
with open(audio_file, 'rb') as f:
    resp = requests.post(url, headers=headers,
        files={
            'audio': ('test.mp3', f, 'audio/mpeg'),
            'definition': (None, json.dumps(definition), 'application/json')
        },
        timeout=60)

print('HTTP Status:', resp.status_code)
data = resp.json()
phrases = data.get('phrases', [])
print('phrases count:', len(phrases))
print('response keys:', list(data.keys()))

if phrases:
    speakers = set(p.get('speaker') for p in phrases)
    print('distinct speakers:', speakers)
    for p in phrases[:8]:
        spk = p.get('speaker', '?')
        txt = p.get('text', '')[:70]
        print(f'  [Speaker {spk}]: {txt}')
else:
    combined = data.get('combinedPhrases', [])
    print('combinedPhrases count:', len(combined))
    if combined:
        print('sample:', combined[0].get('text', '')[:100])
