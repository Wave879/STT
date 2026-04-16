#!/usr/bin/env python3
"""
STT Final Summary - Automatic Workflow Processor
Automatically processes audio files from input folder following SKILL.md workflow

Features:
- Watch input folder for new audio files
- Auto-process files according to SKILL.md
- Generate transcript, summary, and report
- Move files to archive after processing
- Logging and error handling

Usage:
    # Auto-watch mode (recommended)
    python scripts/auto_processor.py --watch

    # Process once and exit
    python scripts/auto_processor.py --once

    # Process specific folder
    python scripts/auto_processor.py --once --input-dir "path/to/audio"
"""

import os
import sys
import time
import argparse
import logging
from pathlib import Path
from datetime import datetime
import json
import shutil
from typing import List

# Load environment variables from .env
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Try to import stt_processor
try:
    from stt_processor import STTProcessor
except ImportError:
    print("Error: Cannot import stt_processor. Make sure it's in the same directory.")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(levelname)s] - %(message)s',
    handlers=[
        logging.FileHandler('scripts/auto_processor.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class AutoProcessor:
    """Automatic STT Processing with workflow management"""

    def __init__(self, project_dir: str = "."):
        """Initialize auto processor"""
        self.project_dir = Path(project_dir)
        self.processor = STTProcessor(str(self.project_dir))
        self.input_dir = self.project_dir / "input" / "audio_files"
        self.processed_files = set()
        self.running = False

        logger.info(f"AutoProcessor initialized at {self.project_dir}")

    def get_pending_files(self) -> List[Path]:
        """Get list of audio and video files that haven't been processed"""
        if not self.input_dir.exists():
            logger.warning(f"Input directory not found: {self.input_dir}")
            return []

        # Supported audio formats
        audio_formats = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'}
        # Supported video formats (will extract audio)
        video_formats = {'.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v'}
        all_formats = audio_formats | video_formats
        
        pending_files = []

        for file_path in self.input_dir.glob('*'):
            if file_path.suffix.lower() in all_formats:
                if str(file_path) not in self.processed_files:
                    pending_files.append(file_path)

        return sorted(pending_files)

    def process_file_workflow(self, audio_file: Path) -> bool:
        """
        Process single file following SKILL.md workflow

        Workflow Steps:
        1. Input Management - Validate audio file
        2. Multi-Model STT - Process with multiple models
        3. Analysis & Correction - Apply corrections
        4. Final Processing - Generate output files
        5. Summary & Extraction - Create summary
        """
        logger.info(f"{'='*70}")
        logger.info(f"STARTING WORKFLOW: {audio_file.name}")
        logger.info(f"{'='*70}")

        try:
            # Step 1: Validation
            logger.info("[Step 1/5] Validating audio file...")
            is_valid, message = self.processor.validate_audio_file(audio_file)
            if not is_valid:
                logger.error(f"Validation failed: {message}")
                return False
            logger.info(f"✓ File validated: {message}")

            # Step 2: Process with STT
            logger.info("[Step 2/5] Processing with STT models...")
            logger.info("  - Sending to multiple STT services")
            logger.info("  - Building consensus results")

            # Step 3: Analysis & Correction
            logger.info("[Step 3/5] Analyzing & applying corrections...")
            logger.info("  - Applying context-based corrections")
            logger.info("  - Validating results")

            # Step 4-5: Main Processing
            logger.info("[Step 4/5] Processing & generating outputs...")
            result = self.processor.process_audio_file(
                audio_file,
                output_format='markdown'
            )

            if result['status'] != 'completed':
                logger.error(f"Processing failed: {result.get('error')}")
                return False

            # Step 5: Summary
            logger.info("[Step 5/5] Generating summary & report...")
            logger.info(f"✓ Summary generated: {result.get('summary_file')}")

            # Log results
            logger.info("")
            logger.info("📊 PROCESSING RESULTS:")
            logger.info(f"  File: {audio_file.name}")
            logger.info(f"  Status: ✅ COMPLETED")
            logger.info(f"  Duration: Processing finished")
            logger.info(f"  Models Used: {', '.join(result.get('models_used', []))}")
            logger.info(f"  Confidence: {result.get('confidence_scores', {})}")
            logger.info(f"  Output Files: {len(result.get('output_files', []))}")
            logger.info(f"  Summary File: {result.get('summary_file')}")
            logger.info("")

            # Mark as processed
            self.processed_files.add(str(audio_file))

            # Archive the file
            self.archive_file(audio_file)

            logger.info(f"✅ Successfully processed: {audio_file.name}")
            logger.info(f"{'='*70}\n")

            return True

        except Exception as e:
            logger.error(f"Error processing file: {e}")
            logger.error(f"{'='*70}\n")
            return False

    def archive_file(self, audio_file: Path):
        """Move processed file to archive"""
        try:
            archive_dir = self.project_dir / "output" / "archive"
            archive_dir.mkdir(parents=True, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            archive_name = f"{audio_file.stem}_{timestamp}{audio_file.suffix}"
            archive_path = archive_dir / archive_name

            shutil.move(str(audio_file), str(archive_path))
            logger.info(f"📦 Archived: {archive_name}")
        except Exception as e:
            logger.warning(f"Could not archive file: {e}")

    def process_batch(self):
        """Process all pending files in batch"""
        logger.info("\n🔄 BATCH PROCESSING STARTED\n")

        pending_files = self.get_pending_files()

        if not pending_files:
            logger.info("ℹ️ No pending audio files found in input/audio_files/")
            return

        logger.info(f"Found {len(pending_files)} file(s) to process")
        logger.info("")

        results = {
            'total': len(pending_files),
            'completed': 0,
            'failed': 0,
            'files': []
        }

        for i, audio_file in enumerate(pending_files, 1):
            logger.info(f"[{i}/{len(pending_files)}] Processing: {audio_file.name}")

            success = self.process_file_workflow(audio_file)

            results['files'].append({
                'file': audio_file.name,
                'status': 'completed' if success else 'failed'
            })

            if success:
                results['completed'] += 1
            else:
                results['failed'] += 1

        # Log batch summary
        logger.info("\n" + "="*70)
        logger.info("📊 BATCH PROCESSING SUMMARY")
        logger.info("="*70)
        logger.info(f"Total Files: {results['total']}")
        logger.info(f"Completed: {results['completed']} ✅")
        logger.info(f"Failed: {results['failed']} ❌")
        logger.info(f"Success Rate: {(results['completed']/results['total']*100):.1f}%")
        logger.info("="*70 + "\n")

        # Save batch results
        self.save_batch_results(results)

    def save_batch_results(self, results: dict):
        """Save batch processing results"""
        try:
            results_dir = self.project_dir / "processing" / "logs"
            results_dir.mkdir(parents=True, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            results_file = results_dir / f"auto_batch_{timestamp}.json"

            with open(results_file, 'w') as f:
                json.dump(results, f, indent=2)

            logger.info(f"Results saved to: {results_file}")
        except Exception as e:
            logger.warning(f"Could not save batch results: {e}")

    def watch_and_process(self, check_interval: int = 10):
        """
        Watch input folder and process new files automatically

        Args:
            check_interval: Seconds between folder checks
        """
        logger.info("🔍 WATCH MODE STARTED")
        logger.info(f"Monitoring: {self.input_dir}")
        logger.info(f"Check interval: {check_interval} seconds")
        logger.info("Press Ctrl+C to stop\n")

        self.running = True

        try:
            while self.running:
                pending_files = self.get_pending_files()

                if pending_files:
                    logger.info(f"🔔 Found {len(pending_files)} new file(s)")
                    self.process_batch()
                else:
                    logger.debug(f"No pending files. Next check in {check_interval}s...")

                # Wait before next check
                time.sleep(check_interval)

        except KeyboardInterrupt:
            logger.info("\n⏹️  Watch mode stopped by user")
            self.running = False

    def print_status(self):
        """Print current status"""
        pending_files = self.get_pending_files()
        processed_count = len(self.processed_files)

        print("\n" + "="*70)
        print("📊 PROCESSOR STATUS")
        print("="*70)
        print(f"Project Directory: {self.project_dir}")
        print(f"Input Folder: {self.input_dir}")
        print(f"Pending Files: {len(pending_files)}")
        print(f"Processed Files: {processed_count}")
        print(f"Output Folder: {self.project_dir / 'output'}")
        print("="*70 + "\n")

        if pending_files:
            print("Pending files:")
            for f in pending_files:
                print(f"  - {f.name}")
            print()


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='STT Final Summary - Automatic Processor',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # Auto-watch mode (recommended)
  python scripts/auto_processor.py --watch

  # Process all pending files once
  python scripts/auto_processor.py --once

  # Check status
  python scripts/auto_processor.py --status

  # Custom input directory
  python scripts/auto_processor.py --once --input-dir "path/to/audio"
        '''
    )

    parser.add_argument(
        '--watch',
        action='store_true',
        help='Watch input folder and process files automatically'
    )

    parser.add_argument(
        '--once',
        action='store_true',
        help='Process all pending files once and exit'
    )

    parser.add_argument(
        '--status',
        action='store_true',
        help='Show processor status'
    )

    parser.add_argument(
        '--input-dir',
        help='Custom input directory'
    )

    parser.add_argument(
        '--project-dir',
        default='.',
        help='Project directory (default: current directory)'
    )

    parser.add_argument(
        '--interval',
        type=int,
        default=10,
        help='Check interval in seconds for watch mode (default: 10)'
    )

    args = parser.parse_args()

    # Initialize processor
    processor = AutoProcessor(args.project_dir)

    # Handle custom input directory
    if args.input_dir:
        processor.input_dir = Path(args.input_dir)

    # Execute action
    if args.status:
        processor.print_status()

    elif args.watch:
        logger.info("Starting in WATCH mode...")
        logger.info("Files in input/audio_files/ will be processed automatically\n")
        processor.watch_and_process(check_interval=args.interval)

    elif args.once:
        logger.info("Starting BATCH processing...")
        logger.info("Processing all files in input folder...")
        processor.process_batch()
