# 🚀 COWORK AudioAI - Cloudflare Pages Deployment

## Status: ✅ Ready to Deploy

Your code is git-prepared and ready for GitHub. Follow these 3 simple steps:

---

## STEP 1️⃣: Create GitHub Repository (2 min)

### Go to: https://github.com/new

Fill in:
- **Repository name:** `summary-to-team`
- **Visibility:** 🔵 **PUBLIC** (important for Cloudflare)
- **Initialize with:** ❌ Do NOT check any options
- Click: **"Create repository"**

After creating, GitHub shows:

```
…or push an existing repository from the command line

git remote add origin https://github.com/YOUR_USERNAME/summary-to-team.git
git branch -M main
git push -u origin main
```

**Copy your URL** (replace `YOUR_USERNAME`)

---

## STEP 2️⃣: Push Code to GitHub (2 min)

Open Terminal/PowerShell at `C:\Users\wave\Documents\STTfinalsammary`:

```bash
# Replace YOUR_USERNAME with your GitHub username
git remote add origin https://github.com/YOUR_USERNAME/summary-to-team.git
git branch -M main
git push -u origin main
```

When prompted:
- Username: Your GitHub username
- Password: Your GitHub personal access token OR use web login

**✅ Wait 1-2 minutes for GitHub to process**

---

## STEP 3️⃣: Deploy to Cloudflare Pages (3 min)

### Go to: https://dash.cloudflare.com/pages

1. Click **"Create a project"** → **"Connect to Git"**
2. **Authorize** Cloudflare on GitHub (popup)
3. Select **"summary-to-team"** repository
4. Build settings:
   - Framework: **None**
   - Build command: (leave EMPTY)
   - Build output directory: **web/**
5. Click **"Save and Deploy"**

**⏳ Wait 1-2 minutes for Cloudflare to deploy**

---

## STEP 4️⃣: Set Environment Variable (1 min)

While Cloudflare deploys, configure backend:

1. In **Cloudflare Pages** → Select project → **Settings**
2. Go to **Environment variables** section
3. Add new variable:
   - **Name:** `BACKEND_URL`
   - **Value:** `http://localhost:8000`
4. Click **"Save"**
5. Go back → **Redeploy** (click the latest deployment)

---

## STEP 5️⃣: Keep Backend Running

Keep your backend server running:

```bash
cd C:\Users\wave\Documents\STTfinalsammary
python run.py web
```

This must stay running for the API to work.

---

## ✨ RESULT

Your website is now live at:

**🌐 https://summary-to-team.pages.dev**

---

## 🧪 Testing

1. Visit: https://summary-to-team.pages.dev
2. Upload an MP3/WAV file
3. Click "ประมวลผลทันที"
4. Wait ~65 seconds for processing
5. See results (Azure/Whisper/MAI + Summary)

---

## ❌ Troubleshooting

### "404 Not Found" on Cloudflare
- Wait 2-3 minutes for deployment
- Check Cloudflare Pages build logs
- Verify `web/` folder exists with `index.html`

### "Cannot reach backend"
- Check BACKEND_URL is set in Cloudflare env vars
- Verify `python run.py web` is still running
- For production: Use ngrok or Render.com instead of localhost

### "Processing takes forever"
- Normal: ~65 seconds (Azure 14s + Whisper 34s + MAI 15s)
- Whisper is slow due to network distance

---

## 📋 Quick Checklist

- [ ] Created GitHub repo (summary-to-team)
- [ ] Pushed code to GitHub
- [ ] Connected GitHub to Cloudflare Pages
- [ ] Set BACKEND_URL in Cloudflare
- [ ] Backend server running (`python run.py web`)
- [ ] Site accessible at https://summary-to-team.pages.dev
- [ ] Can upload files
- [ ] Results appear after processing

---

## 🎯 Next Steps (Optional)

### Permanent Backend (Instead of localhost)

**Option A: Render.com (Free, Recommended)**
```bash
# Create render.yaml in project root
cat > render.yaml << EOF
services:
  - type: web
    name: stt-backend
    env: python
    runtime: python-3.10
    startCommand: python run.py web
    envVars:
      - key: PORT
        value: '8000'
EOF

git add render.yaml
git commit -m "Add Render deployment config"
git push
```

Then at render.com:
1. New Web Service → Connect GitHub
2. Select summary-to-team
3. Deploy
4. Get URL like `https://stt-backend.onrender.com`
5. Update BACKEND_URL in Cloudflare

---

**Status: Ready for deployment! 🚀**
