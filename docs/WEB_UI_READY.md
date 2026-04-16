# 🌐 STT Web UI - Preview Monitoring Interface

ระบบพร้อมใช้แล้ว! มี UI สำหรับดูการประมวลผล แบบ Real-time พร้อมเสียง Progress Log ทั้งหมด

## ✅ สร้างไฟล์ใหม่ (Complete)

### Web Server
- ✅ `web_ui_server.py` - Flask API server พร้อม Server-Sent Events
- ✅ `ui.py` - Web UI launcher (standalone command)

### Frontend (Web UI)
- ✅ `templates/index.html` - หน้า HTML สำหรับ real-time preview
- ✅ `static/style.css` - Styling พร้อม responsive design
- ✅ `static/app.js` - JavaScript สำหรับ interactions และ real-time updates

### Documentation
- ✅ `WEB_UI_README.md` - คู่มือการใช้งาน Web UI

### Integration
- ✅ `run.py` - Added `web` command to CLI

---

## 🚀 วิธีใช้ (Quick Start)

### 1️⃣ เริ่มต้น Web UI
```bash
# วิธีที่ 1: ผ่าน run.py
python run.py web

# หรือ วิธีที่ 2: ตรงเริ่ม ui.py
python ui.py
```

### 2️⃣ เปิด Browser
```
http://localhost:5000
```

### 3️⃣ ใช้งาน
1. เลือกไฟล์เสียง (ฝั่งซ้าย)
2. ฟังตัวอย่างเสียง (Audio Player)
3. กด "Process Selected File"
4. ดูการประมวลผล Real-time บนหน้าจอ

---

## 📊 Features ของ Web UI

### ฝั่งซ้าย (Controls)
```
┌─────────────────────────┐
│ 📊 Status Indicator     │ ← ✅ Ready, ⏳ Processing, etc.
│ 📊 Progress Bar (%)     │ ← 0% → 100%
│ 📁 File Selector        │ ← เลือกไฟล์
│ 🎵 Audio Preview        │ ← ฟังตัวอย่าง
│ ▶ Process Button        │ ← เริ่มประมวลผล
└─────────────────────────┘
```

### ฝั่งขวา (Logs & Results)
```
┌──────────────────────┐
│ 📋 Live Activity Log  │ ← [TIME] MESSAGE
│                      │
│ [INFO] Starting...   │
│ [WARN] Model 1...    │
│ [SUCCESS] Done!      │
├──────────────────────┤
│ 🤖 Model Results     │ ← Model 1: 91%
│                      │ ← Model 2: 88%
│ ✨ AI Selected       │ ← Model 1 ✓
├──────────────────────┤
│ 📄 Transcript        │ ← Preview of result
│ Preview              │
└──────────────────────┘
```

---

## 🎯 Status Indicators

### Processing Status
- 🟡 **Ready** (Idle)
- 🟠 **Processing** (คำปัญหาจำเป็น)
- 🟢 **Completed** (เสร็จ)
- 🔴 **Error** (ผิดพลาด)

### Log Colors
- 🔵 **INFO** - ข้อมูลทั่วไป
- 🟠 **WARNING** - คำเตือน
- 🔴 **ERROR** - ข้อผิดพลาด
- 🟢 **SUCCESS** - สำเร็จ

---

## 📡 Real-time Updates

ระบบใช้ Server-Sent Events (SSE) สำหรับ live updates:

1. **Status Stream** - อัปเดต Progress, Status, Model Results
2. **Log Stream** - Live log entries ขณะที่ประมวลผล
3. **Auto-reconnect** - เชื่อมต่อใหม่อัตโนมัติถ้าหลุด

---

## 🛠️ API Endpoints

ถ้าต้องการเชื่อมต่อกับระบบอื่น:

```javascript
// Status
GET /api/status

// Files
GET /api/files

// Audio Preview
GET /api/audio-preview/<filename>

// Process
POST /api/process
{ "filename": "audio.mp3" }

// Real-time Events
GET /api/events

// Output
GET /api/output/<path>
```

---

## ⚙️ Configuration

### Default Port
- 5000 (http://localhost:5000)

### Custom Port
```bash
python ui.py --port 8000
```

### Debug Mode
```bash
python ui.py --debug
```

---

## 📂 Project Structure

```
STTfinalsammary/
├── web_ui_server.py      ← Flask API server
├── ui.py                 ← Launcher
├── templates/
│   └── index.html        ← Web UI page
├── static/
│   ├── style.css         ← Styling
│   └── app.js            ← Frontend logic
├── WEB_UI_README.md      ← Full documentation
```

---

## ✨ System Status

```
✅ Model 1: Azure Speech Services
✅ Model 2: External Whisper API (Docker)
✅ Model 3: MAI Transcribe API
✅ 🤖 AI Comparison: Azure OpenAI
❌ Summarization: OpenAI (Optional)
```

---

## 🎬 Ready to Process

ระบบเตรียมพร้อมแล้ว! 

### ก้าว 1: ใส่ไฟล์เสียง
```
input/audio_files/test.mp3
```

### ก้าว 2: เริ่มต้น Web UI
```bash
python run.py web
# หรือ
python ui.py
```

### ก้าว 3: ดูการประมวลผล
```
http://localhost:5000
```

---

## 🚀 ทำงาน Parallel

สามารถรัน CLI และ Web UI พร้อมกัน:

```bash
# Terminal 1: CLI Mode (Auto Process)
python run.py watch

# Terminal 2: Web UI (Preview)
python run.py web
```

---

## 📋 Next Steps

1. เตรียมไฟล์เสียง (MP3, WAV, M4A, FLAC, OGG, WEBM)
2. ใส่ไฟล์ใน `input/audio_files/`
3. รัน Web UI: `python run.py web`
4. เปิด http://localhost:5000
5. เลือกไฟล์แล้วกด Process
6. ดูการประมวลผล Real-time!

🎉 **ระบบพร้อมใช้แล้ว!**
