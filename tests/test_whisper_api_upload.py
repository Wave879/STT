#!/usr/bin/env python3
"""
ทดสอบการส่งไฟล์เสียงไปถอดความที่ WhisperX API Server
รองรับ 3 โหมด:
  1. ส่งไฟล์ local — อัปโหลดผ่าน R2 (เหมือนระบบหลัก) หรือ uguu.se เป็น fallback
  2. ส่ง URL ของไฟล์บนอินเทอร์เน็ต
  3. ทดสอบเฉพาะ /health endpoint
"""

import argparse
import json
import os
import sys
import socket
import threading
import time
import uuid
import warnings
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Optional
import urllib.parse

import requests
from dotenv import load_dotenv

# โหลด .env เหมือนระบบหลัก
load_dotenv(dotenv_path=Path(__file__).parent / '.env')

# ============================================================
# CONFIG (แก้ตรงนี้ถ้า API อยู่ที่อื่น)https://summary-to-team.pages.dev?backend=https://wed-navy-legs-ratios.trycloudflare.com
# ============================================================
DEFAULT_API_HOST = "http://192.168.10.19"
DEFAULT_API_PORT = 8100
# ============================================================


def build_base_url(host: str, port: int) -> str:
    return f"{host.rstrip('/')}:{port}"


# ---------- Helpers ----------

def print_header(title: str):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)


def print_result(label: str, value):
    if isinstance(value, (dict, list)):
        print(f"  {label}:")
        print("  " + json.dumps(value, ensure_ascii=False, indent=4).replace("\n", "\n  "))
    else:
        print(f"  {label}: {value}")


# ---------- 1. Health Check ----------

def test_health(base_url: str) -> bool:
    print_header("1. Health Check")
    url = f"{base_url}/health"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        print_result("status", data.get("status"))
        print_result("model", data.get("default_model"))
        print_result("port", data.get("port"))
        print_result("diarization", data.get("diarization_enabled"))
        print(f"\n  [PASS] Health OK ({resp.elapsed.total_seconds():.2f}s)")
        return True
    except requests.ConnectionError:
        print(f"  [FAIL] ไม่สามารถเชื่อมต่อ {url} — ตรวจสอบว่า API server รันอยู่")
        return False
    except Exception as e:
        print(f"  [FAIL] {e}")
        return False


# ---------- Temp file hosting (R2 → uguu.se fallback) ----------

_MIME_MAP = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
    '.mp4': 'audio/mp4', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.webm': 'audio/webm',
}

_r2_key_uploaded: Optional[str] = None   # เก็บไว้ลบทีหลัง


def _r2_configured() -> bool:
    return bool(
        os.getenv('R2_ACCOUNT_ID') and
        os.getenv('R2_ACCESS_KEY_ID') and
        os.getenv('R2_SECRET_ACCESS_KEY') and
        os.getenv('R2_PUBLIC_URL')
    )


def _r2_client():
    import boto3
    account_id = os.getenv('R2_ACCOUNT_ID', '')
    access_key = os.getenv('R2_ACCESS_KEY_ID', '')
    secret_key = os.getenv('R2_SECRET_ACCESS_KEY', '')
    endpoint   = f"https://{account_id}.r2.cloudflarestorage.com"
    return boto3.client(
        's3',
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name='auto',
    )


def r2_upload(file_path: Path) -> str:
    """อัปโหลดไปที่ R2 คืนค่า public URL หรือ '' ถ้าล้มเหลว"""
    global _r2_key_uploaded
    bucket = os.getenv('R2_BUCKET', 'stt-audio-temp')
    key    = f"tmp/{uuid.uuid4().hex}{file_path.suffix}"
    mime   = _MIME_MAP.get(file_path.suffix.lower(), 'audio/mpeg')
    try:
        client = _r2_client()
        client.upload_file(str(file_path), bucket, key, ExtraArgs={'ContentType': mime})
        _r2_key_uploaded = key
        url = f"{os.getenv('R2_PUBLIC_URL', '').rstrip('/')}/{key}"
        print(f"  [R2] อัปโหลดสำเร็จ: {url}")
        return url
    except Exception as e:
        print(f"  [R2] ล้มเหลว: {e}")
        return ''


def r2_delete():
    """ลบไฟล์ temp ออกจาก R2 หลังจาก API ดึงไปแล้ว"""
    global _r2_key_uploaded
    if not _r2_key_uploaded:
        return
    bucket = os.getenv('R2_BUCKET', 'stt-audio-temp')
    try:
        _r2_client().delete_object(Bucket=bucket, Key=_r2_key_uploaded)
        print(f"  [R2] ลบ temp file แล้ว: {_r2_key_uploaded}")
    except Exception as e:
        print(f"  [R2] ลบไม่ได้ (non-critical): {e}")
    _r2_key_uploaded = None


def upload_to_temp_host(file_path: Path) -> str:
    """
    อัปโหลดไฟล์เพื่อให้ API server ดึงได้:
      1. ใช้ Cloudflare R2 (เหมือนระบบหลัก) ถ้าตั้งค่าไว้ใน .env
      2. Fallback → uguu.se (ถ้า R2 ไม่ได้ตั้งค่า)
    """
    size_mb = file_path.stat().st_size / (1024 * 1024)
    print(f"  ขนาดไฟล์: {size_mb:.1f} MB")
    mime = _MIME_MAP.get(file_path.suffix.lower(), 'audio/mpeg')

    # ── R2 (primary) ────────────────────────────────────────
    if _r2_configured():
        print("  อัปโหลดไปที่ Cloudflare R2...")
        url = r2_upload(file_path)
        if url:
            return url
        print("  R2 ล้มเหลว → ลอง uguu.se")

    # ── uguu.se (fallback) ───────────────────────────────────
    hosts = [
        ("uguu.se", lambda f: requests.post(
            "https://uguu.se/upload",
            files={"files[]": (file_path.stem + file_path.suffix, f, mime)},
            timeout=120, verify=False,
        )),
        ("catbox.moe", lambda f: requests.post(
            "https://catbox.moe/user/api.php",
            data={"reqtype": "fileupload"},
            files={"fileToUpload": (file_path.name, f, mime)},
            timeout=120, verify=False,
        )),
    ]

    warnings.filterwarnings("ignore", message="Unverified HTTPS request")
    for name, upload_fn in hosts:
        print(f"  อัปโหลดไปที่ {name}...")
        try:
            with open(file_path, "rb") as f:
                resp = upload_fn(f)
            if resp.status_code in (200, 201):
                try:
                    data = resp.json()
                    files = data.get("files") or []
                    if files and files[0].get("url"):
                        url = files[0]["url"]
                        print(f"  URL: {url}")
                        return url
                except Exception:
                    pass
                for line in resp.text.strip().splitlines():
                    line = line.strip()
                    if line.startswith("http"):
                        print(f"  URL: {line}")
                        return line
            else:
                print(f"  {name}: HTTP {resp.status_code} — ลอง host ถัดไป")
        except Exception as e:
            print(f"  {name}: error — {e} — ลอง host ถัดไป")

    raise RuntimeError("ไม่สามารถ upload ไฟล์ได้ ลองใช้ --url แทน")


class _SilentHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):  # ปิด log ของ server ชั่วคราว
        pass


def _find_free_port(bind_host: str = "0.0.0.0") -> int:
    with socket.socket() as s:
        s.bind((bind_host, 0))
        return s.getsockname()[1]


def _get_lan_ip() -> str:
    """หา IP ของเครื่องที่ remote server น่าจะเข้าถึงได้"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def serve_file_temporarily(file_path: Path, serve_host: Optional[str] = None):
    """
    เปิด HTTP server ชั่วคราวที่ directory ของไฟล์
    serve_host = IP ที่จะให้ remote server ดึงไฟล์ (ถ้าไม่ระบุจะหาอัตโนมัติ)
    คืนค่า (url, stop_fn) — เรียก stop_fn() เพื่อปิด server
    """
    directory = str(file_path.parent.resolve())
    advertise_ip = serve_host or _get_lan_ip()
    port = _find_free_port("0.0.0.0")

    handler = lambda *a, **kw: _SilentHandler(*a, directory=directory, **kw)
    server = HTTPServer(("0.0.0.0", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    encoded_name = urllib.parse.quote(file_path.name)
    url = f"http://{advertise_ip}:{port}/{encoded_name}"
    stop_fn = lambda: server.shutdown()
    return url, stop_fn


# ---------- 3. Transcription ----------

def test_transcribe(
    base_url: str,
    media_url: str,
    language: Optional[str] = None,
    output_format: str = "json",
    include_speaker_labels: bool = False,
    include_word_timestamps: bool = False,
    task: str = "transcribe",
    timeout: int = 1200,
) -> bool:
    print_header("2. Transcription Test")
    print(f"  media_url      : {media_url}")
    print(f"  language       : {language or 'auto-detect'}")
    print(f"  output_format  : {output_format}")
    print(f"  speaker_labels : {include_speaker_labels}")
    print(f"  word_timestamps: {include_word_timestamps}")
    print(f"  task           : {task}")
    print()

    payload = {
        "media_url": media_url,
        "output_format": output_format,
        "include_speaker_labels": include_speaker_labels,
        "include_word_timestamps": include_word_timestamps,
        "task": task,
    }
    if language:
        payload["language"] = language

    url = f"{base_url}/v1/media/transcribe"
    try:
        print("  กำลังส่งคำขอ... (อาจใช้เวลาสักครู่)")
        t_start = time.time()
        resp = requests.post(url, json=payload, timeout=timeout)
        elapsed = time.time() - t_start

        if resp.status_code != 200:
            print(f"  [FAIL] HTTP {resp.status_code}: {resp.text[:300]}")
            return False

        data = resp.json()
        response = data.get("response", {})

        print(f"\n  [PASS] ถอดความสำเร็จ")
        print(f"  processing_time : {data.get('processing_time')}s  (wall: {elapsed:.2f}s)")
        print(f"  detected_lang   : {response.get('detected_language')}")
        print()

        text = response.get("text", "")
        print("  --- Transcript ---")
        print(f"  {text[:800]}{'...' if len(text) > 800 else ''}")

        segments = response.get("segments", [])
        if segments:
            print(f"\n  Segments ({len(segments)} รายการ — แสดง 5 แรก):")
            for seg in segments[:5]:
                start = seg.get("start", 0)
                end = seg.get("end", 0)
                seg_text = (seg.get("text") or "").strip()
                speaker = seg.get("speaker", "")
                speaker_str = f"[{speaker}] " if speaker else ""
                print(f"    [{start:.2f}s → {end:.2f}s] {speaker_str}{seg_text}")

        if output_format in ("srt", "all") and response.get("srt"):
            print(f"\n  --- SRT (100 ตัวอักษรแรก) ---")
            print(f"  {response['srt'][:100]}...")

        if output_format in ("vtt", "all") and response.get("vtt"):
            print(f"\n  --- VTT (100 ตัวอักษรแรก) ---")
            print(f"  {response['vtt'][:100]}...")

        return True

    except requests.Timeout:
        print(f"  [FAIL] Timeout หลังจาก {timeout}s — ไฟล์อาจใหญ่เกินไปหรือ GPU ช้า")
        return False
    except requests.ConnectionError:
        print(f"  [FAIL] ไม่สามารถเชื่อมต่อ {url}")
        return False
    except Exception as e:
        print(f"  [FAIL] {e}")
        return False


# ---------- 4. Main ----------

def main():
    parser = argparse.ArgumentParser(
        description="ทดสอบส่งไฟล์เสียงไปถอดความที่ WhisperX API Server",
        formatter_class=argparse.RawTextHelpFormatter,
    )

    source_group = parser.add_mutually_exclusive_group()
    source_group.add_argument(
        "--file", "-f",
        metavar="PATH",
        help="path ไฟล์เสียง local เช่น input/audio_files/sample.wav",
    )
    source_group.add_argument(
        "--url", "-u",
        metavar="URL",
        help="URL ของไฟล์เสียงบนอินเทอร์เน็ต",
    )

    parser.add_argument("--host", default=DEFAULT_API_HOST, help=f"API host (default: {DEFAULT_API_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_API_PORT, help=f"API port (default: {DEFAULT_API_PORT})")
    parser.add_argument("--language", "-l", default=None, help="รหัสภาษา เช่น th, en, ja (default: auto-detect)")
    parser.add_argument(
        "--format", dest="output_format", default="json",
        choices=["json", "srt", "txt", "vtt", "all"],
        help="รูปแบบ output (default: json)",
    )
    parser.add_argument("--speakers", action="store_true", help="เปิด speaker diarization")
    parser.add_argument("--words", action="store_true", help="เปิด word-level timestamps")
    parser.add_argument(
        "--task", default="transcribe", choices=["transcribe", "translate"],
        help="transcribe = ถอดความ, translate = แปลเป็นอังกฤษ (default: transcribe)",
    )
    parser.add_argument("--timeout", type=int, default=1200, help="timeout วินาที (default: 1200)")
    parser.add_argument("--health-only", action="store_true", help="ทดสอบเฉพาะ /health endpoint")
    parser.add_argument("--serve-host", metavar="IP", default=None,
                        help="IP ของเครื่องนี้ที่ API server เข้าถึงได้ เช่น 172.16.100.112 (ถ้าไม่ระบุจะหาอัตโนมัติ)")
    parser.add_argument("--temp-upload", action="store_true", default=True,
                        help="อัปโหลดไฟล์ผ่าน R2 หรือ uguu.se ก่อนส่ง URL ให้ API (default: เปิดอยู่ — เหมือนระบบหลัก)")
    parser.add_argument("--no-temp-upload", dest="temp_upload", action="store_false",
                        help="ปิด temp upload — ใช้ local HTTP server แทน (ต้องการ network ถึงกัน)")

    args = parser.parse_args()
    base_url = build_base_url(args.host, args.port)

    print(f"\nWhisperX API Test")
    print(f"Target: {base_url}")

    # --- Health ---
    health_ok = test_health(base_url)
    if args.health_only:
        sys.exit(0 if health_ok else 1)

    if not health_ok:
        print("\n  API ไม่พร้อม — หยุดการทดสอบ")
        sys.exit(1)

    # --- เลือก source ---
    stop_server = None
    media_url = None

    if args.url:
        media_url = args.url

    elif args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"\n  [FAIL] ไม่พบไฟล์: {file_path}")
            sys.exit(1)

        if args.temp_upload:
            print_header("Upload ไฟล์ไปที่ Temp Host")
            media_url = upload_to_temp_host(file_path)
        else:
            print(f"\n  เปิด HTTP server ชั่วคราวสำหรับ: {file_path.name}")
            media_url, stop_server = serve_file_temporarily(file_path, serve_host=args.serve_host)
            print(f"  Serving at: {media_url}")
            time.sleep(0.3)  # รอ server พร้อม

    else:
        # ถ้าไม่ระบุ ให้หาไฟล์เสียงใน input/audio_files อัตโนมัติ
        audio_dir = Path(__file__).parent / "input" / "audio_files"
        audio_exts = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".mp4", ".webm"}
        candidates = [p for p in audio_dir.glob("**/*") if p.suffix.lower() in audio_exts]

        if not candidates:
            print("\n  ไม่พบไฟล์เสียงใน input/audio_files/")
            print("  ระบุไฟล์ด้วย --file <path> หรือ --url <url>")
            print("\n  ตัวอย่าง:")
            print("    python test_whisper_api_upload.py --file input/audio_files/sample.wav")
            print("    python test_whisper_api_upload.py --url https://example.com/audio.mp3")
            print("    python test_whisper_api_upload.py --health-only")
            sys.exit(0)

        file_path = candidates[0]
        print(f"\n  พบไฟล์เสียง: {file_path}")
        media_url, stop_server = serve_file_temporarily(file_path, serve_host=args.serve_host)
        print(f"  Serving at: {media_url}")
        time.sleep(0.3)

    # --- Transcribe ---
    try:
        success = test_transcribe(
            base_url=base_url,
            media_url=media_url,
            language=args.language,
            output_format=args.output_format,
            include_speaker_labels=args.speakers,
            include_word_timestamps=args.words,
            task=args.task,
            timeout=args.timeout,
        )
    finally:
        if stop_server:
            stop_server()
        r2_delete()  # ลบ temp file ออกจาก R2 (ถ้าอัปโหลดผ่าน R2)

    print()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
