/* ============================================================
   audio.js — Audio Processing Layer
   Functions: toPCM16k, runAzureSDK, runMAIRest
   Depends on: config.js (API_AZURE_TOKEN, API_MAI, STT_LANG)

   API keys are server-side. This file calls proxy endpoints only.
   ============================================================ */

/**
 * Decode any audio file → PCM Int16Array at 16 kHz mono.
 */
async function toPCM16k(file) {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx    = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();
    const TARGET_SR = 16000;
    const offCtx    = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * TARGET_SR), TARGET_SR);
    const src = offCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(offCtx.destination);
    src.start(0);
    const rendered = await offCtx.startRendering();
    const pcmFloat  = rendered.getChannelData(0);
    const int16     = new Int16Array(pcmFloat.length);
    const clamp     = 32767;
    for (let i = 0, len = pcmFloat.length; i < len; i++) {
        const s  = pcmFloat[i];
        int16[i] = s >= 1 ? clamp : s <= -1 ? -32768 : (s * clamp) | 0;
    }
    return int16;
}

/**
 * Wait for window.SpeechSDK to be ready (max 15 s).
 * The SDK bundle can take a few seconds to evaluate on slow connections.
 */
async function waitForSdk(timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (!(window.SpeechSDK || window.Microsoft?.CognitiveServices?.SpeechSDK)) {
        if (Date.now() > deadline) return null;
        await new Promise(r => setTimeout(r, 250));
    }
    return window.SpeechSDK || window.Microsoft?.CognitiveServices?.SpeechSDK || null;
}

/**
 * Fetch a short-lived Azure Speech token from server proxy.
 * Token valid 10 min. Key never reaches the browser.
 */
async function fetchAzureToken() {
    const resp = await fetch(API_AZURE_TOKEN);
    if (!resp.ok) throw new Error(`Azure token fetch failed: ${resp.status}`);
    return resp.json();
}

/**
 * Azure Speech SDK — continuous recognition.
 * Uses server-issued token (no key in browser).
 * @param {Int16Array} int16
 * @param {string}     lang
 * @param {Function}   onProgress  (partialText, segmentCount) => void
 */
async function runAzureSDK(int16, lang, onProgress) {
    const sdk = await waitForSdk();
    if (!sdk) {
        return runAzureRestFallback(lang);
    }

    try {
        const { token, region } = await fetchAzureToken();
        const pushStream = sdk.AudioInputStream.createPushStream(
            sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)
        );
        pushStream.write(int16.buffer);
        pushStream.close();
        const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token, region);
        speechConfig.speechRecognitionLanguage = lang;
        speechConfig.setProfanity(sdk.ProfanityOption.Raw);
        speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '10000');
        speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '2000');
        const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
        const recognizer  = new sdk.SpeechRecognizer(speechConfig, audioConfig);
        let fullText = '', count = 0;
        return await new Promise((resolve, reject) => {
            recognizer.recognized = (s, e) => {
                if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
                    fullText += e.result.text + ' ';
                    count++;
                    if (onProgress) onProgress(fullText.trim(), count);
                }
            };
            recognizer.canceled = (s, e) => {
                recognizer.stopContinuousRecognitionAsync();
                e.reason === sdk.CancellationReason.Error
                    ? reject(new Error(e.errorDetails))
                    : resolve(fullText.trim());
            };
            recognizer.sessionStopped = () => {
                recognizer.stopContinuousRecognitionAsync();
                resolve(fullText.trim());
            };
            recognizer.startContinuousRecognitionAsync(() => {}, err => reject(new Error(String(err))));
        });
    } catch (err) {
        console.warn('Azure SDK failed, falling back to REST:', err);
        return runAzureRestFallback(lang);
    }
}

async function runAzureRestFallback(lang) {
    if (!state?.currentFile) {
        throw new Error('ไม่พบไฟล์สำหรับส่งไป Azure');
    }
    const formData = new FormData();
    formData.append('audio', state.currentFile, state.currentFile.name);
    formData.append('language', lang || 'th-TH');
    const resp = await fetch(API_AZURE_STT, { method: 'POST', body: formData });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Azure REST HTTP ${resp.status}: ${errText.substring(0, 300)}`);
    }
    const data = await resp.json();
    const phrases = data.phrases || [];
    if (phrases.length) {
        return phrases.map(p => p.text || '').join(' ').trim();
    }
    const combined = data.combinedPhrases || [];
    return combined.map(p => p.text || '').join(' ').trim();
}

/**
 * Azure OpenAI Whisper — calls /api/whisper proxy (key server-side).
 * Sends original compressed file directly (mp3/wav/m4a).
 * Returns plain text transcript.
 */
async function runWhisperRest(file, lang) {
    // Whisper limit: 25 MB per file
    if (file.size > 24 * 1024 * 1024) {
        throw new Error(`ไฟล์ใหญ่เกิน 24 MB (${(file.size/1024/1024).toFixed(1)} MB) Whisper รองรับได้สูงสุด 25 MB`);
    }
    const langCode = (lang || 'th-TH').split('-')[0]; // 'th-TH' → 'th'
    const formData = new FormData();
    formData.append('audio',    file, file.name);
    formData.append('language', langCode);
    const resp = await fetch(API_WHISPER, { method: 'POST', body: formData });
    if (!resp.ok) {
        const err = await resp.text().catch(() => '');
        throw new Error(`Whisper HTTP ${resp.status}: ${err.substring(0, 200)}`);
    }
    const data = await resp.json();
    return (data.text || '').trim();
}
async function runMAIRest(file, lang) {
    const normalizedLang = lang && lang.includes('-') ? lang : `${(lang || 'th').split('-')[0]}-TH`;
    const definition = JSON.stringify({
        locales:             [normalizedLang],
        profanityFilterMode: 'None',
        channels:            [0, 1],
        diarizationSettings: { minSpeakerCount: 1, maxSpeakerCount: 8 },
    });
    const formData = new FormData();
    formData.append('audio',      file, file.name);
    formData.append('definition', new Blob([definition], { type: 'application/json' }));
    const resp = await fetch(API_MAI, { method: 'POST', body: formData });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`MAI HTTP ${resp.status}: ${errText.substring(0,500)}`);
    }
    const data    = await resp.json();
    const phrases = data.phrases || [];

    // ตรวจว่ามี speaker diarization
    const hasDiarization = phrases.length > 1 && phrases.some(p => p.speaker != null);
    if (hasDiarization) {
        const blocks = [];
        let cur = null;
        for (const p of phrases) {
            if (!p.text) continue;
            const spk = (p.speaker ?? 0) + 1;
            if (!cur || cur.spk !== spk) { cur = { spk, texts: [] }; blocks.push(cur); }
            cur.texts.push(p.text);
        }
        return blocks.map(b => `[ผู้พูด ${b.spk}] ${b.texts.join(' ')}`).join('\n');
    }
    // ไม่มี diarization — ใช้ combinedPhrases หรือ phrases
    const combined = data.combinedPhrases || [];
    if (combined.length) return combined.map(p => p.text || '').join(' ').trim();
    return phrases.map(p => p.text || '').join(' ').trim();
}
