@echo off
cd /d "%~dp0"
if not exist processing\logs mkdir processing\logs
chcp 65001 >nul
title STT Final Summary - Starting...

echo.
echo ╔══════════════════════════════════════════════╗
echo ║     STT Final Summary - Starting System      ║
echo ╚══════════════════════════════════════════════╝
echo.

:: ── [1/6] Kill old processes ──────────────────────────────────────────────
echo [1/6] Stopping old processes...
taskkill /F /IM python.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

:: ── [2/6] Start local Wisper server (port 8000) ───────────────────────────
echo [2/6] Starting local Wisper server on port 8000...
start /B python wisper\run_wisper.py > processing\logs\wisper.log 2>&1
timeout /t 2 /nobreak >nul

:: ── [3/6] Start Python web server (port 8001) ────────────────────────────
echo [3/6] Starting Python web server on port 8001...
start /B python web\server.py --port 8001 > processing\logs\server.log 2>&1
timeout /t 2 /nobreak >nul

:: ── [4/6] Find cloudflared ────────────────────────────────────────────────
set "CF=cloudflared"
if exist "%~dp0cloudflared.exe" set "CF=%~dp0cloudflared.exe"

:: ── [5/6] Start TWO tunnels ───────────────────────────────────────────────
echo [5/6] Starting Cloudflare tunnels...
echo        - Wisper  tunnel  (port 8000) ...
start /B %CF% tunnel --protocol http2 --url http://localhost:8000 > processing\logs\tunnel-wisper.log 2>&1

echo        - Web     tunnel  (port 8001) ...
start /B %CF% tunnel --protocol http2 --url http://localhost:8001 > processing\logs\tunnel-web.log 2>&1

:: ── [6/6] Wait for both tunnel URLs ──────────────────────────────────────
echo [6/6] Waiting for tunnel URLs (up to 60 seconds)...
set WISPER_URL=
set WEB_URL=
set /A counter=0

:wait_loop
timeout /t 2 /nobreak >nul
set /A counter+=1
if %counter% GTR 30 goto timeout_error

:: Extract Wisper tunnel URL
if "%WISPER_URL%"=="" (
    for /f "tokens=* delims=" %%a in ('powershell -command "Select-String -Path \"processing\logs\tunnel-wisper.log\" -Pattern \"https://[a-z0-9\-]+\.trycloudflare\.com\" | ForEach-Object { $_.Matches[0].Value } | Select-Object -Last 1" 2^>nul') do (
        set "WISPER_URL=%%a"
    )
)

:: Extract Web tunnel URL
if "%WEB_URL%"=="" (
    for /f "tokens=* delims=" %%a in ('powershell -command "Select-String -Path \"processing\logs\tunnel-web.log\" -Pattern \"https://[a-z0-9\-]+\.trycloudflare\.com\" | ForEach-Object { $_.Matches[0].Value } | Select-Object -Last 1" 2^>nul') do (
        set "WEB_URL=%%a"
    )
)

if "%WISPER_URL%"=="" goto wait_loop
if "%WEB_URL%"=="" goto wait_loop

:: ── Publish backend config to R2 (ให้ Cloudflare Pages รู้ว่า wisper อยู่ที่ไหน) ──
echo.
echo Publishing backend config to R2...
python scripts\publish_backend_config.py "%WISPER_URL%" > processing\logs\backend-config.log 2>&1

:: ── Update EXTERNAL_WHISPER_ENDPOINT secret ใน Cloudflare Pages ──────────
echo Updating EXTERNAL_WHISPER_ENDPOINT secret in Cloudflare Pages...
echo %WISPER_URL% | npx wrangler pages secret put EXTERNAL_WHISPER_ENDPOINT --project-name summary-to-team > processing\logs\secret-update.log 2>&1

:: ── Build share link ──────────────────────────────────────────────────────
set "SHARE_URL=https://summary-to-team.pages.dev?backend=%WISPER_URL%"

cls
echo.
echo ╔══════════════════════════════════════════════════════════════════════╗
echo ║              ✅ SYSTEM READY - ระบบพร้อมใช้งาน                     ║
echo ╠══════════════════════════════════════════════════════════════════════╣
echo ║                                                                      ║
echo ║  🖥  Local Web:      http://localhost:8001                           ║
echo ║  🤖  Local Wisper:   http://localhost:8000                           ║
echo ║                                                                      ║
echo ║  🌐  Web Tunnel:     %WEB_URL%
echo ║  🎙  Wisper Tunnel:  %WISPER_URL%
echo ║                                                                      ║
echo ╠══════════════════════════════════════════════════════════════════════╣
echo ║  📤 SHARE LINK (ส่งให้คนอื่นใช้ - ใช้ Wisper local ได้เลย):        ║
echo ║                                                                      ║
echo ║  %SHARE_URL%
echo ║                                                                      ║
echo ╚══════════════════════════════════════════════════════════════════════╝
echo.

:: Copy share link to clipboard
echo %SHARE_URL% | clip
echo  ✅ Share link copied to clipboard!
echo.
echo  ℹ️  Wisper model กำลังโหลดอยู่ในพื้นหลัง (ครั้งแรกใช้เวลา 1-2 นาที)
echo  ℹ️  ดู log: processing\logs\wisper.log
echo.
echo  กด Ctrl+C เพื่อหยุดระบบทั้งหมด
echo.

:: Open browser
start "" "http://localhost:8001"

:: ── Keep alive + re-publish every 20 min (tunnel URL ไม่เปลี่ยน แต่ config หมดอายุ 24h) ──
set /A tick=0
:keepalive
timeout /t 30 /nobreak >nul
set /A tick+=1
if %tick% GEQ 40 (
    set /A tick=0
    python scripts\publish_backend_config.py "%WISPER_URL%" > processing\logs\backend-config.log 2>&1
)
goto keepalive

:: ── Timeout error ─────────────────────────────────────────────────────────
:timeout_error
echo.
echo ❌ Tunnel ไม่สำเร็จภายใน 60 วินาที
echo.
if "%WISPER_URL%"=="" (
    echo    Wisper tunnel: ยังไม่ได้ URL
    echo    Log: processing\logs\tunnel-wisper.log
    type processing\logs\tunnel-wisper.log
) else (
    echo    Wisper tunnel: %WISPER_URL% ✅
)
echo.
if "%WEB_URL%"=="" (
    echo    Web tunnel: ยังไม่ได้ URL
    echo    Log: processing\logs\tunnel-web.log
    type processing\logs\tunnel-web.log
) else (
    echo    Web tunnel: %WEB_URL% ✅
)
echo.
echo  ลองเปิด http://localhost:8001 แทนได้เลย
echo.
pause
