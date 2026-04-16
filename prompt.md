# System Design Prompt — COWORK AudioAI

## ภาพรวมระบบ

```
ชื่อระบบ : COWORK AudioAI — Enterprise Audio Intelligence
วัตถุประสงค์ : แปลงไฟล์เสียงประชุม/บทสนทนาเป็น transcript ภาษาไทย
               พร้อม AI วิเคราะห์ สรุป และระบุผู้พูดแบบ Diarization
Platform : Cloudflare Pages (Static + Pages Functions / Edge Workers)
URL      : https://summary-to-team.pages.dev
```

---

## สถาปัตยกรรมระบบ

```
Browser (Client)
│
├── index.html              → Single Page App, 3-column layout (Tailwind CSS)
├── static/css/app.css      → Custom styles + @media print
│
├── static/js/
│   ├── config.js           → Constants, proxy paths (ไม่มี API key ใดๆ)
│   ├── audio.js            → STT engines (Azure Speech SDK + MAI REST)
│   ├── ai.js               → AI correction + summary (Azure OpenAI)
│   ├── ui.js               → Rendering, export (PDF/Word/TXT), edit mode
│   ├── history.js          → IndexedDB CRUD (transcript history)
│   └── app.js              → State machine, events, orchestration
│
└── functions/api/          → Cloudflare Pages Functions (Edge Workers)
    ├── azure-token.js      → GET  /api/azure-token → { token, region }
    ├── mai.js              → POST /api/mai          → MAI STT proxy
    └── oai.js              → POST /api/oai          → Azure OpenAI proxy
```

**Security Model:** API keys อยู่ใน Cloudflare Secrets เท่านั้น
Browser ไม่เคยเห็น key ใดๆ — ทุก request ผ่าน Edge Worker

---

## Flow การทำงาน

```
1. User เลือกไฟล์เสียง (MP3 / WAV / M4A / FLAC)
   └─→ WaveSurfer.js แสดง waveform

2. User เลือกโมเดล → กด "ประมวลผล"
   ├─ Azure Speech SDK  → fetchAzureToken() → GET /api/azure-token
   │                      → streaming recognition → th-TH
   └─ MAI Transcribe   → FormData → POST /api/mai
                          → JSON diarization → [ผู้พูด X] blocks

3. แสดง transcript ดิบ (Azure + MAI columns)
   └─ User เลือก Final transcript

4. AI Processing (parallel)
   ├─ runAISpeakerCorrection() → POST /api/oai → แก้คำผิด / ใส่ label ผู้พูด
   └─ runAISummary()           → POST /api/oai → สรุปหัวข้อ + Action Items

5. แสดงผลใน Right Panel (3 tabs)
   ├─ Tab: Final Transcript  (editable inline)
   ├─ Tab: AI Summary        (markdown rendered)
   └─ Tab: History           (IndexedDB — โหลดซ้ำได้)
   └─ Auto-save ลง IndexedDB หลังประมวลผล

6. Export
   ├─ PDF  → print-friendly new window → window.print()
   ├─ Word → Word-compatible HTML blob → .doc
   └─ TXT  → plain text download
```

---

## UI Layout

```
┌─ Navbar ─────────────────────────────────────────────────────┐
│  [⚙] COWORK AudioAI  {ชื่อไฟล์}                    [user]  │
├─ LEFT (256px) ──┬─── CENTER (flex-1) ────┬── RIGHT (400px) ──┤
│ Drop zone       │ Waveform + Play/Pause  │ [Final][Summary]  │
│ Upload button   │ ─────────────────────  │ [History]         │
│ Model select    │ Azure  │  MAI          │                   │
│ Run button      │ col    │  col          │ transcript text   │
│ Progress steps  │        │               │ (editable)        │
│ ─────────────── │        │               │ ────────────────  │
│ Call stats      │        │               │ [✏ Edit][Export▼] │
└─────────────────┴────────────────────────┴───────────────────┘
```

---

## ไฟล์หลักและ Dependencies

| ไฟล์ | บทบาท | ขึ้นอยู่กับ |
|------|--------|-------------|
| `config.js` | Constants, proxy URLs | — |
| `audio.js` | STT: Azure SDK + MAI REST | config.js |
| `ai.js` | OpenAI correction + summary | config.js |
| `ui.js` | Render, export, edit toggle | — |
| `history.js` | IndexedDB CRUD | — |
| `app.js` | State, events, orchestration | config, audio, ai, ui, history |
| `azure-token.js` | Edge: ออก Azure token (10 นาที) | env.AZURE_KEY, AZURE_REGION |
| `mai.js` | Edge: MAI STT proxy | env.MAI_KEY, MAI_ENDPOINT |
| `oai.js` | Edge: Azure OpenAI proxy | env.OAI_KEY, OAI_ENDPOINT, OAI_DEPLOY |

---

## Cloudflare Secrets (7 ตัว)

```
AZURE_KEY     = Azure Speech subscription key
AZURE_REGION  = southeastasia
MAI_KEY       = MAI Speech subscription key
MAI_ENDPOINT  = https://mai-speech.cognitiveservices.azure.com/
OAI_KEY       = Azure OpenAI API key
OAI_ENDPOINT  = https://titiphon-resource.cognitiveservices.azure.com/
OAI_DEPLOY    = gpt-4o-mini-2
```

Set ด้วย:
```powershell
$secrets = @{ AZURE_KEY='...'; ... } | ConvertTo-Json | Out-File secrets_tmp.json -Encoding utf8
npx wrangler pages secret bulk secrets_tmp.json --project-name summary-to-team
npx wrangler pages secret bulk secrets_tmp.json --project-name summary-to-team --env preview
Remove-Item secrets_tmp.json
```

---

## AI Prompts

### Speaker Correction — ไม่มี label
```
จัดรูปแบบ transcript ภาษาไทยโดยแยกผู้พูด
กฎบังคับ:
1. ทุกบรรทัดขึ้นต้นด้วย [ผู้พูด 1]: หรือ [ผู้พูด 2]: เสมอ
2. ขึ้นบรรทัดใหม่เมื่อเปลี่ยนคนพูด
3. ดูจากลักษณะคำพูด: คนถามคำถาม vs คนตอบคำถาม
4. แก้คำผิด
5. ห้ามเพิ่มคำอธิบาย ตอบแค่ transcript
```

### Speaker Correction — มี label แล้ว
```
แก้คำผิดใน transcript ภาษาไทย คง [ผู้พูด X] ไว้ตามเดิม
แก้เฉพาะคำผิด ตอบแค่ transcript
```

### AI Summary
```
สรุปบทสนทนาในรูปแบบ:
## 👥 บทบาทผู้พูด
- ผู้พูด X: ...
## 📌 หัวข้อสำคัญ
- ...
## ✅ Action Items
- [ ] ...
```

---

## IndexedDB Schema

```
DB:    cowork_audioai  (version 1)
Store: transcripts     (keyPath: id autoIncrement)

Record: {
  id         : number       // auto
  fileName   : string       // "meeting_01.wav"
  date       : ISO string   // "2026-04-15T09:00:00.000Z"
  duration   : string       // "3:45"
  speakers   : number       // 2
  transcript : string       // final text
  summary    : string       // HTML rendered summary
}
```

---

## Deploy Command (ทุกครั้งที่แก้ไข)

```powershell
cd "c:\Users\wave\Documents\STTfinalsammary"

$tmp = "web_deploy_tmp"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory $tmp | Out-Null

# Copy web files (ไม่รวม uploads/)
Get-ChildItem web | Where-Object { $_.Name -ne "uploads" } | ForEach-Object {
    Copy-Item $_.FullName "$tmp\$($_.Name)" -Recurse
}

# Copy functions ไปที่ root ของ deploy dir
Copy-Item "functions" "$tmp\functions" -Recurse

npx wrangler pages deploy $tmp --project-name summary-to-team --commit-dirty=true
```

> **หมายเหตุ:** `functions/` ต้องอยู่ใน root ของ deploy directory (ข้างๆ `index.html`)
> เพื่อให้ Cloudflare Pages ตรวจพบและ compile เป็น Edge Workers อัตโนมัติ

---

## Cloudflare Access (Authentication) — ต้องทำผ่าน Dashboard

```
dash.cloudflare.com
 → Zero Trust
   → Access
     → Applications
       → Add Application
         → Self-hosted
           → Domain: summary-to-team.pages.dev
           → Policy: ใส่ email หรือ domain ที่อนุญาต
```

---

## สถานะปัจจุบัน

| Feature | Status |
|---------|--------|
| File structure refactor (HTML 1181→320 บรรทัด) | ✅ |
| Cloudflare Pages Functions (3 proxy) | ✅ |
| API keys removed from browser | ✅ |
| Export PDF / Word / TXT | ✅ |
| Editable transcript | ✅ |
| IndexedDB history (full CRUD) | ✅ |
| Auto-save after processing | ✅ |
| Cloudflare Secrets set (7 keys) | ✅ |
| Deploy with functions | 🔄 ต้องรัน deploy command ด้านบน |
| Cloudflare Access (login/auth) | ❌ ต้องทำผ่าน Dashboard |
