# STT Final Summary - Web UI Preview

Real-time visual interface for monitoring STT processing with audio preview, progress tracking, status updates, and live logs.

## Features

### 🎵 Audio Preview
- Listen to audio files before processing
- File browser with size information
- Direct waveform visualization

### 📊 Real-time Status
- Processing status indicator (idle, processing, completed, error)
- Live progress bar with percentage
- Time elapsed tracking
- Current file information

### 📋 Live Activity Log
- Real-time log streaming from processing
- Color-coded messages (info, warning, error, success)
- Timestamps for each log entry
- Scrollable log viewer with search capability

### 🤖 Model Results
- Individual model confidence scores
- AI comparison result display
- Selected model highlighting
- Status indicators for each model

### 📄 Transcript Preview
- Live transcript preview
- Full output access after completion
- Summary display

## Quick Start

### 1. Install Dependencies
```bash
pip install flask flask-cors
```

### 2. Start Web UI Server
```bash
# Default: http://localhost:5000
python ui.py

# Custom port
python ui.py --port 8000

# Debug mode
python ui.py --debug
```

### 3. Open Browser
Navigate to `http://localhost:5000`

## Usage

### Processing Audio Files

1. **Select File**: Click on an audio file in the left panel
2. **Preview Audio**: Use the audio player to listen
3. **Start Processing**: Click "Process Selected File" button
4. **Monitor Progress**: Watch real-time updates
   - Status indicator changes
   - Progress bar fills
   - Log entries appear
   - Model results update
5. **View Results**: 
   - Check transcript preview
   - See selected model
   - Review processing details

## API Endpoints

The Web UI server provides REST API endpoints for programmatic access:

### Status & Control
- `GET /api/status` - Current processing status
- `GET /api/health` - Server health check
- `POST /api/process` - Start processing an audio file

### Data
- `GET /api/files` - List available audio files
- `GET /api/audio-preview/<filename>` - Stream audio file
- `GET /api/output/<path>` - Get processed output

### Real-time Updates
- `GET /api/events` - Server-Sent Events stream for real-time updates

## UI Layout

### Left Panel (Controls & Input)
```
┌─────────────────────┐
│ Status Indicator    │
├─────────────────────┤
│ Progress Bar        │
├─────────────────────┤
│ File Selection      │
├─────────────────────┤
│ Audio Preview       │
├─────────────────────┤
│ Process Button      │
└─────────────────────┘
```

### Right Panel (Logs & Results)
```
┌─────────────────────┐
│ Live Activity Log    │
│ (scrollable)        │
├─────────────────────┤
│ Model Results       │
│ AI Selection        │
├─────────────────────┤
│ Transcript Preview  │
│ (scrollable)        │
└─────────────────────┘
```

## Status Indicators

### Processing Status
- 🟡 **Idle**: Ready to process
- 🟠 **Processing**: Currently processing audio
- 🟢 **Completed**: Processing finished successfully
- 🔴 **Error**: Error occurred during processing

### Log Levels
- **INFO**: General information (blue)
- **WARNING**: Warnings (orange)
- **ERROR**: Errors (red)
- **SUCCESS**: Successful operations (green)
- **SYSTEM**: System messages (gray)

## Real-time Updates

The UI uses Server-Sent Events (SSE) for real-time updates:

1. **Status Updates**: Progress, current file, status changes
2. **Log Streaming**: Live log entries as they're generated
3. **Model Results**: Results update as models complete
4. **Auto-reconnect**: Automatically reconnects if connection is lost

## Configuration

Web UI can be customized by modifying:

- `templates/index.html` - HTML structure
- `static/style.css` - Styling and layout
- `static/app.js` - Client-side functionality
- `web_ui_server.py` - Backend API server

## Troubleshooting

### Port Already in Use
```bash
python ui.py --port 8000
```

### Missing Dependencies
```bash
pip install flask flask-cors
```

### Connection Issues
- Check if server is running
- Try refreshing the page
- Clear browser cache

### Audio Preview Not Working
- Verify audio file format is supported (MP3, WAV, etc.)
- Check file permissions
- Try different browser

## Performance

- Lightweight web interface
- Efficient real-time streaming
- Responsive design for all screen sizes
- Auto-scaling layout for different resolutions

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (responsive design)

## Security Notes

- Default configuration allows access from all hosts
- For production, restrict host to localhost: `python ui.py --host 127.0.0.1`
- Sensitive credentials stored in `.env` file only

## Support

For issues or questions:
1. Check logs for error messages
2. Verify all dependencies are installed
3. Review configuration files
4. Check browser console for JavaScript errors
