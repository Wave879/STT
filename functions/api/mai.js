/**
 * MAI Speech Proxy
 * POST /api/mai  ← browser sends FormData { audio, definition }
 *               ← worker adds API key and forwards to MAI
 *
 * Required secrets:
 *   MAI_KEY      — MAI Speech subscription key
 *   MAI_ENDPOINT — e.g. https://mai-speech.cognitiveservices.azure.com/
 */
export async function onRequestPost({ request, env }) {
    const key = env.MAI_KEY || env.MAI_SPEECH_KEY;
    const endpoint = (env.MAI_ENDPOINT || env.MAI_SPEECH_ENDPOINT || 'https://mai-speech.cognitiveservices.azure.com/').replace(/\/$/, '');

    if (!key) {
        return Response.json({ error: 'MAI_KEY/MAI_SPEECH_KEY not configured in environment' }, { status: 500 });
    }

    let form;
    try {
        form = await request.formData();
    } catch (e) {
        return Response.json({ error: 'FormData parse error: ' + e.message }, { status: 400 });
    }

    const audioBlob = form.get('audio');
    const defRaw = form.get('definition');
    if (!audioBlob || !defRaw) {
        return Response.json({ error: 'Missing audio or definition field' }, { status: 400 });
    }

    const defTextRaw = typeof defRaw === 'string' ? defRaw : await defRaw.text();
    let definition;
    try {
        definition = JSON.parse(defTextRaw);
    } catch (e) {
        return Response.json({ error: 'Invalid definition JSON: ' + e.message }, { status: 400 });
    }
    const locales = Array.isArray(definition.locales) ? definition.locales.filter(Boolean) : [];
    const primaryLocale = locales[0] || 'th-TH';
    definition.locales = [primaryLocale.includes('-') ? primaryLocale : `${primaryLocale}-TH`];

    const audioArr = new Uint8Array(await audioBlob.arrayBuffer());
    const audioName = (audioBlob.name || 'audio.wav').replace(/"/g, '');
    const audioMime = audioBlob.type || 'audio/wav';
    const defText = JSON.stringify(definition);

    const boundary = 'cfwb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const enc = new TextEncoder();
    const CRLF = '\r\n';
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
        defText + CRLF +
        '--' + boundary + '--' + CRLF
    );
    const body = new Uint8Array(audioPre.byteLength + audioArr.byteLength + defPart.byteLength);
    body.set(audioPre, 0);
    body.set(audioArr, audioPre.byteLength);
    body.set(defPart, audioPre.byteLength + audioArr.byteLength);

    const url = `${endpoint}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`;

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
        status:  resp.status,
        headers: { 'Content-Type': 'application/json' },
    });
}
