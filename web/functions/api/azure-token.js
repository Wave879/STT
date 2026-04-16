/**
 * Azure Speech Token Endpoint
 * GET /api/azure-token → { token: string, region: string }
 *
 * Token is valid for 10 minutes. The browser fetches this token
 * then uses SpeechConfig.fromAuthorizationToken(token, region)
 * so the actual AZURE_KEY never reaches the browser.
 *
 * Required secrets (set via wrangler pages secret put):
 *   AZURE_KEY    — Azure Speech subscription key
 *   AZURE_REGION — e.g. southeastasia
 */
export async function onRequestGet({ env }) {
    const key    = env.AZURE_KEY;
    const region = env.AZURE_REGION || 'southeastasia';

    if (!key) {
        return Response.json({ error: 'AZURE_KEY not configured in environment' }, { status: 500 });
    }

    const tokenUrl = `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
    const resp = await fetch(tokenUrl, {
        method:  'POST',
        headers: { 'Ocp-Apim-Subscription-Key': key },
    });

    if (!resp.ok) {
        return Response.json({ error: `Azure token issue failed: ${resp.status}` }, { status: resp.status });
    }

    const token = await resp.text();
    return new Response(JSON.stringify({ token, region }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        },
    });
}
