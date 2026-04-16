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
    const key      = env.MAI_KEY;
    const endpoint = (env.MAI_ENDPOINT || 'https://mai-speech.cognitiveservices.azure.com/').replace(/\/$/, '');

    if (!key) {
        return Response.json({ error: 'MAI_KEY not configured in environment' }, { status: 500 });
    }

    const url      = `${endpoint}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`;
    const formData = await request.formData();

    const resp = await fetch(url, {
        method:  'POST',
        headers: { 'Ocp-Apim-Subscription-Key': key },
        body:    formData,
    });

    const text = await resp.text();
    return new Response(text, {
        status:  resp.status,
        headers: { 'Content-Type': 'application/json' },
    });
}
