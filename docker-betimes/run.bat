@echo off
chcp 65001 >nul
title BETiMES Docker
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║         BETiMES STT - Meeting Summary Server         ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: ── ตรวจสอบ Docker ──────────────────────────────────────────
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Docker ไม่ได้รันอยู่ กรุณาเปิด Docker Desktop ก่อน
    pause
    exit /b 1
)

:: ── ตรวจสอบ wisper server ────────────────────────────────────
echo  [1/4] ตรวจสอบ Wisper server (192.168.10.19:9000)...
curl -s --max-time 3 http://192.168.10.19:9000/ >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ⚠️  Wisper server ไม่ได้รันอยู่ที่ 192.168.10.19:9000
    echo  ℹ️  Whisper จะ fallback ไปใช้ Azure OpenAI แทน
    echo.
) else (
    echo  ✅ Wisper server พร้อมที่ 192.168.10.19:9000
)

:: ── หยุด container เก่า ──────────────────────────────────────
echo  [2/4] หยุด container เก่า...
docker stop betimes-web betimes-postgres betimes-nginx >nul 2>&1
docker rm betimes-web betimes-postgres betimes-nginx >nul 2>&1

:: ── Build + Start ─────────────────────────────────────────────
echo  [3/4] Build + Start containers...
echo.
docker-compose up --build --detach
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Build ล้มเหลว ดู log ด้านบน
    pause
    exit /b 1
)

:: ── รอ server พร้อม ──────────────────────────────────────────
echo.
echo  [4/4] รอ server พร้อม...
timeout /t 10 /nobreak >nul

:: ── เช็ค health ──────────────────────────────────────────────
curl -s http://localhost:9100/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo  ╔══════════════════════════════════════════════════════╗
    echo  ║              ✅ BETiMES พร้อมใช้งาน!                 ║
    echo  ╠══════════════════════════════════════════════════════╣
    echo  ║                                                      ║
    echo  ║  🖥  Local  :  http://localhost:9100                 ║
    echo  ║  🌐  LAN    :  http://[server-ip]:9100               ║
    echo  ║                                                      ║
    echo  ║  👤  Login  :  admin / 123456789                     ║
    echo  ║                                                      ║
    echo  ╠══════════════════════════════════════════════════════╣
    echo  ║  📋 Features:                                        ║
    echo  ║  ✅ MAI Speech (diarization)                         ║
    echo  ║  ✅ Azure Speech SDK                                 ║
    echo  ║  ✅ Whisper (local GPU / Azure fallback)             ║
    echo  ║  ✅ AI Summary + Speaker correction                  ║
    echo  ║  ✅ OCR (PDF to Word/Excel)                          ║
    echo  ║  ✅ Chunked upload (รองรับไฟล์ 1-2 ชม)              ║
    echo  ║                                                      ║
    echo  ╚══════════════════════════════════════════════════════╝
    echo.
    start "" "http://localhost:9100"
) else (
    echo.
    echo  ⚠️  Server ยังไม่พร้อม รอเพิ่มอีก 15 วินาที...
    timeout /t 15 /nobreak >nul
    start "" "http://localhost:9100"
)

echo.
echo  กด Enter เพื่อดู log  ^|  Ctrl+C เพื่อออก
echo.
pause >nul

docker-compose logs --follow betimes-web
