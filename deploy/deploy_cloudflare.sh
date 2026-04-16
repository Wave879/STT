#!/bin/bash
# Automated Cloudflare Deployment Script
# Step 1: Push to GitHub

echo "🚀 CLOUDFLARE DEPLOYMENT AUTOMATION"
echo "===================================="
echo ""

# ✅ Done: Git initialized and committed
echo "✅ Git repository initialized"
echo "✅ Files staged and committed"
echo ""

echo "📝 NEXT STEPS:"
echo ""
echo "1️⃣  CREATE GITHUB REPOSITORY"
echo "   - Go to: https://github.com/new"
echo "   - Repository name: summary-to-team"
echo "   - Make it PUBLIC (for Cloudflare)"
echo "   - DO NOT initialize with README (we already have commits)"
echo "   - Click 'Create repository'"
echo ""

echo "2️⃣  GET YOUR GITHUB URL"
echo "   After creating repo, copy the URL format:"
echo "   https://github.com/YOUR_USERNAME/summary-to-team.git"
echo ""

echo "3️⃣  SET GITHUB REMOTE & PUSH"
echo "   Run this command (replace YOUR_USERNAME):"
echo ""
echo "   git remote add origin https://github.com/YOUR_USERNAME/summary-to-team.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""

echo "4️⃣  WAIT 1-2 MINUTES FOR GIT TO AUTHORIZE"
echo "   You may be prompted for authentication"
echo ""

echo "5️⃣  CONNECT CLOUDFLARE PAGES"
echo "   - Go to: https://dash.cloudflare.com/pages"
echo "   - Click 'Create a project'"
echo "   - Select 'Connect to Git'"
echo "   - Authorize Cloudflare on GitHub"
echo "   - Select 'summary-to-team' repository"
echo ""

echo "6️⃣  CONFIGURE BUILD SETTINGS"
echo "   - Framework: None"
echo "   - Build command: (leave empty)"
echo "   - Build output directory: web/"
echo "   - Click 'Save and Deploy'"
echo ""

echo "7️⃣  SET ENVIRONMENT VARIABLE"
echo "   - In Cloudflare Pages Settings → Environment variables"
echo "   - Add: BACKEND_URL = http://localhost:8000"
echo ""

echo "✨ Then your site lives at: https://summary-to-team.pages.dev"
echo ""

# Script to push (run after creating GitHub repo)
cat > push_to_github.sh << 'EOF'
#!/bin/bash
read -p "Enter your GitHub username: " username
git remote add origin https://github.com/$username/summary-to-team.git
git branch -M main
git push -u origin main
echo "✅ Pushed to GitHub!"
EOF

chmod +x push_to_github.sh
echo "💡 Shortcut created: ./push_to_github.sh"
