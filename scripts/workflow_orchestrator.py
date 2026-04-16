#!/usr/bin/env python3
"""
🤖 STT Final Summary - Complete Workflow Orchestrator
Orchestrates the complete 5-step pipeline for audio processing and transcription

5-Step Workflow:
1. Input Management - Validate and prepare audio files
2. Audio Preprocessing - Clean noise, normalize, enhance clarity
3. Multi-Model STT - Send to Azure STT and OpenAI Whisper
4. Transcript Merging - Compare and merge results intelligently
5. Smart Summarization - Summarize using AI prompts

This orchestrator coordinates all modules to create the final output pipeline.
"""

import logging
import json
import sys
import os
from pathlib import Path
from typing import Dict, Tuple, Optional, List
from datetime import datetime

# Load environment variables from .env
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# Import custom modules
sys.path.insert(0, str(Path(__file__).parent))

from audio_preprocessor import AudioPreprocessor
from transcript_merger import TranscriptMerger
from smart_summarizer import SmartSummarizer
from stt_apis import STTAPIManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('processing/logs/workflow_orchestrator.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class WorkflowOrchestrator:
    """Complete 5-step STT workflow orchestrator"""

    def __init__(self, project_dir: str = "."):
        """
        Initialize orchestrator

        Args:
            project_dir: Project root directory
        """
        self.project_dir = Path(project_dir)
        self.input_dir = self.project_dir / "input" / "audio_files"
        self.output_dir = self.project_dir / "output"
        self.stt_final_dir = self.output_dir / "stt_final"
        self.summaries_dir = self.output_dir / "summaries"
        self.archive_dir = self.output_dir / "archive"
        self.preprocessed_dir = self.output_dir / "preprocessed"

        # Create directories
        for directory in [self.stt_final_dir, self.summaries_dir, self.archive_dir, self.preprocessed_dir]:
            directory.mkdir(parents=True, exist_ok=True)

        # Load STT models config
        stt_config_path = self.project_dir / 'config' / 'stt_models_config.json'
        try:
            with open(stt_config_path, 'r', encoding='utf-8') as f:
                stt_models_config = json.load(f)
        except Exception as e:
            logger.warning(f"Could not load STT config: {e}, using empty config")
            stt_models_config = {'stt_engines': []}

        # Initialize modules
        self.preprocessor = AudioPreprocessor()
        self.merger = TranscriptMerger()
        self.summarizer = SmartSummarizer()
        
        # Initialize STT Manager with config
        try:
            self.stt_manager = STTAPIManager(stt_models_config.get('stt_engines', []))
        except Exception as e:
            logger.warning(f"Could not initialize STT Manager: {e}")
            self.stt_manager = None

        logger.info("✅ WorkflowOrchestrator initialized")

    def process_single_file(self, audio_file: str) -> Tuple[bool, Dict]:
        """
        Process a single audio file through complete 5-step pipeline

        Args:
            audio_file: Path to audio file

        Returns:
            Tuple of (success, results_dict)
        """
        audio_path = Path(audio_file)
        logger.info(f"\n{'='*60}")
        logger.info(f"🎯 Starting workflow for: {audio_path.name}")
        logger.info(f"{'='*60}\n")

        results = {
            'file': audio_path.name,
            'timestamp': datetime.now().isoformat(),
            'steps': {}
        }

        try:
            # STEP 1: Input Management
            logger.info("[Step 1/5] 📋 Input Management...")
            success, validation = self._step1_validate_input(audio_path)
            results['steps']['step1'] = validation

            if not success:
                logger.error(f"❌ Validation failed: {validation.get('error')}")
                return False, results
            logger.info(f"✅ Input validated: {validation}")

            # STEP 2: Audio Preprocessing
            logger.info("\n[Step 2/5] 🔧 Audio Preprocessing...")
            success, preprocessed_path = self._step2_preprocess_audio(audio_path)
            results['steps']['step2'] = {'preprocessed_file': str(preprocessed_path)}

            if not success:
                logger.error(f"❌ Preprocessing failed")
                preprocessed_path = audio_path  # Fallback to original
            else:
                logger.info(f"✅ Preprocessing complete: {preprocessed_path}")

            # STEP 3: Multi-Model STT
            logger.info("\n[Step 3/5] 🎤 Multi-Model Speech-to-Text...")
            success, stt_results = self._step3_multi_model_stt(preprocessed_path)
            results['steps']['step3'] = stt_results

            if not success or not stt_results.get('azure') or not stt_results.get('openai'):
                logger.error("❌ STT processing failed or incomplete")
                return False, results
            logger.info(f"✅ STT complete: Azure and OpenAI Whisper results obtained")

            # STEP 4: Transcript Merging
            logger.info("\n[Step 4/5] 🔀 Transcript Comparison & Merging...")
            success, merged_transcript, merge_details = self._step4_merge_transcripts(
                stt_results['azure'],
                stt_results['openai'],
                audio_path
            )
            results['steps']['step4'] = merge_details

            if not success:
                logger.error("❌ Transcript merging failed")
                return False, results
            logger.info(f"✅ Transcripts merged into final document")

            # STEP 5: Smart Summarization
            logger.info("\n[Step 5/5] 📝 Smart Summarization...")
            success, summary_file = self._step5_summarize(merged_transcript, audio_path)
            results['steps']['step5'] = {'summary_file': str(summary_file)}

            if not success:
                logger.warning("⚠️ Summarization had issues but continuing")
            else:
                logger.info(f"✅ Summary generated: {summary_file}")

            results['success'] = True
            results['final_transcript'] = str(self.stt_final_dir / f"{audio_path.stem}_transcript.md")
            results['final_summary'] = str(summary_file) if success else None

            logger.info(f"\n{'='*60}")
            logger.info(f"✅ COMPLETE! All 5 steps finished successfully")
            logger.info(f"📄 Transcript: {results['final_transcript']}")
            logger.info(f"📋 Summary: {results['final_summary']}")
            logger.info(f"{'='*60}\n")

            return True, results

        except Exception as e:
            logger.error(f"❌ Workflow failed: {e}", exc_info=True)
            results['success'] = False
            results['error'] = str(e)
            return False, results

    def _step1_validate_input(self, audio_path: Path) -> Tuple[bool, Dict]:
        """Step 1: Validate input file"""
        validation = {
            'file': audio_path.name,
            'exists': audio_path.exists(),
            'is_file': audio_path.is_file(),
            'size_mb': audio_path.stat().st_size / (1024*1024) if audio_path.exists() else 0,
            'extension': audio_path.suffix.lower()
        }

        # Check file exists
        if not validation['exists']:
            validation['error'] = "File not found"
            return False, validation

        # Check file type
        supported = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'}
        if validation['extension'] not in supported:
            validation['error'] = f"Unsupported format: {validation['extension']}"
            return False, validation

        # Check file size (max 2GB)
        if validation['size_mb'] > 2048:
            validation['error'] = f"File too large: {validation['size_mb']:.1f} MB"
            return False, validation

        validation['status'] = 'valid'
        return True, validation

    def _step2_preprocess_audio(self, audio_path: Path) -> Tuple[bool, Path]:
        """Step 2: Preprocess audio"""
        output_path = self.preprocessed_dir / f"{audio_path.stem}_cleaned.wav"
        success, message = self.preprocessor.preprocess_audio(str(audio_path), str(output_path))
        return success, output_path

    def _step3_multi_model_stt(self, audio_path: Path) -> Tuple[bool, Dict]:
        """Step 3: Multi-model STT processing"""
        stt_results = {}

        logger.info("Sending to Azure STT...")
        azure_success, azure_text = self.stt_manager.transcribe('azure', str(audio_path))
        if azure_success:
            stt_results['azure'] = azure_text
            logger.info(f"✓ Azure STT: {len(azure_text.split())} words")
        else:
            logger.warning(f"⚠ Azure STT failed: {azure_text}")

        logger.info("Sending to OpenAI Whisper...")
        openai_success, openai_text = self.stt_manager.transcribe('openai', str(audio_path))
        if openai_success:
            stt_results['openai'] = openai_text
            logger.info(f"✓ OpenAI Whisper: {len(openai_text.split())} words")
        else:
            logger.warning(f"⚠ OpenAI Whisper failed: {openai_text}")

        success = azure_success and openai_success
        return success, stt_results

    def _step4_merge_transcripts(self, azure_text: str, openai_text: str,
                                 audio_path: Path) -> Tuple[bool, str, Dict]:
        """Step 4: Merge and compare transcripts"""

        # Generate final transcript file
        output_filename = f"{audio_path.stem}_transcript.md"
        success, output_path = self.merger.generate_final_transcript(
            azure_text, openai_text,
            filename=output_filename,
            output_dir=str(self.stt_final_dir)
        )

        if success:
            # Read the generated file to return merged text
            with open(output_path, 'r', encoding='utf-8') as f:
                merged_content = f.read()

            # Extract just the transcript for summarization
            lines = merged_content.split('\n')
            transcript_start = False
            transcript_lines = []
            for line in lines:
                if line.startswith('## Merged Transcript'):
                    transcript_start = True
                    continue
                if transcript_start and line.startswith('##'):
                    break
                if transcript_start and line.strip():
                    transcript_lines.append(line)

            merged_text = '\n'.join(transcript_lines)

            # Get comparison details
            comparison = self.merger.compare_transcripts(azure_text, openai_text)
            merge_details = {
                'status': 'success',
                'output_file': str(output_path),
                'similarity': f"{comparison['similarity']:.1%}",
                'differences_found': len(comparison['differences'])
            }

            return True, merged_text, merge_details
        else:
            return False, "", {'status': 'failed', 'error': str(output_path)}

    def _step5_summarize(self, transcript_text: str, audio_path: Path) -> Tuple[bool, Path]:
        """Step 5: Generate smart summary"""

        # Determine summary type based on context
        summary_type = "meeting"  # Default

        # Generate summary
        success, summary = self.summarizer.summarize(transcript_text)

        # Save summary
        summary_filename = f"{audio_path.stem}_summary.md"
        summary_path = self.summaries_dir / summary_filename

        try:
            with open(summary_path, 'w', encoding='utf-8') as f:
                f.write("# SUMMARY\n\n")
                f.write(f"Source: {audio_path.name}\n")
                f.write(f"Generated: {datetime.now().isoformat()}\n")
                f.write(f"Status: {'AI-Generated' if success else 'Fallback Summary'}\n\n")
                f.write(summary)

            return True, summary_path
        except Exception as e:
            logger.error(f"Failed to save summary: {e}")
            return False, summary_path

    def process_batch(self, input_dir: Optional[str] = None) -> Dict:
        """
        Process all audio files in input directory

        Args:
            input_dir: Input directory (uses default if not specified)

        Returns:
            Batch processing results
        """
        process_dir = Path(input_dir) if input_dir else self.input_dir

        if not process_dir.exists():
            logger.error(f"Input directory not found: {process_dir}")
            return {'success': False, 'error': 'Input directory not found'}

        # Find audio files
        supported_formats = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'}
        audio_files = [f for f in process_dir.glob('*')
                      if f.suffix.lower() in supported_formats]

        logger.info(f"\n🎬 BATCH PROCESSING STARTED")
        logger.info(f"Found {len(audio_files)} file(s) to process\n")

        batch_results = {
            'total': len(audio_files),
            'successful': 0,
            'failed': 0,
            'files': [],
            'timestamp': datetime.now().isoformat()
        }

        for idx, audio_file in enumerate(audio_files, 1):
            logger.info(f"\n[{idx}/{len(audio_files)}] Processing: {audio_file.name}")

            success, results = self.process_single_file(str(audio_file))

            batch_results['files'].append({
                'filename': audio_file.name,
                'success': success,
                'results': results
            })

            if success:
                batch_results['successful'] += 1
            else:
                batch_results['failed'] += 1

        # Save batch results
        batch_log_dir = Path('processing/logs')
        batch_log_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        batch_log_file = batch_log_dir / f"batch_results_{timestamp}.json"

        with open(batch_log_file, 'w', encoding='utf-8') as f:
            json.dump(batch_results, f, indent=2, ensure_ascii=False)

        logger.info(f"\n{'='*60}")
        logger.info(f"✅ BATCH COMPLETE: {batch_results['successful']}/{batch_results['total']} successful")
        logger.info(f"📋 Results saved: {batch_log_file}")
        logger.info(f"{'='*60}\n")

        return batch_results


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(
        description='STT Workflow Orchestrator - Complete 5-step pipeline'
    )

    parser.add_argument('--file', help='Process a single audio file')
    parser.add_argument('--batch', action='store_true', help='Process all files in input folder')
    parser.add_argument('--dir', default='.', help='Project directory')

    args = parser.parse_args()
    orchestrator = WorkflowOrchestrator(args.dir)

    if args.file:
        success, results = orchestrator.process_single_file(args.file)
        sys.exit(0 if success else 1)
    elif args.batch:
        orchestrator.process_batch()
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
