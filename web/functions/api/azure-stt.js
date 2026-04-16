/**
 * Azure Speech REST transcription proxy
 * POST /api/azure-stt ← browser sends FormData { audio, language? }
 *
 * Uses Azure Fast Transcription REST API so the app still works
 * when the browser Speech SDK fails to load.
 *
 * Required secrets:
 *   AZURE_KEY    — Azure Speech subscription key
 *   AZURE_REGION — e.g. southeastasia
 */
export async function onRequestPost({ request, env }) {
    const key = env.AZURE_KEY;
    const region = env.AZURE_REGION || 'southeastasia';

    if (!key) {
        return Response.json({ error: 'AZURE_KEY not configured in environment' }, { status: 500 });
    }

    let form;
    try {
        form = await request.formData();
    } catch (e) {
        return Response.json({ error: 'FormData parse error: ' + e.message }, { status: 400 });
    }

    const audioBlob = form.get('audio');
    if (!audioBlob) {
        return Response.json({ error: 'Missing audio field' }, { status: 400 });
    }

    const rawLang = typeof form.get('language') === 'string' ? form.get('language') : 'th-TH';
    const language = rawLang && rawLang.includes('-') ? rawLang : `${rawLang || 'th'}-TH`;
    const audioArr = new Uint8Array(await audioBlob.arrayBuffer());
    const audioName = (audioBlob.name || 'audio.wav').replace(/"/g, '');
    const audioMime = audioBlob.type || 'audio/wav';

    const boundary = 'cfaz' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const enc = new TextEncoder();
    const CRLF = '\r\n';
    const definition = JSON.stringify({
        locales: [language],
        profanityFilterMode: 'None',
        channels: [0, 1],
        diarizationSettings: { minSpeakerCount: 1, maxSpeakerCount: 8 },
    });

    const audioPre = enc.encode(
        '--' + boundary + CRLF +
        'Content-Disposition: form-data; name="audio"; filename="' + audioName + '"' + CRLF +
        'Content-Type: ' + audioMime + CRLF +
        CRLF
    );
    const defPart = enc.encode(
        CRLF + '--' + boundary + CRLF +
        'Content-Disposition: form-data; name="definition"' + CRLF +
        'Content-Type: application/json' + CRLF +
        CRLF +
        definition + CRLF +
        '--' + boundary + '--' + CRLF
    );

    const body = new Uint8Array(audioPre.byteLength + audioArr.byteLength + defPart.byteLength);
    body.set(audioPre, 0);
    body.set(audioArr, audioPre.byteLength);
    body.set(defPart, audioPre.byteLength + audioArr.byteLength);

    const url = `https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'multipart/form-data; boundary=' + boundary,
        },
        body,
    });

    const text = await resp.text();
    return new Response(text, {
        status: resp.status,
        headers: { 'Content-Type': 'application/json' },
    });
}
