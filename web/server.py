#!/usr/bin/env python3
"""
STT Final Summary - Web Server with REST API
Handles file upload, background STT processing, and result serving.

API Endpoints:
  POST /api/upload          - Upload audio file, returns {job_id}
  POST /api/process         - Start processing job, returns {job_id, status}
  GET  /api/status/<job_id> - Poll job progress
  GET  /api/audio/<job_id>  - Stream uploaded audio (for WaveSurfer)
  GET  /api/download/<job_id> - Download final transcript
"""

import os
import sys
import re
import json
import uuid
import mimetypes
import threading
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── Project paths ────────────────────────────────────────────────────────────
PROJECT_DIR = Path(__file__).parent.parent.resolve()
os.chdir(PROJECT_DIR)          # ensure relative paths in scripts work

from dotenv import load_dotenv
load_dotenv(dotenv_path=PROJECT_DIR / '.env')

sys.path.insert(0, str(PROJECT_DIR / 'scripts'))

WEB_DIR    = Path(__file__).parent
UPLOAD_DIR = WEB_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

# ── In-memory job store ───────────────────────────────────────────────────────
_jobs: dict = {}
_lock = threading.Lock()


def _upd(job_id: str, **kw):
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(kw)


# ── Background processing ─────────────────────────────────────────────────────
def process_job(job_id: str, audio_path: Path):
    """Run 3-step STT pipeline in a background thread."""
    import sys

    def upd(**kw):
        _upd(job_id, **kw)
        msg = kw.get('message', '')
        if msg:
            print(f"[{job_id}] {msg}", flush=True, file=sys.stdout)

    try:
        # Step 1 – Validate
        upd(step=1, status='processing', message='กำลังตรวจสอบไฟล์...')
        from stt_processor import SUPPORTED_FORMATS
        if audio_path.suffix.lower() not in SUPPORTED_FORMATS:
            upd(status='error', message=f'ไม่รองรับ format: {audio_path.suffix}')
            return
        size_kb = audio_path.stat().st_size / 1024
        upd(message=f'ตรวจสอบแล้ว ({size_kb:.0f} KB)')

        # Step 2 – STT (Azure primary → MAI fallback)
        upd(step=2, message='กำลังถอดความ (Azure STT)...')
        from stt_processor import transcribe
        plain_text, transcript_md, engine = transcribe(str(audio_path))

        if engine == 'none' or not plain_text:
            upd(status='error', message='ถอดความไม่สำเร็จ — ตรวจสอบ API key ใน .env')
            return

        engine_label = {'azure': 'Azure', 'mai': 'MAI (fallback)'}.get(engine, engine)
        upd(
            message=f'ถอดความเสร็จแล้ว ({engine_label})',
            stt_text=plain_text,
            stt_engine=engine_label,
        )

        # Save transcript
        final_dir = PROJECT_DIR / 'output' / 'stt_final'
        final_dir.mkdir(parents=True, exist_ok=True)
        stem = audio_path.stem
        transcript_path = final_dir / f"{stem}_transcript.md"
        transcript_path.write_text(transcript_md, encoding='utf-8')

        # Step 3 – Summarize
        upd(step=3, message='กำลังสรุปด้วย Azure OpenAI...')
        from smart_summarizer import summarize
        summary_text = summarize(plain_text)

        sum_dir = PROJECT_DIR / 'output' / 'summaries'
        sum_dir.mkdir(parents=True, exist_ok=True)
        sum_path = sum_dir / f"{stem}_summary.md"
        sum_path.write_text(
            f"# สรุป: {audio_path.name}\n\n{summary_text}", encoding='utf-8'
        )

        upd(
            step=3,
            status='done',
            message='ประมวลผลเสร็จสิ้น ✅',
            summary=summary_text,
            transcript_file=str(transcript_path),
        )

    except Exception as exc:
        _upd(job_id, status='error', message=f'เกิดข้อผิดพลาด: {exc}')



# ── Multipart parser ──────────────────────────────────────────────────────────
def _parse_upload(content_type: str, body: bytes):
    """Return (filename, data) from a multipart/form-data body."""
    m = re.search(r'boundary=([^\s;]+)', content_type)
    if not m:
        return None, None
    boundary = m.group(1).encode()
    for part in body.split(b'--' + boundary)[1:]:
        if part.lstrip(b'\r\n').startswith(b'--'):
            break
        sep = part.find(b'\r\n\r\n')
        if sep == -1:
            continue
        hdr  = part[2:sep]
        data = part[sep + 4:]
        if data.endswith(b'\r\n'):
            data = data[:-2]
        fn = re.search(rb'filename="([^"]+)"', hdr, re.IGNORECASE)
        if fn:
            return fn.group(1).decode('utf-8', errors='replace'), data
    return None, None


# ── HTTP handler ──────────────────────────────────────────────────────────────
class STTHTTPHandler(BaseHTTPRequestHandler):

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path: Path, download_name: str = None):
        data  = path.read_bytes()
        ctype, _ = mimetypes.guess_type(str(path))
        self.send_response(200)
        self.send_header('Content-Type', ctype or 'application/octet-stream')
        self.send_header('Content-Length', len(data))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        if download_name:
            self.send_header('Content-Disposition', f'attachment; filename="{download_name}"')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        p = self.path.split('?')[0]

        # GET /audio-serve/<id>  – lightweight endpoint for Whisper server to pull audio (no-auth)
        if p.startswith('/audio-serve/'):
            job_id = p[len('/audio-serve/'):]
            with _lock:
                ap = _jobs.get(job_id, {}).get('audio_path')
            fp = Path(ap) if ap else None
            if not fp or not fp.exists():
                return self.send_error(404)
            return self._file(fp)

        # GET /api/status/<id>
        if p.startswith('/api/status/'):
            job_id = p[len('/api/status/'):]
            with _lock:
                job = dict(_jobs.get(job_id, {}))
            if not job:
                return self._json({'error': 'not found'}, 404)
            job.pop('audio_path', None)
            return self._json(job)

        # GET /api/audio/<id>  – serve uploaded audio for WaveSurfer
        if p.startswith('/api/audio/'):
            job_id = p[len('/api/audio/'):]
            with _lock:
                ap = _jobs.get(job_id, {}).get('audio_path')
            fp = Path(ap) if ap else None
            if not fp or not fp.exists():
                return self.send_error(404)
            return self._file(fp)

        # GET /api/download/<id>  – download final transcript
        if p.startswith('/api/download/'):
            job_id = p[len('/api/download/'):]
            with _lock:
                tf = _jobs.get(job_id, {}).get('transcript_file')
            fp = Path(tf) if tf else None
            if not fp or not fp.exists():
                return self.send_error(404)
            return self._file(fp, download_name=fp.name)

        # Static files
        fp = WEB_DIR / 'index.html' if p in ('/', '/index.html') else WEB_DIR / p.lstrip('/')
        if fp.exists() and fp.is_file():
            data  = fp.read_bytes()
            ctype, _ = mimetypes.guess_type(str(fp))
            self.send_response(200)
            self.send_header('Content-Type', ctype or 'application/octet-stream')
            self.send_header('Content-Length', len(data))
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(data)
        else:
            self.send_error(404)

    def do_POST(self):
        p      = self.path.split('?')[0]
        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length)

        # POST /api/upload
        if p == '/api/upload':
            ctype = self.headers.get('Content-Type', '')
            filename, data = _parse_upload(ctype, body)
            if not filename or data is None:
                return self._json({'error': 'ไม่พบไฟล์ใน request'}, 400)

            job_id = uuid.uuid4().hex[:8]
            ext    = Path(filename).suffix.lower()
            saved  = UPLOAD_DIR / f"{job_id}{ext}"
            saved.write_bytes(data)

            with _lock:
                _jobs[job_id] = {
                    'job_id':     job_id,
                    'filename':   filename,
                    'audio_path': str(saved),
                    'step':       0,
                    'status':     'uploaded',
                    'message':    f'อัพโหลด {filename} แล้ว',
                }
            return self._json({'job_id': job_id, 'filename': filename})

        # POST /api/process
        if p == '/api/process':
            try:
                req = json.loads(body.decode('utf-8'))
            except Exception:
                return self._json({'error': 'invalid JSON'}, 400)

            job_id = req.get('job_id', '')
            with _lock:
                job = _jobs.get(job_id)
            if not job:
                return self._json({'error': 'job not found'}, 404)

            threading.Thread(
                target=process_job,
                args=(job_id, Path(job['audio_path'])),
                daemon=True,
            ).start()
            return self._json({'job_id': job_id, 'status': 'started'})

        self.send_error(404)

    def log_message(self, fmt, *args):
        pass  # suppress request logging


def start_server(port=8000, host='0.0.0.0'):
    """Start the HTTP server"""
    server_address = (host, port)
    httpd = HTTPServer(server_address, STTHTTPHandler)

    import sys
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

    print(f"""
STT FINAL SUMMARY - WEB INTERFACE

Web Interface Running at:
   -> http://localhost:{port}

Serving from: {Path(__file__).parent}

To stop: Press Ctrl+C
""")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n✓ Server stopped")
    finally:
        httpd.server_close()


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='STT Final Summary - Static HTML Server'
    )
    parser.add_argument('--port', type=int, default=8000,
                       help='Port to serve on (default: 8000)')
    parser.add_argument('--host', default='127.0.0.1',
                       help='Host to bind to (default: 127.0.0.1)')
    
    args = parser.parse_args()
    
    start_server(port=args.port, host=args.host)


if __name__ == '__main__':
    main()
