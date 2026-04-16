/**
 * Azure OpenAI Whisper Transcription Proxy
 * POST /api/whisper  ← browser sends FormData { audio }
 *                   ← worker adds API key and forwards to Azure OpenAI Whisper
 *
 * Required secrets (set via wrangler pages secret put):
 *   OAI_KEY         — Azure OpenAI API key
 *   OAI_ENDPOINT    — e.g. https://titiphon-resource.cognitiveservices.azure.com/
 *   WHISPER_DEPLOY  — Whisper deployment name, e.g. "whisper" (default: "whisper")
 */
export async function onRequestPost({ request, env }) {
    const key      = env.OAI_KEY;
    const endpoint = (env.OAI_ENDPOINT || '').replace(/\/$/, '');
    const deploy   = env.WHISPER_DEPLOY || 'whisper';

    if (!key || !endpoint) {
        return Response.json({ error: 'OAI_KEY / OAI_ENDPOINT not configured' }, { status: 500 });
    }

    const url = `${endpoint}/openai/deployments/${deploy}/audio/transcriptions?api-version=2024-06-01`;

    const incoming = await request.formData();
    const audio    = incoming.get('audio');
    const lang     = incoming.get('language') || 'th';

    if (!audio) {
        return Response.json({ error: 'audio field missing' }, { status: 400 });
    }

    const outForm = new FormData();
    outForm.append('file',     audio, audio.name || 'audio.wav');
    outForm.append('language', lang);
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
