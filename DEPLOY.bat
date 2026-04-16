@echo off
REM COWORK AudioAI - Quick Deploy to Cloudflare
REM This script pushes your code to GitHub

echo.
echo ============================================
echo   COWORK AudioAI - Deploy to Cloudflare
echo ============================================
echo.

REM Step 1: Verify git status
echo [1/4] Checking git status...
cd /d "C:\Users\wave\Documents\STTfinalsammary"
git status
echo.

REM Step 2: Ask for GitHub username
set /p GITHUB_USER="[2/4] Enter your GitHub username (no @ symbol): "
echo.

REM Step 3: Add remote and push
echo [3/4] Adding GitHub remote...
git remote add origin https://github.com/%GITHUB_USER%/summary-to-team.git
if errorlevel 1 (
    echo.
    echo ⚠️  Remote already exists. Removing and re-adding...
    git remote remove origin
    git remote add origin https://github.com/%GITHUB_USER%/summary-to-team.git
)
echo.

echo [4/4] Pushing to GitHub...
echo   -> https://github.com/%GITHUB_USER%/summary-to-team
echo.
git branch -M main
git push -u origin main

if errorlevel 1 (
    echo.
    echo ❌ Push failed! Check:
    echo.
    echo 1. GitHub username is correct: %GITHUB_USER%
    echo 2. Repository exists: https://github.com/%GITHUB_USER%/summary-to-team
    echo 3. It's set to PUBLIC (not private)
    echo 4. You're authorized: https://github.com/settings/tokens
    echo.
    pause
    exit /b 1
)

echo.
echo ✅ PUSHED TO GITHUB SUCCESSFULLY!
echo.
echo Next steps:
echo 1. Go to Cloudflare: https://dash.cloudflare.com/pages
echo 2. Connect your GitHub repo
echo 3. Build output directory: web/
echo 4. Done!
echo.
pause
