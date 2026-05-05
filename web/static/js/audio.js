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
        return runAzureRestFallback(lang, int16);
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
        return runAzureRestFallback(lang, int16);
    }
}

async function runAzureRestFallback(lang, int16 = null) {
    // Use already-decoded PCM if available, otherwise decode from file
    let audioToSend;
    if (int16 instanceof Int16Array) {
        audioToSend = pcm16ToWavBlob(int16);
    } else if (state?.currentFile) {
        try {
            const decoded = await toPCM16k(state.currentFile);
            audioToSend = pcm16ToWavBlob(decoded);
        } catch (_) {
            audioToSend = state.currentFile; // last resort: send original
        }
    } else {
        throw new Error('ไม่พบไฟล์สำหรับส่งไป Azure');
    }
    const formData = new FormData();
    formData.append('audio', audioToSend, 'audio.wav');
    formData.append('language', lang || 'th-TH');
    const resp = await fetch(API_AZURE_STT, { method: 'POST', body: formData });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Azure REST HTTP ${resp.status}: ${errText.substring(0, 300)}`);
    }
    const data = await resp.json();
    return formatSpeakerTranscript(data);
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

function pcm16ToWavBlob(int16, sampleRate = 16000) {
    const bytesPerSample = 2;
    const dataSize = int16.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeString(offset, value) {
        for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < int16.length; i++, offset += 2) {
        view.setInt16(offset, int16[i], true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

async function transcribeWhisperBlob(audioBlob, langCode) {
    const formData = new FormData();
    formData.append('audio', audioBlob, audioBlob.name || 'audio.wav');
    formData.append('language', langCode);
    const localApiUrl = await getWhisperLocalApiUrl();
    let resp;
    try {
        resp = await fetch(API_WHISPER, { method: 'POST', body: formData });
    } catch (err) {
        if (localApiUrl) {
            return transcribeWhisperViaLocalProxy(audioBlob, langCode, localApiUrl);
        }
        throw err;
    }
    if (!resp.ok) {
        const err = await resp.text().catch(() => '');

        // Fallback to a tunneled local wisper backend when Azure Whisper is unavailable.
        if (localApiUrl && (resp.status === 404 && err.includes('DeploymentNotFound'))) {
            return transcribeWhisperViaLocalProxy(audioBlob, langCode, localApiUrl);
        }

        throw new Error(`Whisper HTTP ${resp.status}: ${err.substring(0, 200)}`);
    }
    const data = await resp.json();
    return (data.text || '').trim();
}

async function transcribeWhisperViaLocalProxy(audioBlob, langCode, localApiUrl = '') {
    const apiUrl = localApiUrl || await getWhisperLocalApiUrl();
    if (!apiUrl) {
        throw new Error('ยังไม่ได้กำหนด backend สำหรับ wisper local');
    }
    const localForm = new FormData();
    localForm.append('file', audioBlob, audioBlob.name || 'audio.wav');
    localForm.append('language', langCode);
    localForm.append('model', 'openai/whisper-large-v3');
    const localResp = await fetch(apiUrl, {
        method: 'POST',
        body: localForm,
    });
    if (!localResp.ok) {
        const localErr = await localResp.text().catch(() => '');
        throw new Error(`Whisper local HTTP ${localResp.status}: ${localErr.substring(0, 200)}`);
    }
    const localData = await localResp.json();
    return (localData.text || '').trim();
}

async function runWhisperChunkedFromPCM(int16, langCode, onProgress) {
    const sampleRate = 16000;
    const chunkSeconds = 10 * 60;
    const overlapSeconds = 2;
    const chunkSamples = chunkSeconds * sampleRate;
    const overlapSamples = overlapSeconds * sampleRate;
    const parts = [];

    for (let start = 0; start < int16.length; start += (chunkSamples - overlapSamples)) {
        const end = Math.min(int16.length, start + chunkSamples);
        const wavBlob = pcm16ToWavBlob(int16.slice(start, end), sampleRate);
        wavBlob.name = `whisper-part-${parts.length + 1}.wav`;
        const text = await transcribeWhisperBlob(wavBlob, langCode);
        if (text) parts.push(text);
        if (onProgress) onProgress(parts.join(' '), parts.length);
        if (end >= int16.length) break;
    }

    return parts.join(' ').trim();
}

async function runWhisperRest(file, lang, int16 = null, onProgress = null) {
    const langCode = (lang || 'th-TH').split('-')[0];

    if (file.size > 24 * 1024 * 1024) {
        if (!int16) {
            throw new Error(`ไฟล์มีขนาด ${(file.size / 1024 / 1024).toFixed(1)} MB เกินขีดจำกัดของ Whisper และยังไม่สามารถแบ่งช่วงอัตโนมัติได้`);
        }
        return runWhisperChunkedFromPCM(int16, langCode, onProgress);
    }

    return transcribeWhisperBlob(file, langCode);
}
async function runMAIRest(file, lang, int16 = null) {
    const normalizedLang = lang && lang.includes('-') ? lang : `${(lang || 'th').split('-')[0]}-TH`;
    const definition = JSON.stringify({
        locales:             [normalizedLang],
        profanityFilterMode: 'None',
        diarization:         { enabled: true, maxSpeakers: 8 },
    });
    // Use already-decoded PCM if available, otherwise decode now
    // This ensures MAI always receives WAV PCM (a universally accepted format)
    let audioToSend;
    if (int16 instanceof Int16Array) {
        audioToSend = pcm16ToWavBlob(int16);
    } else {
        try {
            const decoded = await toPCM16k(file);
            audioToSend = pcm16ToWavBlob(decoded);
        } catch (_) {
            audioToSend = file; // fallback to original if decode fails
        }
    }
    const formData = new FormData();
    formData.append('audio',      audioToSend, 'audio.wav');
    formData.append('definition', new Blob([definition], { type: 'application/json' }));
    const resp = await fetch(API_MAI, { method: 'POST', body: formData });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`MAI HTTP ${resp.status}: ${errText.substring(0,500)}`);
    }
    const data = await resp.json();
    return formatSpeakerTranscript(data);
}

function formatSpeakerTranscript(data) {
    const phrases = data.phrases || [];
    const blocks = [];
    let cur = null;
    for (const p of phrases) {
        if (!p.text) continue;
        const spk = Number.isInteger(p.speaker) ? Math.max(1, p.speaker) : 1;
        if (!cur || cur.spk !== spk) {
            cur = { spk, texts: [] };
            blocks.push(cur);
        }
        cur.texts.push(p.text);
    }
    if (blocks.length) {
        return blocks.map(b => `[ผู้พูด ${b.spk}]: ${b.texts.join(' ')}`).join('\n');
    }
    const combined = data.combinedPhrases || [];
    const text = combined.length
        ? combined.map(p => p.text || '').join(' ').trim()
        : phrases.map(p => p.text || '').join(' ').trim();
    return text ? `[ผู้พูด 1]: ${text}` : '';
}
