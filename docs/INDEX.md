# 📚 Documentation Index

All project documentation organized by topic.

## 🎯 Quick Start
→ **Read first:** [GETTING_STARTED.md](GETTING_STARTED.md) (5 minutes)

## 📖 Main Documents

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | Project overview |
| [GETTING_STARTED.md](GETTING_STARTED.md) | Quick start guide |
| [SETUP.md](SETUP.md) | Installation instructions |
| [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) | Advanced configuration |
| [CODE_REVIEW.md](CODE_REVIEW.md) | Code analysis |

## 🌐 Web UI

- [WEB_UI_README.md](WEB_UI_README.md) - Full Web UI documentation
- [WEB_UI_READY.md](WEB_UI_READY.md) - Web UI features overview

## 📋 Commands Reference

### Processing
```bash
python run.py status              # Show system status
python run.py process <file>      # Process single file
python run.py watch               # Watch mode (auto-process)
python run.py batch               # Process all files in batch
```

### Web UI
```bash
python run.py web                 # Start Web UI from CLI
python web/ui.py                  # Or run directly
# Open: http://localhost:5000
```

## 🗂️ Folder Structure

```
STTfinalsammary/
├── run.py                 # Main CLI interface (DO NOT MOVE)
├── docs/                  # All documentation ← YOU ARE HERE
│   ├── README.md
│   ├── GETTING_STARTED.md
│   ├── TECHNICAL_GUIDE.md
│   └── ...
├── config/                # Configuration files
│   ├── stt_models_config.json
│   ├── project_config.json
│   ├── keywords_mapping.json
├── scripts/               # Core processing scripts
│   ├── stt_processor.py
│   ├── stt_apis.py
│   ├── transcript_merger.py
│   └── ...
├── web/                   # Web UI components
│   ├── ui.py
│   ├── web_ui_server.py
│   ├── templates/
│   └── static/
├── input/                 # Input audio files
│   └── audio_files/
├── output/                # Processing results
│   ├── stt_final/
│   ├── summaries/
│   ├── reports/
│   └── archive/
└── processing/            # Logs and temp files
    ├── logs/
    ├── temp_transcripts/
    └── analysis_results/
```

## 🔧 Configuration

Environment variables are stored in `.env` file (not in git):

```bash
# Copy template
cp .env.example .env

# Edit with your API keys
# - AZURE_SPEECH_KEY
# - EXTERNAL_WHISPER_ENDPOINT
# - MAI_SPEECH_KEY
# - AZURE_OPENAI_KEY
```

## 🚀 Next Steps

1. **Setup**: Follow [SETUP.md](SETUP.md)
2. **Quick Start**: Read [GETTING_STARTED.md](GETTING_STARTED.md)
3. **Deploy**: Choose CLI or Web UI
4. **Monitor**: Use Web UI for real-time progress
5. **Advanced**: See [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md)

---

**Last Updated**: April 7, 2026
