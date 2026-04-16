import os, json, requests
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent.parent / '.env')

mai_key = os.getenv('MAI_SPEECH_KEY', '')
az_key  = os.getenv('AZURE_SPEECH_KEY', '')
audio   = str(Path(__file__).parent.parent / 'สโรชา.mp3')

def call_api(name, url, key):
    defn = {'locales': ['th-TH'], 'profanityFilterMode': 'None', 'channels': [0, 1]}
    with open(audio, 'rb') as f:
        r = requests.post(url, headers={'Ocp-Apim-Subscription-Key': key},
            files={'audio': ('t.mp3', f, 'audio/mpeg'),
                   'definition': (None, json.dumps(defn), 'application/json')},
            timeout=60)
    data = r.json()
    phrases = data.get('phrases', [])
    print(f'\n=== {name} ===')
    print(f'phrases: {len(phrases)}')
    if phrases:
        p0 = phrases[0]
        print(f'phrase keys: {list(p0.keys())}')
        confs = [p.get('confidence', 0) for p in phrases if p.get('confidence')]
        if confs:
            print(f'avg confidence: {sum(confs)/len(confs):.4f}  max: {max(confs):.4f}  min: {min(confs):.4f}')
        words = p0.get('words', [])
        print(f'words in first phrase: {len(words)}')
        if words:
            sample = [(w['text'], round(w.get('confidence', 0), 3)) for w in words[:5]]
            print(f'word confidence sample: {sample}')
    return phrases

mai_phrases = call_api('MAI (api-version 2025-10-15)',
    'https://mai-speech.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15',
    mai_key)

az_phrases = call_api('Azure STT (api-version 2024-11-15)',
    'https://southeastasia.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15',
    az_key)

print('\n=== COMPARISON ===')
if mai_phrases and az_phrases:
    mai_c = [p.get('confidence', 0) for p in mai_phrases if p.get('confidence')]
    az_c  = [p.get('confidence', 0) for p in az_phrases  if p.get('confidence')]
    if mai_c and az_c:
        print(f'MAI avg conf  : {sum(mai_c)/len(mai_c):.4f}')
        print(f'Azure avg conf: {sum(az_c)/len(az_c):.4f}')
    # Compare text of first phrase
    print(f'\nMAI  text[:100]: {mai_phrases[0].get("text","")[:100]}')
    print(f'Azure text[:100]: {az_phrases[0].get("text","")[:100]}')
    same = mai_phrases[0].get('text','').strip() == az_phrases[0].get('text','').strip()
    print(f'\nFirst phrase identical: {same}')
