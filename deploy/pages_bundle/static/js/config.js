/* ============================================================
   config.js — App Constants
   ⚠️  API keys are stored server-side (Cloudflare Pages secrets).
       Do NOT put keys here — they are visible to all users.

   Set secrets once via:
     npx wrangler pages secret put AZURE_KEY      --project-name summary-to-team
     npx wrangler pages secret put AZURE_REGION   --project-name summary-to-team
     npx wrangler pages secret put MAI_KEY        --project-name summary-to-team
     npx wrangler pages secret put MAI_ENDPOINT   --project-name summary-to-team
     npx wrangler pages secret put OAI_KEY        --project-name summary-to-team
     npx wrangler pages secret put OAI_ENDPOINT   --project-name summary-to-team
     npx wrangler pages secret put OAI_DEPLOY     --project-name summary-to-team
   ============================================================ */

// ── Cloudflare Pages Function proxy paths ─────────────────────
// API keys live in the server (worker). Browser calls these paths.
const API_AZURE_TOKEN = '/api/azure-token'; // GET  → { token, region }
const API_AZURE_STT   = '/api/azure-stt';   // POST FormData
const API_MAI         = '/api/mai';          // POST FormData
const API_OAI         = '/api/oai';          // POST JSON
const API_WHISPER     = '/api/whisper';      // POST FormData
// ── Azure region (needed by the SDK for endpoint resolution) ──
// No actual key here — token is fetched from /api/azure-token
const AZURE_REGION = 'southeastasia';

// ── Deployment name forwarded to /api/oai ─────────────────────
const OAI_DEPLOY = 'gpt-4o-mini-2';

// ── Global STT language ───────────────────────────────────────
const STT_LANG = 'th-TH';
