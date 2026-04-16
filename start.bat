@echo off
chcp 65001 >nul
title STT Final Summary - Starting...

echo.
echo ╔══════════════════════════════════════════════╗
echo ║     STT Final Summary - Starting System      ║
echo ╚══════════════════════════════════════════════╝
echo.

:: Kill old processes
echo [1/4] Stopping old processes...
taskkill /F /IM python.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 1 /nobreak >nul

:: Start Python server
echo [2/4] Starting Python server on port 8000...
start /B python web/server.py > processing\logs\server.log 2>&1
timeout /t 2 /nobreak >nul

:: Start Cloudflare Quick Tunnel (http2 = TCP 443, ไม่ถูก block)
echo [3/4] Starting Cloudflare tunnel (this may take 10 seconds)...
start /B .\cloudflared.exe tunnel --protocol http2 --url http://localhost:8000 > processing\logs\tunnel.log 2>&1

:: Wait for tunnel URL to appear in log
echo [4/4] Waiting for tunnel URL...
set TUNNEL_URL=
set /A counter=0
:wait_loop
timeout /t 2 /nobreak >nul
set /A counter+=1
if %counter% GTR 20 goto timeout_error

:: Extract URL from log
for /f "tokens=*" %%a in ('findstr /i "trycloudflare.com" processing\logs\tunnel.log 2^>nul') do (
    set "LOG_LINE=%%a"
)
if "%LOG_LINE%"=="" goto wait_loop

:: Parse URL from log line
for /f "tokens=* delims=" %%a in ('powershell -command "Select-String -Path 'processing\logs\tunnel.log' -Pattern 'https://[a-z0-9\-]+\.trycloudflare\.com' | ForEach-Object { $_.Matches[0].Value } | Select-Object -Last 1" 2^>nul') do (
    set "TUNNEL_URL=%%a"
)

if "%TUNNEL_URL%"=="" goto wait_loop

:: Build share link
set "SHARE_URL=https://summary-to-team.pages.dev?backend=%TUNNEL_URL%"

cls
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║              ✅ SYSTEM READY - ระบบพร้อมใช้งาน              ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  🖥  Local:   http://localhost:8000                          ║
echo ║                                                              ║
echo ║  🌐  Tunnel:  %TUNNEL_URL%
echo ║                                                              ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║  📤 SHARE LINK (ส่งให้คนอื่นใช้):                           ║
echo ║                                                              ║
echo ║  %SHARE_URL%
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Copy share link to clipboard
echo %SHARE_URL% | clip
echo  ✅ Share link copied to clipboard (คัดลอกแล้ว!)
echo.
echo  กด Ctrl+C เพื่อหยุดระบบ
echo.

:: Open local browser
start "" "http://localhost:8000"

:: Keep window open
:keepalive
timeout /t 30 /nobreak >nul
goto keepalive

:timeout_error
echo.
echo ❌ Tunnel ไม่สำเร็จ - ลองเปิด http://localhost:8000 แทน
echo.
echo Log:
type processing\logs\tunnel.log
echo.
pause
