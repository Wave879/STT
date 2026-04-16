/**
 * Azure OpenAI Proxy
 * POST /api/oai
 * Body: { deploy?: string, messages: [...], max_tokens: int, temperature: float }
 *
 * The worker adds api-key and forwards to Azure OpenAI.
 * The deploy field selects the deployment name (removed before forwarding).
 *
 * Required secrets:
 *   OAI_KEY      — Azure OpenAI API key
 *   OAI_ENDPOINT — e.g. https://titiphon-resource.cognitiveservices.azure.com/
 *   OAI_DEPLOY   — default deployment name, e.g. gpt-4o-mini-2
 */
export async function onRequestPost({ request, env }) {
    const key      = env.OAI_KEY;
    const endpoint = (env.OAI_ENDPOINT || '').replace(/\/$/, '');
    const defaultDeploy = env.OAI_DEPLOY || 'gpt-4o-mini-2';

    if (!key || !endpoint) {
        return Response.json({ error: 'OAI_KEY / OAI_ENDPOINT not configured in environment' }, { status: 500 });
    }

    const payload = await request.json();

    // Extract proxy-only "deploy" field, don't forward it to OpenAI
    const { deploy: deployOverride, ...oaiBody } = payload;
    const deployment = deployOverride || defaultDeploy;

    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-01`;
    const resp = await fetch(url, {
        method:  'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key':      key,
        },
        body: JSON.stringify(oaiBody),
    });

    const text = await resp.text();
    return new Response(text, {
        status:  resp.status,
        headers: { 'Content-Type': 'application/json' },
    });
}
