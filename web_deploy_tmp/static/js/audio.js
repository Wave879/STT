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
    const sdk = window.SpeechSDK;
    if (!sdk) throw new Error('Azure Speech SDK ไม่โหลด');
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
    return new Promise((resolve, reject) => {
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
}

/**
 * MAI Speech — calls /api/mai proxy (key server-side).
 * Returns "[ผู้พูด X] ..." when diarization succeeds.
 */
async function runMAIRest(file, lang) {
    const definition = JSON.stringify({
        locales:                   [lang],
        profanityFilterMode:       'None',
        diarizationSettings:       { minSpeakers: 1, maxSpeakers: 8 },
        wordLevelTimestampsEnabled: true,
    });
    const formData = new FormData();
    formData.append('audio',      file, file.name);
    formData.append('definition', new Blob([definition], { type: 'application/json' }));
    const resp = await fetch(API_MAI, { method: 'POST', body: formData });
    if (!resp.ok) throw new Error(`MAI HTTP ${resp.status}`);
    const data    = await resp.json();
    const phrases = data.phrases || [];
    const hasDiarization = phrases.length > 0 &&
        phrases[0].speaker !== undefined &&
        phrases.some((p, i) => i > 0 && p.speaker !== phrases[0].speaker);
    if (hasDiarization) {
        const blocks = [];
        let cur = null;
        for (const p of phrases) {
            const spk = (p.speaker ?? 0) + 1;
            if (!cur || cur.spk !== spk) { cur = { spk, texts: [] }; blocks.push(cur); }
            cur.texts.push(p.text || '');
        }
        return blocks.map(b => `[ผู้พูด ${b.spk}] ${b.texts.join(' ')}`).join('\n');
    }
    const combined = data.combinedPhrases || [];
    if (combined.length) return combined.map(p => p.text || '').join(' ').trim();
    return phrases.map(p => p.text || '').join(' ').trim();
}