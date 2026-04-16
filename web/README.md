# 🌐 Web UI Components

Real-time web interface for STT processing monitoring.

## 📁 Files

- **ui.py** - Web UI launcher (run this to start)
- **web_ui_server.py** - Flask API server
- **templates/index.html** - HTML interface
- **static/app.js** - Frontend JavaScript
- **static/style.css** - Styling

## 🚀 Quick Start

### Option 1: From CLI
```bash
cd ..  # Go to project root
python run.py web
```

### Option 2: Direct
```bash
python ui.py
```

### Open Browser
→ http://localhost:5000

## ✨ Features

- 📊 **Real-time Status** - Shows processing progress
- 🎵 **Audio Preview** - Listen before processing
- 📋 **Live Logs** - See all activity in real-time
- 🤖 **Model Results** - Individual model confidence scores
- ✨ **AI Selection** - Shows which model was chosen
- 📄 **Transcript Preview** - See results as they're generated

## 🔧 Configuration

### Custom Port
```bash
python ui.py --port 8000
```

### Debug Mode
```bash
python ui.py --debug
```

### Help
```bash
python ui.py --help
```

## 📡 API Endpoints

The Web UI provides REST API for programmatic access:

```
GET  /api/status              # Current processing status
GET  /api/files               # List audio files
GET  /api/audio-preview/<fn>  # Stream audio file
POST /api/process             # Start processing
GET  /api/events              # Real-time events (SSE)
GET  /api/output/<path>       # Get output file
GET  /api/health              # Health check
```

## 🐛 Troubleshooting

### Port 5000 in use
```bash
python ui.py --port 8000
```

### Missing dependencies
```bash
pip install flask flask-cors
```

### Audio preview not working
- Check file format (MP3, WAV, M4A, etc.)
- Verify file permissions
- Try different browser

## 📚 Documentation

See [../docs/](../docs/) for full documentation:
- `WEB_UI_README.md` - Detailed guide
- `WEB_UI_READY.md` - Features overview

## 🔗 Related

- `../run.py` - Main CLI (has `web` command)
- `../config/` - Configuration files
- `../scripts/` - Processing scripts
- `../docs/` - Documentation
