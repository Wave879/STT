#!/usr/bin/env python3
"""
STT Final Summary - Simple CLI Interface
Easy command to integrate with Claude/Coworker

Usage:
    python run.py process <audio_file>      - Process single file
    python run.py watch                     - Watch mode (auto process)
    python run.py status                    - Show status
    python run.py batch <folder>            - Process folder
    python run.py help                      - Show help
"""

import sys
import os
import argparse
import json
from pathlib import Path
from datetime import datetime

# Load environment variables from .env
from dotenv import load_dotenv
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent / 'scripts'))

try:
    from auto_processor import AutoProcessor
    from workflow_orchestrator import WorkflowOrchestrator
except ImportError as e:
    print(f"❌ Error: {e}")
    print("Make sure you're in the project directory")
    sys.exit(1)


class STTController:
    """Simple interface for STT processing"""
    
    def __init__(self):
        self.project_dir = Path.cwd()
        self.input_dir = self.project_dir / "input" / "audio_files"
        self.output_dir = self.project_dir / "output"
    
    def process_single(self, audio_file: str):
        """Process single audio file"""
        print(f"\n📄 Processing: {audio_file}")
        
        try:
            orchestrator = WorkflowOrchestrator(str(self.project_dir))
            success, results = orchestrator.process_single_file(audio_file)
            
            if success:
                print(f"\n✅ Success!")
                print(f"📝 Transcript: {results.get('final_transcript')}")
                print(f"📋 Summary: {results.get('final_summary')}")
                return 0
            else:
                print(f"\n❌ Failed: {results}")
                return 1
                
        except Exception as e:
            print(f"❌ Error: {e}")
            return 1
    
    def watch_mode(self):
        """Watch folder and auto-process"""
        print(f"\n🔍 Watching: {self.input_dir}")
        print("Press Ctrl+C to stop\n")
        
        try:
            processor = AutoProcessor(str(self.project_dir))
            processor.watch_and_process(check_interval=10)
            return 0
        except KeyboardInterrupt:
            print("\n⏹️  Stopped")
            return 0
        except Exception as e:
            print(f"❌ Error: {e}")
            return 1
    
    def process_batch(self, folder: str = None):
        """Process all files in folder"""
        if folder is None:
            folder = str(self.input_dir)
        
        print(f"\n📦 Batch Processing: {folder}")
        
        try:
            processor = AutoProcessor(str(self.project_dir))
            processor.process_batch()
            return 0
        except Exception as e:
            print(f"❌ Error: {e}")
            return 1
    
    def show_status(self):
        """Show current status"""
        print("\n" + "="*70)
        print("📊 STT FINAL SUMMARY - STATUS")
        print("="*70)
        
        # Check directories
        print(f"\n📁 Project Directory: {self.project_dir}")
        print(f"   Input Folder: {self.input_dir}")
        print(f"   Output Folder: {self.output_dir}")
        
        # Check input files
        if self.input_dir.exists():
            audio_files = list(self.input_dir.glob('*'))
            audio_files = [f for f in audio_files if f.suffix.lower() in 
                          {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'}]
            print(f"\n🎵 Audio Files Ready: {len(audio_files)}")
            for f in audio_files[:5]:
                size_mb = f.stat().st_size / (1024*1024)
                print(f"   - {f.name} ({size_mb:.1f} MB)")
            if len(audio_files) > 5:
                print(f"   ... and {len(audio_files)-5} more")
        else:
            print(f"\n🎵 Audio Files: 0 (folder not found)")
        
        # Check output files
        if self.output_dir.exists():
            transcripts = list((self.output_dir / "stt_final").glob("*.md")) if (self.output_dir / "stt_final").exists() else []
            summaries = list((self.output_dir / "summaries").glob("*.md")) if (self.output_dir / "summaries").exists() else []
            print(f"\n📝 Transcripts: {len(transcripts)}")
            for f in transcripts[:3]:
                print(f"   - {f.name}")
            print(f"📋 Summaries: {len(summaries)}")
            for f in summaries[:3]:
                print(f"   - {f.name}")
        
        # Check environment
        print(f"\n🔐 Environment Variables:")
        keys_to_check = [
            ('AZURE_SPEECH_KEY', 'Model 1: Azure Speech Services'),
            ('EXTERNAL_WHISPER_ENDPOINT', 'Model 2: External Whisper API'),
            ('MAI_SPEECH_KEY', 'Model 3: MAI Transcribe API'),
            ('AZURE_OPENAI_KEY', '🤖 AI Comparison: Azure OpenAI'),
            ('AZURE_OPENAI_KEY', 'Summarization: Azure OpenAI')
        ]
        for key, service in keys_to_check:
            value = os.getenv(key, 'NOT SET')
            status = "✅" if value != 'NOT SET' else "❌"
            value_display = value[:15] + "..." if value != 'NOT SET' else value
            print(f"   {status} {service}: {value_display}")
        
        print("\n" + "="*70)
        return 0
    
    def show_help(self):
        """Show help"""
        help_text = """
╔════════════════════════════════════════════════════════════╗
║     STT FINAL SUMMARY - COMMAND LINE INTERFACE             ║
╚════════════════════════════════════════════════════════════╝

COMMANDS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Process Single File
   python run.py process input/audio_files/audio.mp3
   → Process one audio file and exit

2. Watch Mode (Auto-Process)
   python run.py watch
   → Monitor folder and process new files automatically (24/7)

3. Process Batch
   python run.py batch
   → Process all files in input folder at once

4. Show Status
   python run.py status
   → Display current status and statistics

5. Web UI Preview
   python run.py web
   → Start web interface for real-time monitoring
     - Audio preview player
     - Live progress tracking
     - Activity logs with status updates
     - Model results visualization
     - Open: http://localhost:5000

6. Show Help
   python run.py help
   → Display this help text

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

QUICK START (5 MINUTES):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Setup .env file:
   copy .env.example .env
   notepad .env  (add API keys)

2. Put audio files:
   input/audio_files/your_audio.mp3

3. Run:
   python run.py watch      (auto mode)
   OR
   python run.py process input/audio_files/your_audio.mp3

4. Check output:
   output/stt_final/        (transcripts)
   output/summaries/        (summaries)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ENVIRONMENT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Required environment variables in .env:
  - STT_MODEL1_KEY       (Google Cloud API key)
  - STT_MODEL2_KEY       (Azure Speech key)
  - STT_MODEL3_KEY       (OpenAI API key)
  - AZURE_OPENAI_KEY     (for summarization via Azure OpenAI)

Optional:
  - LOG_LEVEL=INFO
  - PROCESSING_TIMEOUT=300

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OUTPUT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output directory structure:
  output/
  ├── stt_final/    ← Full transcripts (.md)
  ├── summaries/    ← AI summaries (.md)
  ├── reports/      ← Processing reports (.json)
  └── archive/      ← Processed files

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXAMPLES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Show status before starting
python run.py status

# Process a single file
python run.py process input/audio_files/meeting.mp3

# Auto-watch mode (production)
python run.py watch

# Process all files in batch
python run.py batch

# View logs
tail -f processing/logs/auto_processor.log

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FOR PYTHON INTEGRATION (e.g., from other scripts):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

from scripts.workflow_orchestrator import WorkflowOrchestrator

orchestrator = WorkflowOrchestrator('.')
success, results = orchestrator.process_single_file('audio.mp3')

if success:
    print(f"Transcript: {results['final_transcript']}")
    print(f"Summary: {results['final_summary']}")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DOCUMENTATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- GETTING_STARTED.md    ← Start here (5 min read)
- TECHNICAL_GUIDE.md    ← Advanced configuration
- docs/HOW_TO_USE.md    ← Usage examples
- docs/SYSTEM_OVERVIEW.md ← Architecture

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
        print(help_text)
        return 0

    def start_web_ui(self):
        """Start the web UI server"""
        import subprocess
        
        print(f"\n{'='*70}")
        print("🌐 Starting STT Final Summary Web UI...")
        print(f"{'='*70}\n")
        
        try:
            import os
            # Change to web directory and run server.py
            web_dir = Path(__file__).parent / 'web'
            server_file = web_dir / 'server.py'
            
            if not server_file.exists():
                print(f"❌ Error: {server_file} not found")
                return 1
            
            subprocess.run([
                'python', str(server_file), '--host', '0.0.0.0', '--port', '8000'
            ])
            return 0
        except KeyboardInterrupt:
            print("\n✓ Web UI stopped")
            return 0
        except Exception as e:
            print(f"❌ Error starting web UI: {e}")
            print("\nTroubleshooting:")
            print("1. Ensure Flask is installed: pip install flask flask-cors")
            print("2. Check if port 5000 is available")
            print("3. Run 'python web/ui.py --help' for more options")
            return 1


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='STT Final Summary - Command Line Interface',
        add_help=False
    )
    
    parser.add_argument('command', nargs='?', default='help',
                       help='Command to run: process, watch, batch, status, help')
    parser.add_argument('file', nargs='?', default=None,
                       help='Audio file path (for process command)')
    parser.add_argument('--help', '-h', action='store_true',
                       help='Show help')
    
    args = parser.parse_args()
    
    controller = STTController()
    
    # Handle commands
    command = args.command.lower()
    
    if args.help or command in ['help', '-h', '--help']:
        return controller.show_help()
    
    elif command == 'process':
        if not args.file:
            print("❌ Error: Please specify audio file")
            print("Usage: python run.py process <audio_file>")
            return 1
        return controller.process_single(args.file)
    
    elif command == 'watch':
        return controller.watch_mode()
    
    elif command == 'batch':
        return controller.process_batch(args.file)
    
    elif command == 'status':
        return controller.show_status()
    
    elif command == 'web':
        return controller.start_web_ui()
    
    else:
        print(f"❌ Unknown command: {command}")
        print("Run 'python run.py help' for available commands")
        return 1


if __name__ == '__main__':
    sys.exit(main())
