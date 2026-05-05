/**
 * Whisper Transcription Proxy
 * POST /api/whisper  ← browser sends FormData { audio, language }
 *
 * Priority:
 *   1. Local wisper server  — EXTERNAL_WHISPER_ENDPOINT (e.g. https://xxx.trycloudflare.com)
 *      POST /transcribe  with FormData { file, language, model }
 *   2. Azure OpenAI Whisper — OAI_KEY + OAI_ENDPOINT + WHISPER_DEPLOY
 *      (fallback if EXTERNAL_WHISPER_ENDPOINT is not set)
 *
 * Required secrets:
 *   EXTERNAL_WHISPER_ENDPOINT — tunnel URL to local wisper server (set by start.bat)
 *   OAI_KEY                   — Azure OpenAI API key (fallback)
 *   OAI_ENDPOINT              — Azure OpenAI endpoint (fallback)
 *   WHISPER_DEPLOY            — deployment name (fallback, default: "whisper")
 */
export async function onRequestPost({ request, env }) {
    const incoming = await request.formData();
    const audio    = incoming.get('audio');
    const lang     = (incoming.get('language') || 'th').split('-')[0]; // 'th-TH' → 'th'

    if (!audio) {
        return Response.json({ error: 'audio field missing' }, { status: 400 });
    }

    // ── Priority 1: Local wisper server (D:\STTfinalsammary\wisper) ──────────
    const externalEndpoint = (env.EXTERNAL_WHISPER_ENDPOINT || '').replace(/\/+$/, '');
    if (externalEndpoint) {
        const url = `${externalEndpoint}/transcribe`;
        const outForm = new FormData();
        outForm.append('file',          audio, audio.name || 'audio.wav');
        outForm.append('language',      lang);
        outForm.append('model',         'openai/whisper-large-v3');
        outForm.append('chunk_seconds', '30');

        try {
            const resp = await fetch(url, { method: 'POST', body: outForm });
            const text = await resp.text();
            if (resp.ok) {
                // wisper returns { text, chunks, processing_time, device }
                // normalise to { text } so browser code works the same
                try {
                    const data = JSON.parse(text);
                    return Response.json({ text: data.text || '' });
                } catch {
                    return new Response(text, {
                        status: resp.status,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }
            }
            // wisper server returned an error — fall through to Azure
            console.warn(`Local wisper error ${resp.status}: ${text.substring(0, 200)}`);
        } catch (err) {
            // Network error (tunnel down) — fall through to Azure
            console.warn('Local wisper unreachable:', err.message);
        }
    }

    // ── Priority 2: Azure OpenAI Whisper (fallback) ───────────────────────────
    const key      = env.OAI_KEY;
    const endpoint = (env.OAI_ENDPOINT || '').replace(/\/+$/, '');
    const deploy   = env.WHISPER_DEPLOY || 'whisper';

    if (!key || !endpoint) {
        return Response.json({
            error: 'Whisper ไม่พร้อมใช้งาน: ไม่มี EXTERNAL_WHISPER_ENDPOINT และ OAI_KEY/OAI_ENDPOINT ยังไม่ได้ตั้งค่า',
        }, { status: 503 });
    }

    const url = `${endpoint}/openai/deployments/${deploy}/audio/transcriptions?api-version=2024-06-01`;
    const outForm = new FormData();
    outForm.append('file',            audio, audio.name || 'audio.wav');
    outForm.append('language',        lang);
    outForm.append('response_format', 'json');

    const resp = await fetch(url, {
        method:  'POST',
        headers: { 'api-key': key },
        body:    outForm,
    });

    const text = await resp.text();
    return new Response(text, {
        status:  resp.status,
        headers: { 'Content-Type': 'application/json' },
    });
}
