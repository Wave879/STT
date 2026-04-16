# 🧪 Mock Mode Guide - Sandbox Testing

## 📋 Problem Statement

System requires network connectivity to 3 external STT services:
- 🔵 **Azure Speech** - Cloud-based API
- 🟢 **Whisper** - Local network at 192.168.10.19:8100
- 🟡 **MAI Speech** - Cloud-based API

**Sandbox Environment:** Cannot access external networks, making real API calls impossible.

---

## ✅ Solution: Mock Mode

Mock Mode provides **simulated STT responses** that mimic real API behavior without requiring actual network connections.

### Key Features

| Feature | Real Mode | Mock Mode |
|---------|-----------|-----------|
| Network Required | ✅ Yes | ❌ No |
| Testing Capability | ✅ Full | ✅ Full |
| Accuracy | ✅ 88-93% | ⚠️ Simulated |
| Speed | Realtime | Instant (<2s) |
| Dependencies | 3 APIs | None |

---

## 🚀 Quick Start - 3 Steps

### Step 1: Enable Mock Mode

```bash
python scripts/setup_mock_mode.py --enable
```

Output:
```
✅ MOCK MODE ENABLED
   • Using simulated STT responses
   • Model 1 (Azure): 91% confidence
   • Model 2 (Whisper): 88% confidence
   • Model 3 (MAI): 93% confidence
```

### Step 2: Place Audio File

```bash
# Copy test audio or video to input folder
cp your_audio.mp3 input/audio_files/
```

Supported formats:
- Audio: `.mp3`, `.wav`, `.m4a`, `.flac`, `.ogg`, `.webm`
- Video: `.mp4`, `.avi`, `.mov`, `.mkv`, `.flv`, `.wmv`

### Step 3: Run Processing

```bash
# Process single file
python run.py process input/audio_files/your_audio.mp3

# Or watch mode
python run.py watch
```

---

## 📊 What Mock Mode Simulates

### Mock Responses

Each model returns realistic-looking transcription:

```
Model 1 (Azure):
"สวัสดีครับ นี่คือประเมินจาก Azure Speech Services ข้อความตัวอย่างสำหรับการทดสอบระบบทำงาน"
Confidence: 0.91 (91%)

Model 2 (Whisper):
"สวัสดี นี่เป็นผลลัพธ์จาก Docker Whisper API เวอร์ชั่นทดสอบสำหรับระบบ"
Confidence: 0.88 (88%)

Model 3 (MAI):
"สวัสดีครับผม นี่คือการทดสอบจาก MAI Transcribe API ผลลัพธ์ที่ประมวลผลแล้ว"
Confidence: 0.93 (93%)
```

### Processing Simulation

Each model simulates:
- ⏳ **Processing time**: 0.8-1.2 seconds per model
- 💯 **Confidence scores**: Realistic confidence levels
- 🎭 **Provider simulation**: Returns provider name

---

## 🔄 Complete Workflow in Mock Mode

```
Input Audio File
        ↓
[Step 1] File Validation ✓
        ↓
[Step 2] Audio Preprocessing ✓
        ↓
[Step 3] Multi-Model Transcription (Mock)
        ├─ Azure Mock: 91% confidence
        ├─ Whisper Mock: 88% confidence
        └─ MAI Mock: 93% confidence
        ↓
[Step 4] Transcript Merging (AI Comparison)
        └─ Selects best transcript
        ↓
[Step 5] Smart Summarization ✓
        ↓
Output Files
├─ Transcript
├─ Summary
└─ Report
```

---

## ⚙️ Configure Mock Responses

Edit `.env` file to customize mock responses:

```env
# Mock Mode
MOCK_MODE=true

# Custom mock responses
MOCK_AZURE_RESPONSE=Your custom Azure mock text
MOCK_WHISPER_RESPONSE=Your custom Whisper mock text
MOCK_MAI_RESPONSE=Your custom MAI mock text
```

---

## 🔌 Switching Between Modes

### Check Current Status

```bash
python scripts/setup_mock_mode.py --status
```

Output:
```
📊 STT System Status
🧪 MOCK MODE: ✅ ENABLED
   Using simulated API responses for testing
```

### Disable Mock Mode (Use Real APIs)

```bash
python scripts/setup_mock_mode.py --disable
```

---

## 📈 Testing Checklist

Mock mode allows you to verify all system components:

- ✅ **Input Processing**: File validation, format checking
- ✅ **Audio Preprocessing**: Noise reduction, normalization
- ✅ **Multi-Model Pipeline**: Parallel processing
- ✅ **Transcript Merging**: AI comparison logic
- ✅ **Summarization**: Summary generation
- ✅ **Output Generation**: File creation
- ✅ **Web UI**: Dashboard and monitoring
- ✅ **Logging**: Error handling and logs

---

## 🚨 Troubleshooting

### Mock mode not enabled?

1. Check `.env` file:
   ```bash
   grep MOCK_MODE .env
   ```

2. Should show: `MOCK_MODE=true`

3. If not set, run:
   ```bash
   python scripts/setup_mock_mode.py --enable
   ```

### Mock responses not changing?

Edit `.env` and modify mock response variables directly.

### Performance too slow?

Mock mode automatically simulates realistic delays (0.8-1.2s). This is intentional to simulate real API latency.

---

## 🎯 Migration to Real APIs

When ready to use real APIs:

1. **Disable mock mode:**
   ```bash
   python scripts/setup_mock_mode.py --disable
   ```

2. **Verify credentials in `.env`:**
   - ✅ AZURE_SPEECH_KEY
   - ✅ EXTERNAL_WHISPER_ENDPOINT
   - ✅ MAI_SPEECH_KEY
   - ✅ AZURE_OPENAI_KEY

3. **Test with single file:**
   ```bash
   python run.py process input/audio_files/test.mp3
   ```

4. **Monitor logs for errors:**
   ```bash
   tail -f processing/logs/
   ```

---

## 📚 Example Session

```bash
# 1. Enable mock mode
$ python scripts/setup_mock_mode.py --enable
✅ MOCK MODE ENABLED

# 2. Place test file
$ cp my_meeting.mp3 input/audio_files/

# 3. Check status
$ python run.py status
   ✅ Model 1: Azure Speech Services: ✅
   ✅ Model 2: External Whisper API: ✅
   ✅ Model 3: MAI Transcribe API: ✅

# 4. Process file
$ python run.py process input/audio_files/my_meeting.mp3
[✓] Step 1: Input validation
[✓] Step 2: Audio preprocessing
[✓] Step 3: Multi-Model STT (Mock)
[✓] Step 4: Transcript merging
[✓] Step 5: Smart summarization
✅ Complete!

# 5. Check output
$ ls -la output/stt_final/
my_meeting_transcript.md

$ cat output/summaries/
my_meeting_summary.md
```

---

## 🔐 Security Notes

- **Mock mode is for testing only** - Not suitable for production
- Mock responses are simulated and not real transcriptions
- Always verify with real APIs before production deployment
- Mock mode does not interact with external services

---

## 📞 Support

If you encounter issues:

1. **Check current mode:**
   ```bash
   python scripts/setup_mock_mode.py --status
   ```

2. **Enable logs:**
   ```bash
   export LOG_LEVEL=DEBUG
   python run.py process input/audio_files/test.mp3
   ```

3. **Review logs:**
   ```bash
   cat processing/logs/
   ```

---

## 🎓 Next Steps

After testing in mock mode:

1. ✅ Verify system structure works
2. ✅ Test output file generation
3. ✅ Validate workflow pipeline
4. ✅ Configure real API credentials
5. ✅ Disable mock mode
6. ✅ Test with real APIs
7. ✅ Deploy to production

---

**Status:** Mock mode fully integrated ✅  
**Use case:** Sandbox testing, development, CI/CD pipelines  
**Limitation:** Simulated responses only, not real transcriptions
