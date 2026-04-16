#!/usr/bin/env python3
"""
Directory structure overview
"""

import os
from pathlib import Path

ROOT = Path(__file__).parent

structure = """
🎯 STT FINAL SUMMARY - ORGANIZED PROJECT STRUCTURE
════════════════════════════════════════════════════════════════

STTfinalsammary/
├── 🔵 ROOT (Main Command)
│   └── run.py                      ← MAIN ENTRY POINT (don't move)
│
├── 📚 DOCUMENTATION
│   └── docs/
│       ├── README.md               ← Project overview
│       ├── INDEX.md                ← Documentation index
│       ├── GETTING_STARTED.md      ← Quick start (5 min)
│       ├── SETUP.md                ← Installation guide
│       ├── TECHNICAL_GUIDE.md      ← Advanced config
│       ├── CODE_REVIEW.md          ← Code analysis
│       ├── READY.md                ← System status
│       ├── WEB_UI_README.md        ← Web UI guide
│       └── WEB_UI_READY.md         ← Web UI features
│
├── ⚙️ CONFIGURATION
│   ├── .env                        ← API Keys (secret)
│   ├── .env.example                ← Template
│   ├── .gitignore                  ← Git ignore rules
│   └── config/
│       ├── stt_models_config.json  ← STT models setup
│       ├── project_config.json     ← Project config
│       └── keywords_mapping.json   ← Domain keywords
│
├── 🔧 SCRIPTS (Core Logic)
│   └── scripts/
│       ├── stt_processor.py        ← Main processor
│       ├── stt_apis.py             ← STT integrations
│       ├── transcript_merger.py    ← AI comparison
│       ├── smart_summarizer.py     ← Summarization
│       ├── workflow_orchestrator.py ← 5-step pipeline
│       ├── auto_processor.py       ← Watch mode
│       ├── transcript_merger.py    ← Result merging
│       └── audio_preprocessor.py   ← Audio prep
│
├── 🌐 WEB UI (Real-time Preview)
│   └── web/
│       ├── ui.py                   ← Launcher
│       ├── web_ui_server.py        ← Flask server
│       ├── README.md               ← Web UI docs
│       ├── templates/
│       │   └── index.html          ← Main page
│       └── static/
│           ├── app.js              ← Frontend logic
│           └── style.css           ← Styling
│
├── 📂 INPUT (Audio Files)
│   └── input/
│       └── audio_files/            ← Place .mp3, .wav here
│
├── 📊 OUTPUT (Results)
│   └── output/
│       ├── stt_final/              ← Transcripts
│       ├── summaries/              ← AI summaries
│       ├── reports/                ← JSON reports
│       └── archive/                ← Processed files
│
└── 📋 PROCESSING (Logs & Temp)
    └── processing/
        ├── logs/                   ← Processing logs
        ├── temp_transcripts/       ← Temp files
        └── analysis_results/       ← Analysis data

════════════════════════════════════════════════════════════════

📋 QUICK COMMANDS
════════════════════════════════════════════════════════════════

python run.py status       # Show system status
python run.py help         # Show all commands
python run.py process FILE # Process single file
python run.py watch        # Auto-process mode
python run.py batch        # Batch process
python run.py web          # Start Web UI

════════════════════════════════════════════════════════════════

✅ STATUS
════════════════════════════════════════════════════════════════

✓ Documentation organized in docs/
✓ Web UI components organized in web/
✓ Config files in config/
✓ Scripts in scripts/
✓ run.py remains at root (primary entry point)
✓ All imports updated ✓

════════════════════════════════════════════════════════════════
"""

print(structure)

# Show actual directory contents
print("\n🔍 ACTUAL DIRECTORY CONTENTS\n")

for item in sorted(ROOT.iterdir()):
    if item.name.startswith('_') or item.name.startswith('.'):
        continue
    
    if item.is_dir():
        print(f"📂 {item.name}/")
        try:
            for sub in sorted(item.iterdir())[:3]:
                print(f"   ├─ {sub.name}")
            count = len(list(item.iterdir()))
            if count > 3:
                print(f"   └─ ... and {count-3} more items")
        except:
            pass
    else:
        print(f"📄 {item.name}")

print("\n✅ Project reorganization complete!")
