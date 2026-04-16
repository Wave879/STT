# Cloudflare Deployment Guide - "summary to team"

## Option 1: Frontend on Cloudflare Pages + Backend Local (Recommended)

### Prerequisites
- Cloudflare account + domain
- Git repository
- GitHub/GitLab account

### Step 1: Prepare Frontend for CF Pages

```bash
# Extract just the frontend files
mkdir -p dist
cp web/index.html dist/
cp web/static/* dist/ 2>/dev/null || true
```

### Step 2: Create `.wrangler.toml` in project root

```toml
name = "summary-to-team"
main = "web/index.html"
type = "javascript"

[env.production]
name = "summary-to-team-prod"
route = "https://summary-to-team.pages.dev/*"
```

### Step 3: Configure API Proxy

In `dist/index.html` or create `_redirects` (Netlify) / `wrangler.toml` (CF Pages):

```
/api/* https://YOUR-BACKEND-URL/api/:splat 200
```

Or modify JavaScript to point to your backend:

```javascript
// In index.html, replace fetch calls:
const BACKEND_URL = 'https://your-backend-url.com'; // Set this env var

fetch(`${BACKEND_URL}/api/upload`, {...})
```

### Step 4: Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/summary-to-team.git
git push -u origin main
```

### Step 5: Deploy to Cloudflare Pages

1. Log in to Cloudflare Dashboard
2. Go to **Pages** → **Create a project**
3. Connect GitHub → Select repository
4. Build settings:
   - **Framework**: None (Static site)
   - **Build command**: (leave empty)
   - **Build output directory**: `web/`
5. Deploy!

### Step 6: Set Environment Variables

In Cloudflare Pages dashboard:
- Settings → Environment variables
- Add: `BACKEND_URL=https://your-backend-url.com`

---

## Option 2: Full Cloudflare (Workers + KV)

### Limitations:
- ⚠️ Cloudflare Workers timeout: 30 seconds
- ⚠️ Your STT processing: ~65 seconds (exceeds limit)
- ⚠️ Requires refactoring to async job queue

### If you still want this:
Use `wrangler` CLI and deploy worker scripts for API endpoints.

---

## Backend Server Setup (If keeping local)

### Option A: Keep Running on Your Machine
- Box/Network adapter faces issue? Use ngrok tunnel:

```bash
pip install ngrok
ngrok http 8000
# Get public URL
```

- Share `https://abc-123.ngrok.io` as backend URL

### Option B: Deploy Backend to Cloud Server
- **fly.io**: `flyctl deploy` (Python-friendly)
- **Render**: Connect GitHub, auto-deploy
- **Heroku**: `git push heroku main`

Example for Render.com:
```yaml
# render.yaml
services:
  - type: web
    name: stt-backend
    env: python
    startCommand: python run.py web
    envVars:
      - key: PORT
        value: 8000
```

---

## Architecture Diagram

```
User Browser (Cloudflare Pages)
    ↓
https://summary-to-team.pages.dev
    ↓
index.html (Frontend)
    ├→ /api/upload → Backend (ngrok / Render / fly.io)
    ├→ /api/process
    └→ /api/status
```

---

## Testing After Deployment

```bash
# Test frontend loads
curl https://summary-to-team.pages.dev

# Test API proxy
curl https://summary-to-team.pages.dev/api/status/test
```

---

## Summary

| Component | Location | Status |
|-----------|----------|--------|
| Frontend (HTML/CSS/JS) | Cloudflare Pages | ✅ Fast, Global CDN |
| Backend API | Your Server | 🚀 Running Python |
| Database | (none - in-memory) | 📦 Already in code |
| Audio Files | R2 Bucket | ✅ Already set up |

**Recommended Path:**
1. Deploy frontend to CF Pages
2. Use ngrok (temporary) or Render.com (permanent) for backend
3. Update API URL in code
4. Test end-to-end
