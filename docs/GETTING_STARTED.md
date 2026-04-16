# 🚀 STT Final Summary - Getting Started

**สถานะ**: ✅ **READY TO USE**  
**เวอร์ชั่น**: 1.1  

---

## ⚡ 4 ขั้นตอนเริ่มต้น (5 นาที)

### 1️⃣ ติดตั้ง Dependencies
```bash
cd c:\Users\wave\Documents\STTfinalsammary
pip install -r docs/requirements.txt
```

### 2️⃣ ตั้งค่า API Keys
```bash
# Copy template
copy .env.example .env

# Edit with your API keys (notepad .env)
STT_MODEL1_KEY=your-google-key
STT_MODEL2_KEY=your-azure-key
STT_MODEL3_KEY=your-openai-key
OPENAI_API_KEY=your-openai-key
```

**ได้ API keys จาก:**
- 🔵 Google: https://cloud.google.com/speech-to-text/docs
- 🟦 Azure: https://portal.azure.com
- 🟠 OpenAI: https://platform.openai.com/api-keys

### 3️⃣ วางไฟล์เสียง
```bash
input/audio_files/your_audio.mp3
```

**รองรับ format:** .mp3, .wav, .m4a, .flac, .ogg, .webm

### 4️⃣ รันโปรแกรม
```bash
# Option A: Watch mode (auto-process new files)
python scripts/auto_processor.py --watch

# Option B: Process single file
python scripts/workflow_orchestrator.py input/audio_files/your_audio.mp3

# Option C: Process once and exit
python scripts/auto_processor.py --once
```

---

## 📁 Output

ผลลัพธ์จะเก็บใน:
```
output/
├── stt_final/      ← Transcripts (.md)
├── summaries/      ← AI Summaries
├── reports/        ← Processing reports
└── archive/        ← Processed files
```

---

## ✨ Features

✅ **Multi-Model STT**: Google + Azure + OpenAI  
✅ **Smart Merging**: ฉันธรรมการเลือกคำที่ดีที่สุด  
✅ **AI Summarization**: สรุปอัตโนมัติด้วย OpenAI  
✅ **Audio Processing**: ลบเสียงรบกวน + ปกติระดับเสียง  
✅ **Auto Watch**: ดูแลโฟลเดอร์อัตโนมัติ  

---

## 🆘 ปัญหาทั่วไป

| ปัญหา | แก้ไข |
|------|------|
| API key error | ตัวสอบ `.env` มี keys ทั้งหมด |
| Module not found | รัน `pip install -r docs/requirements.txt` |
| Audio format error | ใช้ .mp3, .wav, .m4a, .flac, .ogg, .webm |
| Connection error | ตรวจสอบ internet + API key validity |

---

## 📚 เอกสาร

- **เริ่มต้นด่วน**: [`GETTING_STARTED.md`](GETTING_STARTED.md) ← You are here
- **เทคนิค & แก้ไข**: [`TECHNICAL_GUIDE.md`](TECHNICAL_GUIDE.md)
- **วิธีใช้งาน**: [`docs/HOW_TO_USE.md`](docs/HOW_TO_USE.md)
- **ระบบ**: [`docs/SYSTEM_OVERVIEW.md`](docs/SYSTEM_OVERVIEW.md)

---

## ✅ Checklist

- [ ] Python 3.8+
- [ ] Dependencies installed
- [ ] `.env` file with API keys
- [ ] Audio file in `input/audio_files/`
- [ ] Run first test
- [ ] Check `output/` folder

---

**Ready to go!** 🎉
