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

function pcm16ToWavBlob(int16, sampleRate = 16000) {
    const bytesPerSample = 2;
    const dataSize = int16.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeAscii = (offset, value) => {
        for (let index = 0; index < value.length; index++) {
            view.setUint8(offset + index, value.charCodeAt(index));
        }
    };

    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeAscii(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let index = 0; index < int16.length; index++, offset += bytesPerSample) {
        view.setInt16(offset, int16[index], true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

function toWavFileName(fileName) {
    return String(fileName || 'audio')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_') + '.wav';
}

// Keep proxy-facing requests well below common IIS/ARR body limits.
const PROXY_SAFE_UPLOAD_BYTES = 45 * 1024 * 1024;   // 45 MB — ต่ำกว่า multer limit 500 MB
const PROXY_CHUNK_SECONDS = 10 * 60;                 // 10 นาที ต่อ chunk
const UPLOAD_SESSION_CHUNK_BYTES = 8 * 1024 * 1024;  // 8 MB ต่อ session chunk (server limit 10MB)

function isProxyTooLargeError(detail, status = 0) {
    const message = String(detail || '').toLowerCase();
    return Number(status) === 413 ||
        message.includes('413') ||
        message.includes('payload too large') ||
        message.includes('request entity too large') ||
        message.includes('body too large') ||
        message.includes('maximum body size') ||
        message.includes('unexpected end of form') ||
        message.includes('maxallowedcontentlength') ||
        message.includes('uploadreadaheadsize') ||
        message.includes('client_max_body_size');
}

function buildPcmChunks(pcm16, chunkSeconds = PROXY_CHUNK_SECONDS) {
    const timeBasedSamples = Math.max(16000 * 5, Math.floor(chunkSeconds * 16000));
    const byteBudgetSamples = Math.max(
        16000 * 5,
        Math.floor((PROXY_SAFE_UPLOAD_BYTES - 64 * 1024) / 2),
    );
    const chunkSamples = Math.max(16000 * 5, Math.min(timeBasedSamples, byteBudgetSamples));
    const parts = [];
    for (let start = 0; start < pcm16.length; start += chunkSamples) {
        const end = Math.min(pcm16.length, start + chunkSamples);
        parts.push({
            index: parts.length,
            start,
            end,
            pcm: pcm16.subarray(start, end),
            baseMs: Math.round((start / 16000) * 1000),
        });
    }
    return parts;
}

function joinTranscriptParts(parts) {
    return parts
        .map(part => String(part || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n\n')
        .trim();
}

async function createUploadSession(file) {
    const resp = await fetch(API_UPLOAD_SESSIONS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fileName: file.name || 'audio',
            mimeType: file.type || 'application/octet-stream',
            totalSize: Number(file.size || 0),
        }),
    });
    if (!resp.ok) throw new Error(`สร้าง upload session ไม่สำเร็จ (${resp.status})`);
    return resp.json();
}

async function uploadSessionChunk(sessionId, chunkBlob, index) {
    const resp = await fetch(`${API_UPLOAD_SESSIONS}/${encodeURIComponent(sessionId)}/chunk?index=${index}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: chunkBlob,
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`อัปโหลด chunk ไม่สำเร็จ (${resp.status}): ${text.slice(0, 200)}`);
    }
}

async function completeUploadSession(sessionId) {
    const resp = await fetch(`${API_UPLOAD_SESSIONS}/${encodeURIComponent(sessionId)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`ปิด upload session ไม่สำเร็จ (${resp.status}): ${text.slice(0, 200)}`);
    }
    return resp.json();
}

async function prepareProxyUpload(file, onProgress = null) {
    try {
        const { sessionId } = await createUploadSession(file);
        const totalChunks = Math.max(1, Math.ceil(file.size / UPLOAD_SESSION_CHUNK_BYTES));
        for (let index = 0; index < totalChunks; index++) {
            const start = index * UPLOAD_SESSION_CHUNK_BYTES;
            const end = Math.min(file.size, start + UPLOAD_SESSION_CHUNK_BYTES);
            await uploadSessionChunk(sessionId, file.slice(start, end), index);
            if (onProgress) onProgress(index + 1, totalChunks);
        }
        const completed = await completeUploadSession(sessionId);
        return completed.uploadId;
    } catch (error) {
        console.warn('prepareProxyUpload failed, fallback to browser chunking', error);
        return '';
    }
}

function getMAIUploadPlan() {
    return { shouldBypass: false, message: '' };
}

/**
 * Wait for window.SpeechSDK to be ready (max 15 s).
 * The SDK bundle can take a few seconds to evaluate on slow connections.
 */
async function waitForSdk(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (!window.SpeechSDK) {
        if (Date.now() > deadline) return null;
        await new Promise(r => setTimeout(r, 250));
    }
    return window.SpeechSDK;
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

function toMMSS(valueMs) {
    const totalSec = Math.max(0, Math.floor((Number(valueMs) || 0) / 1000));
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function fmtConfidence(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return ` (มั่นใจ ${(n * 100).toFixed(0)}%)`;
}

function toAzureUploadBlob(source) {
    if (source instanceof Blob) {
        return {
            blob: source,
            filename: source.name || 'audio.wav',
        };
    }
    if (source instanceof Int16Array) {
        return {
            blob: pcm16ToWavBlob(source),
            filename: 'audio.wav',
        };
    }
    throw new Error('Unsupported Azure audio source');
}

function formatAzureRestPhrase(phrase, speakerMap) {
    const speakerKey = String(phrase.speaker ?? phrase.speakerId ?? phrase.speaker_id ?? '').trim();
    let speakerLabel = 'ไม่ระบุผู้พูด';
    if (speakerKey) {
        if (!speakerMap.has(speakerKey)) speakerMap.set(speakerKey, `ผู้พูด ${speakerMap.size + 1}`);
        speakerLabel = speakerMap.get(speakerKey);
    }

    const nbest = Array.isArray(phrase.nBest) && phrase.nBest.length ? phrase.nBest[0] : null;
    const text = String(
        phrase.display ||
        phrase.displayText ||
        phrase.text ||
        phrase.lexical ||
        (nbest && (nbest.display || nbest.displayText || nbest.lexical || nbest.itn)) ||
        ''
    ).trim();
    if (!text) return '';

    const offsetMs = Number(
        phrase.offsetMilliseconds ??
        phrase.offset_ms ??
        ((phrase.offsetInTicks ?? phrase.offset ?? 0) / 10000)
    ) || 0;
    const durationMs = Number(
        phrase.durationMilliseconds ??
        phrase.duration_ms ??
        ((phrase.durationInTicks ?? phrase.duration ?? 0) / 10000)
    ) || 0;
    const confidence = fmtConfidence(
        phrase.confidence ??
        (nbest && (nbest.confidence ?? nbest.Confidence))
    );

    return `**[${toMMSS(offsetMs)}-${toMMSS(offsetMs + durationMs)} - ${speakerLabel}]**${confidence} ${text}`;
}

function parseAzureRestTranscript(payload) {
    const phrases = []
        .concat(Array.isArray(payload?.recognizedPhrases) ? payload.recognizedPhrases : [])
        .concat(Array.isArray(payload?.combinedPhrases) ? payload.combinedPhrases : []);

    const speakerMap = new Map();
    const lines = phrases
        .map((phrase) => formatAzureRestPhrase(phrase, speakerMap))
        .filter(Boolean);

    if (lines.length) return lines.join('\n\n');

    const fallbackText = String(
        payload?.displayText ||
        payload?.text ||
        (Array.isArray(payload?.combinedPhrases) && payload.combinedPhrases[0] && (payload.combinedPhrases[0].text || payload.combinedPhrases[0].display)) ||
        ''
    ).trim();
    return fallbackText;
}

async function requestAzureRest(blob, filename, lang) {
    const formData = new FormData();
    formData.append('audio', blob, filename);
    formData.append('language', lang || 'th-TH');

    const resp = await fetch(API_AZURE_STT, {
        method: 'POST',
        body: formData,
    });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        let detail = errText.substring(0, 300);
        try {
            const json = JSON.parse(errText);
            detail = json.error || json.detail || detail;
        } catch (_) {}
        throw new Error(`Azure ${resp.status}: ${detail}`);
    }

    const payload = await resp.json().catch(() => ({}));
    const transcript = parseAzureRestTranscript(payload).trim();
    if (!transcript) throw new Error('Azure ไม่พบข้อความที่ใช้งานได้');
    return transcript;
}

async function requestAzureRestUpload(uploadId, lang) {
    const formData = new FormData();
    formData.append('uploadId', uploadId);
    formData.append('language', lang || 'th-TH');

    const resp = await fetch(API_AZURE_STT, {
        method: 'POST',
        body: formData,
    });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        let detail = errText.substring(0, 300);
        try {
            const json = JSON.parse(errText);
            detail = json.error || json.detail || detail;
        } catch (_) {}
        throw new Error(`Azure ${resp.status}: ${detail}`);
    }

    const payload = await resp.json().catch(() => ({}));
    const transcript = parseAzureRestTranscript(payload).trim();
    if (!transcript) throw new Error('Azure ไม่พบข้อความที่ใช้งานได้');
    return transcript;
}

async function runAzureRestChunked(pcm16, fileName, lang) {
    const parts = buildPcmChunks(pcm16);
    const transcripts = [];
    for (const part of parts) {
        const chunkBlob = pcm16ToWavBlob(part.pcm);
        const chunkText = await requestAzureRest(chunkBlob, `${toWavFileName(fileName).replace(/\.wav$/i, '')}_part${part.index + 1}.wav`, lang);
        if (chunkText) transcripts.push(chunkText);
    }
    const transcript = joinTranscriptParts(transcripts);
    if (!transcript) throw new Error('Azure ไม่พบข้อความที่ใช้งานได้');
    return ensureUsableThaiTranscript('Azure', transcript);
}

async function runAzureRest(source, lang, pcm16 = null, options = {}) {
    if (options.uploadId) {
        const transcript = await requestAzureRestUpload(options.uploadId, lang);
        return ensureUsableThaiTranscript('Azure', transcript);
    }
    const { blob, filename } = toAzureUploadBlob(source);
    const shouldChunkFirst = blob.size > PROXY_SAFE_UPLOAD_BYTES;

    if (!shouldChunkFirst) {
        try {
            const transcript = await requestAzureRest(blob, filename, lang);
            return ensureUsableThaiTranscript('Azure', transcript);
        } catch (error) {
            if (!pcm16 || !isProxyTooLargeError(error.message)) throw error;
        }
    }

    const safePcm = pcm16 || (source instanceof Int16Array ? source : null);
    if (!safePcm) throw new Error('Azure ต้องใช้ PCM สำหรับแบ่งไฟล์ย่อย');
    return runAzureRestChunked(safePcm, filename, lang);
}

function extractAzureDetail(result) {
    try {
        const payload = JSON.parse(result.json || '{}');
        const best = Array.isArray(payload.NBest) && payload.NBest.length ? payload.NBest[0] : null;
        const confidence = Number(best && best.Confidence);
        const words = Array.isArray(best && best.Words) ? best.Words : [];
        const lastWord = words.length ? words[words.length - 1] : null;
        const endMs = lastWord
            ? (Number(lastWord.Offset || 0) + Number(lastWord.Duration || 0)) / 10000
            : (Number(result.offset || 0) + Number(result.duration || 0)) / 10000;
        return {
            confidence: Number.isFinite(confidence) ? confidence : null,
            endMs: Number.isFinite(endMs) ? endMs : null,
            words,
        };
    } catch (_) {
        return { confidence: null, endMs: null, words: [] };
    }
}

/**
 * Azure Speech SDK — continuous recognition.
 * Uses server-issued token (no key in browser).
 * @param {Int16Array} int16
 * @param {string}     lang
 * @param {Function}   onProgress  (partialText, segmentCount) => void
 */
async function runAzureSDK(int16, lang, onProgress, options = {}) {
    const sdk = await waitForSdk();
    if (!sdk) throw new Error('Azure Speech SDK โหลดไม่สำเร็จ (ลองรีเฟรชหน้า)');    
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
    speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, options.detailed ? '1200' : '2000');
    if (sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs) {
        speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, options.detailed ? '700' : '1200');
    }
    if (typeof speechConfig.requestWordLevelTimestamps === 'function') {
        speechConfig.requestWordLevelTimestamps();
    }
    speechConfig.outputFormat = sdk.OutputFormat.Detailed;
    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

    if (options.detailed) {
        const transcriberApi = sdk.transcription && sdk.transcription.ConversationTranscriber;
        if (!transcriberApi) throw new Error('Azure SDK รุ่นนี้ยังไม่รองรับการแยกผู้พูด');

        const transcriber = new transcriberApi(speechConfig, audioConfig);
        const lines = [];
        const speakerMap = new Map();

        const resolveSpeaker = (value) => {
            const raw = String(value || '').trim();
            if (!raw) return 'ไม่ระบุผู้พูด';
            if (!speakerMap.has(raw)) speakerMap.set(raw, `ผู้พูด ${speakerMap.size + 1}`);
            return speakerMap.get(raw);
        };

        return new Promise((resolve, reject) => {
            transcriber.transcribed = (s, e) => {
                if (e.result.reason !== sdk.ResultReason.RecognizedSpeech || !e.result.text) return;
                const offsetMs = Number(e.result.offset || 0) / 10000;
                const detail = extractAzureDetail(e.result);
                const endMs = detail.endMs != null ? detail.endMs : offsetMs;
                const speaker = resolveSpeaker(e.result.speakerId || e.result.speaker_id);
                const confidence = fmtConfidence(detail.confidence);
                lines.push(`**[${toMMSS(offsetMs)}-${toMMSS(endMs)} - ${speaker}]**${confidence} ${String(e.result.text).trim()}`);
                if (onProgress) onProgress(lines.join('\n\n'), lines.length);
            };
            transcriber.canceled = (s, e) => {
                transcriber.stopTranscribingAsync();
                e.reason === sdk.CancellationReason.Error
                    ? reject(new Error(e.errorDetails))
                    : resolve(lines.join('\n\n').trim());
            };
            transcriber.sessionStopped = () => {
                transcriber.stopTranscribingAsync();
                resolve(lines.join('\n\n').trim());
            };
            transcriber.startTranscribingAsync(() => {}, err => reject(new Error(String(err))));
        });
    }

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

const WHISPER_PROXY_MAX_BYTES = 50 * 1024 * 1024;    // server multer limit

async function _whisperSingleBlob(blob, filename, langCode) {
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('language', langCode);
    formData.append('response_format', 'json');
    const resp = await fetch(API_WHISPER, { method: 'POST', body: formData });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        let detail = errText.substring(0, 300);
        try {
            const j = JSON.parse(errText);
            detail = j.error || j.message || detail;
        } catch (_) {}
        throw new Error(`Whisper ${resp.status}: ${detail}`);
    }
    const data = await resp.json().catch(() => ({}));
    return (data.text || data.transcription || '').trim();
}

async function _whisperSingleUpload(uploadId, langCode) {
    const formData = new FormData();
    formData.append('uploadId', uploadId);
    formData.append('language', langCode);
    formData.append('device', 'auto');
    const resp = await fetch(API_WHISPER, { method: 'POST', body: formData });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        let detail = errText.substring(0, 300);
        try {
            const j = JSON.parse(errText);
            detail = j.error || j.message || detail;
        } catch (_) {}
        throw new Error(`Whisper ${resp.status}: ${detail}`);
    }
    const data = await resp.json().catch(() => ({}));
    return (data.text || data.transcription || '').trim();
}

async function runWhisperRestChunked(pcm16, fileName, langCode) {
    const parts = buildPcmChunks(pcm16);
    const transcripts = [];
    for (const part of parts) {
        const chunkBlob = pcm16ToWavBlob(part.pcm);
        const chunkText = await _whisperSingleBlob(
            chunkBlob,
            `${toWavFileName(fileName).replace(/\.wav$/i, '')}_part${part.index + 1}.wav`,
            langCode,
        );
        if (chunkText) transcripts.push(cleanWhisperText(chunkText));
    }
    const transcript = cleanWhisperText(joinTranscriptParts(transcripts));
    if (!transcript) throw new Error('Whisper ไม่พบข้อความที่ใช้งานได้');
    return ensureUsableThaiTranscript('Whisper', transcript);
}

/**
 * Whisper via /api/whisper proxy.
 * ปล่อยให้ backend เป็นคนตัดสินใจเองว่าจะส่งต่อไป local/OpenAI แบบไหน
 * ฝั่ง browser จะส่งไฟล์ต้นฉบับอย่างเดียว เพื่อไม่ให้เกิด chunk-fallback ที่ทำให้ debug ยาก
 */
async function runWhisperRest(file, lang, pcm16, options = {}) {
    const langCode = (lang || 'th-TH').split('-')[0];
    if (options.uploadId) {
        const text = await _whisperSingleUpload(options.uploadId, langCode);
        return ensureUsableThaiTranscript('Whisper', cleanWhisperText(text));
    }
    if (file.size > WHISPER_PROXY_MAX_BYTES && !pcm16) {
        throw new Error(`Whisper รับไฟล์ได้สูงสุดประมาณ ${(WHISPER_PROXY_MAX_BYTES / 1024 / 1024).toFixed(0)} MB ต่อครั้ง`);
    }

    const shouldChunkFirst = file.size > PROXY_SAFE_UPLOAD_BYTES || file.size > WHISPER_PROXY_MAX_BYTES;
    if (!shouldChunkFirst) {
        try {
            const text = await _whisperSingleBlob(file, file.name, langCode);
            return ensureUsableThaiTranscript('Whisper', cleanWhisperText(text));
        } catch (error) {
            if (!pcm16 || !isProxyTooLargeError(error.message)) throw error;
        }
    }

    if (!pcm16) throw new Error('Whisper ต้องใช้ PCM สำหรับแบ่งไฟล์ย่อย');
    return runWhisperRestChunked(pcm16, file.name, langCode);
}

function cleanWhisperText(text) {
    return (text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function toThaiOnlyTranscript(parts) {
    return parts
        .map(part => String(part || '').replace(/\s+/g, ' ').trim())
        .map(part => part.replace(/[A-Za-z]+(?:['-][A-Za-z]+)*/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(part => /[\u0E00-\u0E7F]/.test(part))
        .join('\n\n')
        .trim();
}

function hasThaiText(value) {
    return /[\u0E00-\u0E7F]/.test(String(value || ''));
}

function countThaiChars(value) {
    const matches = String(value || '').match(/[\u0E00-\u0E7F]/g);
    return matches ? matches.length : 0;
}

function countMeaningfulChars(value) {
    const matches = String(value || '').match(/[\u0E00-\u0E7FA-Za-z0-9]/g);
    return matches ? matches.length : 0;
}

function normalizeThaiTranscript(text) {
    const cleanedLines = String(text || '')
        .replace(/\r\n/g, '\n')
        .split(/\n+/)
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    return toThaiOnlyTranscript(cleanedLines);
}

function ensureUsableThaiTranscript(engineName, text, minThaiChars = 20, minThaiRatio = 0.35) {
    const normalized = normalizeThaiTranscript(text);
    const thaiChars = countThaiChars(normalized);
    const meaningfulChars = countMeaningfulChars(normalized);
    const thaiRatio = meaningfulChars ? thaiChars / meaningfulChars : 0;
    if (!normalized || thaiChars < minThaiChars || thaiRatio < minThaiRatio) {
        throw new Error(`${engineName} คืนข้อความที่ไม่ใช่ภาษาไทยเพียงพอ`);
    }
    return normalized;
}

const MAI_PROXY_MAX_BYTES = 50 * 1024 * 1024;                              // server multer limit
const MAI_CHUNK_SAMPLES   = Math.floor(((PROXY_SAFE_UPLOAD_BYTES - 65536)) / 2); // ~2 min at 16kHz
const MAI_OVERLAP_SAMPLES = 16000 * 20;                              // 20 sec overlap

function _maiRawPhrases(data, baseMs) {
    return (data.phrases || [])
        .filter(p => (p.text || '').trim() && hasThaiText(p.text))
        .map(p => ({
            startMs:  (p.offsetMilliseconds != null ? p.offsetMilliseconds : p.offsetInTicks / 10000) + baseMs,
            durMs:    p.durationMilliseconds != null ? p.durationMilliseconds : p.durationInTicks / 10000,
            localSpk: p.speaker,
            text:     (p.text || '').trim(),
            conf:     p.confidence,
        }));
}

// Align local speaker IDs of new chunk to global IDs using overlap region with previous chunk
function _buildSpeakerMap(prevPhrases, prevL2G, newOverlap, allNew, nextId) {
    const l2g = {};
    for (const np of newOverlap) {
        if (np.localSpk == null || np.localSpk in l2g) continue;
        let best = null, bestDiff = 2500;
        for (const pp of prevPhrases) {
            const d = Math.abs(np.startMs - pp.startMs);
            if (d < bestDiff) { bestDiff = d; best = pp; }
        }
        if (best && prevL2G[best.localSpk] != null) l2g[np.localSpk] = prevL2G[best.localSpk];
    }
    // Assign new global IDs to unmatched local speakers
    for (const p of allNew) {
        if (p.localSpk != null && !(p.localSpk in l2g)) l2g[p.localSpk] = nextId++;
    }
    return { l2g, nextId };
}

function _fmtMaiPhrase(p, globalSpk) {
    const spk = globalSpk != null ? `ผู้พูด ${Number(globalSpk) + 1}` : 'ไม่ระบุผู้พูด';
    return `**[${toMMSS(p.startMs)}-${toMMSS(p.startMs + p.durMs)} - ${spk}]**${fmtConfidence(p.conf)} ${p.text}`;
}

async function _maiSendChunk(wavPcm, filename, lang) {
    const wavBlob    = pcm16ToWavBlob(wavPcm);
    const definition = JSON.stringify({
        locales:             [lang],
        profanityFilterMode: 'None',
        diarizationSettings: { minSpeakerCount: 1, maxSpeakerCount: 8 },
    });
    const formData = new FormData();
    formData.append('audio',      wavBlob, filename);
    formData.append('definition', new Blob([definition], { type: 'application/json' }));
    return fetch(API_MAI, { method: 'POST', body: formData });
}

async function _maiSendOriginalFile(file, lang) {
    const definition = JSON.stringify({
        locales:             [lang],
        profanityFilterMode: 'None',
        diarizationSettings: { minSpeakerCount: 1, maxSpeakerCount: 8 },
    });
    const formData = new FormData();
    formData.append('audio', file, file.name || 'audio');
    formData.append('definition', new Blob([definition], { type: 'application/json' }));
    return fetch(API_MAI, { method: 'POST', body: formData });
}

async function _maiSendOriginalUpload(uploadId, lang) {
    const definition = JSON.stringify({
        locales:             [lang],
        profanityFilterMode: 'None',
        diarizationSettings: { minSpeakerCount: 1, maxSpeakerCount: 8 },
    });
    const formData = new FormData();
    formData.append('uploadId', uploadId);
    formData.append('definition', definition);
    return fetch(API_MAI, { method: 'POST', body: formData });
}

function formatMaiRawTranscript(raw) {
    const l2g = {};
    let nid = 0;
    for (const p of raw) {
        if (p.localSpk != null && !(p.localSpk in l2g)) l2g[p.localSpk] = nid++;
    }
    return raw.map(p => _fmtMaiPhrase(p, l2g[p.localSpk])).join('\n\n');
}

async function runMaiChunkedPcm(wavPcm, filename, lang, readMaiError) {
    // Small file — single request, no chunking
    if (wavPcm.length <= MAI_CHUNK_SAMPLES) {
        const resp = await _maiSendChunk(wavPcm, filename, lang);
        if (!resp.ok) throw new Error(`MAI ${resp.status}: ${await readMaiError(resp)}`);
        const raw = _maiRawPhrases(await resp.json(), 0);
        if (raw.length) return formatMaiRawTranscript(raw);
        throw new Error('MAI ไม่พบข้อความภาษาไทยที่ใช้งานได้');
    }

    // Large file — chunk with overlap for speaker alignment
    const output = [];
    let prevPhrases = [];
    let prevL2G = {};
    let nextId = 0;
    let cutoffMs = 0;
    let failCount = 0;
    let lastError = '';

    for (let i = 0; i < wavPcm.length; i += MAI_CHUNK_SAMPLES) {
        const chunkStart = i === 0 ? 0 : Math.max(0, i - MAI_OVERLAP_SAMPLES);
        const chunkEnd = Math.min(wavPcm.length, i + MAI_CHUNK_SAMPLES);
        const baseMs = Math.round(chunkStart / 16000 * 1000);

        try {
            const resp = await _maiSendChunk(wavPcm.subarray(chunkStart, chunkEnd), filename, lang);
            if (!resp.ok) {
                failCount++;
                lastError = await readMaiError(resp);
                continue;
            }
            const raw = _maiRawPhrases(await resp.json(), baseMs);
            if (!raw.length) continue;

            let l2g;
            if (i === 0) {
                l2g = {};
                for (const p of raw) {
                    if (p.localSpk != null && !(p.localSpk in l2g)) l2g[p.localSpk] = nextId++;
                }
            } else {
                const overlapPhrases = raw.filter(p => p.startMs < cutoffMs + 1000);
                ({ l2g, nextId } = _buildSpeakerMap(prevPhrases, prevL2G, overlapPhrases, raw, nextId));
            }

            for (const p of raw.filter(p => p.startMs >= cutoffMs)) {
                output.push(_fmtMaiPhrase(p, l2g[p.localSpk]));
            }

            prevPhrases = raw.filter(p => p.startMs >= Math.round(Math.max(0, i - MAI_OVERLAP_SAMPLES / 2) / 16000 * 1000));
            prevL2G = l2g;
            cutoffMs = Math.round(chunkEnd / 16000 * 1000);
        } catch (error) {
            failCount++;
            lastError = error.message || String(error);
        }
    }

    if (output.length) return output.join('\n\n');
    throw new Error(lastError ? `MAI ถอดความไม่สำเร็จ (${failCount} chunks ล้มเหลว): ${lastError}` : `MAI ถอดความไม่สำเร็จทุก chunk (${failCount} chunks ล้มเหลว)`);
}

function shouldRetryMaiAsChunks(errorDetail, file) {
    const message = String(errorDetail || '').toLowerCase();
    return isProxyTooLargeError(message) || file.size > PROXY_SAFE_UPLOAD_BYTES;
}

async function runMAIRest(file, lang, pcm16, options = {}) {
    const readMaiError = async (resp) => {
        const text = await resp.text().catch(() => '');
        let detail = text.substring(0, 300);
        try {
            const json = JSON.parse(text);
            detail =
                json.error?.message ||
                json.error ||
                json.detail ||
                json.title ||
                detail;
        } catch (_) {}
        return detail || `HTTP ${resp.status}`;
    };

    if (file.size > MAI_PROXY_MAX_BYTES && !pcm16) {
        throw new Error(`MAI รับไฟล์ได้สูงสุดประมาณ ${(MAI_PROXY_MAX_BYTES / 1024 / 1024).toFixed(0)} MB ต่อครั้ง`);
    }

    if (options.uploadId) {
        const originalResp = await _maiSendOriginalUpload(options.uploadId, lang);
        if (!originalResp.ok) {
            throw new Error(`MAI ${originalResp.status}: ${await readMaiError(originalResp)}`);
        }
        const raw = _maiRawPhrases(await originalResp.json(), 0);
        if (raw.length) return formatMaiRawTranscript(raw);
        throw new Error('MAI ไม่พบข้อความภาษาไทยที่ใช้งานได้');
    }

    const shouldChunkFirst = file.size > PROXY_SAFE_UPLOAD_BYTES || file.size > MAI_PROXY_MAX_BYTES;
    if (shouldChunkFirst) {
        const wavPcm   = pcm16 || await toPCM16k(file);
        const filename = toWavFileName(file.name);
        return runMaiChunkedPcm(wavPcm, filename, lang, readMaiError);
    }

    // ส่งไฟล์ต้นฉบับก่อน เพื่อลดโอกาส inflate เป็น WAV แล้วชน limit/timeout
    const originalResp = await _maiSendOriginalFile(file, lang);
    if (originalResp.ok) {
        const raw = _maiRawPhrases(await originalResp.json(), 0);
        if (raw.length) return formatMaiRawTranscript(raw);
        throw new Error('MAI ไม่พบข้อความภาษาไทยที่ใช้งานได้');
    }

    const originalError = await readMaiError(originalResp);
    if (!shouldRetryMaiAsChunks(originalError, file)) {
        throw new Error(`MAI ${originalResp.status}: ${originalError}`);
    }

    const wavPcm   = pcm16 || await toPCM16k(file);
    const filename = toWavFileName(file.name);
    return runMaiChunkedPcm(wavPcm, filename, lang, readMaiError);
}
