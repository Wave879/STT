#!/usr/bin/env python3
"""
STT Processor - Azure Fast Transcription (primary) + MAI (fallback)
Supports diarization (speaker separation) for Thai audio.
"""

import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Tuple

import requests
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env')

logger = logging.getLogger(__name__)

SUPPORTED_FORMATS = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm', '.mp4', '.mov', '.m4v'}

_MIME_MAP = {
    '.wav':  'audio/wav',
    '.mp3':  'audio/mpeg',
    '.flac': 'audio/flac',
    '.ogg':  'audio/ogg; codecs=opus',
    '.webm': 'audio/webm; codecs=opus',
    '.m4a':  'audio/mp4',
    '.mp4':  'audio/mp4',
    '.mov':  'video/quicktime',
    '.m4v':  'video/mp4',
}


def _ms_to_time(ms: int) -> str:
    """Convert milliseconds to MM:SS string."""
    s = ms // 1000
    return f"{s // 60:02d}:{s % 60:02d}"


def _format_markdown(phrases: List[Dict], audio_name: str, engine: str) -> str:
    """Format API phrase list into readable markdown transcript with speaker turns."""
    lines = [f"# Transcript: {audio_name}", f"**Engine:** {engine}  ", ""]
    if not phrases:
        lines.append("_(ไม่พบเสียงพูด)_")
        return '\n'.join(lines) + '\n'

    prev_speaker = None
    for p in phrases:
        text = (p.get('text') or '').strip()
        if not text:
            continue
        speaker = p.get('speaker')  # int or None
        offset_ms = p.get('offsetMilliseconds', 0)
        time_str = _ms_to_time(offset_ms)

        if speaker is not None:
            label = f"ผู้พูด {speaker}"
            if speaker != prev_speaker:
                lines.append(f"\n**[{time_str} — {label}]**")
                prev_speaker = speaker
            lines.append(text)
        else:
            lines.append(f"[{time_str}] {text}")

    return '\n'.join(lines) + '\n'


def _call_fast_transcription(
    audio_path: Path,
    api_key: str,
    url: str,
    language: str = 'th-TH',
) -> Tuple[str, List[Dict]]:
    """
    POST to Azure‑compatible Fast Transcription REST API.
    Returns (plain_text, phrases).
    """
    ext = audio_path.suffix.lower()
    mime = _MIME_MAP.get(ext, 'audio/mpeg')
    definition = json.dumps({
        'locales': [language],
        'profanityFilterMode': 'None',
        'diarizationSettings': {'minSpeakerCount': 1, 'maxSpeakerCount': 8},
    })

    with open(str(audio_path), 'rb') as f:
        audio_bytes = f.read()

    files = {
        'audio': (audio_path.name, audio_bytes, mime),
        'definition': (None, definition, 'application/json'),
    }
    headers = {'Ocp-Apim-Subscription-Key': api_key}

    resp = requests.post(url, headers=headers, files=files, timeout=600)
    if resp.status_code != 200:
        logger.warning(f"STT API returned {resp.status_code}: {resp.text[:300]}")
        return '', []

    data = resp.json()
    phrases: List[Dict] = data.get('phrases', [])
    combined: List[Dict] = data.get('combinedPhrases', [])

    plain_text = ' '.join(p.get('text', '') for p in combined).strip()
    if not plain_text:
        plain_text = ' '.join(p.get('text', '') for p in phrases).strip()

    return plain_text, phrases


def transcribe(audio_path: str) -> Tuple[str, str, str]:
    """
    Transcribe an audio file.

    Strategy: Azure Fast Transcription → MAI fallback.
    Both APIs use the same multipart format and diarization settings.

    Returns:
        (plain_text, transcript_markdown, engine_used)
        engine_used is 'azure', 'mai', or 'none'.
    """
    path = Path(audio_path)
    language = os.getenv('AZURE_SPEECH_LANGUAGE', os.getenv('MAI_SPEECH_LANGUAGE', 'th-TH'))

    # ── Azure ──────────────────────────────────────────────────────────────────
    az_key = os.getenv('AZURE_SPEECH_KEY') or os.getenv('AZURE_KEY')
    az_region = os.getenv('AZURE_SPEECH_REGION') or os.getenv('AZURE_REGION', 'southeastasia')
    if az_key:
        az_url = (
            f"https://{az_region}.api.cognitive.microsoft.com"
            f"/speechtotext/transcriptions:transcribe?api-version=2024-11-15"
        )
        logger.info(f"Azure STT → {az_url}")
        try:
            text, phrases = _call_fast_transcription(path, az_key, az_url, language)
            if text:
                md = _format_markdown(phrases, path.name, 'Azure')
                return text, md, 'azure'
        except Exception as exc:
            logger.warning(f"Azure STT failed: {exc}")
    else:
        logger.warning("Azure key not set (AZURE_SPEECH_KEY / AZURE_KEY)")

    # ── MAI fallback ───────────────────────────────────────────────────────────
    mai_key = os.getenv('MAI_SPEECH_KEY') or os.getenv('MAI_KEY')
    mai_endpoint = (
        os.getenv('MAI_SPEECH_ENDPOINT') or
        os.getenv('MAI_ENDPOINT', 'https://mai-speech.cognitiveservices.azure.com/')
    ).rstrip('/')
    if mai_key:
        mai_url = f"{mai_endpoint}/speechtotext/transcriptions:transcribe?api-version=2025-10-15"
        logger.info(f"MAI STT (fallback) → {mai_url}")
        try:
            text, phrases = _call_fast_transcription(path, mai_key, mai_url, language)
            if text:
                md = _format_markdown(phrases, path.name, 'MAI')
                return text, md, 'mai'
        except Exception as exc:
            logger.warning(f"MAI STT failed: {exc}")
    else:
        logger.warning("MAI key not set (MAI_SPEECH_KEY / MAI_KEY)")

    # ── Both failed ────────────────────────────────────────────────────────────
    return '', f"# Transcript: {path.name}\n\n_(ไม่สามารถถอดความได้ — กรุณาตรวจสอบ API key)_\n", 'none'


    def _create_directories(self):
        """Create necessary directories if they don't exist"""
        dirs = [
            self.processing_dir / 'temp_transcripts',
            self.processing_dir / 'analysis_results',
            self.processing_dir / 'logs',
            self.output_dir / 'stt_final',
            self.output_dir / 'summaries',
            self.output_dir / 'reports',
            self.output_dir / 'archive'
        ]
        for dir_path in dirs:
            dir_path.mkdir(parents=True, exist_ok=True)

    def _load_config(self, config_file: str) -> Dict:
        """
        Load configuration file

        Args:
            config_file: Name of config file

        Returns:
            Configuration dictionary
        """
        config_path = self.config_dir / config_file
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            logger.info(f"Loaded configuration from {config_file}")
            return config
        except FileNotFoundError:
            logger.error(f"Configuration file not found: {config_path}")
            return {}
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON in {config_file}")
            return {}

    def get_audio_files(self, audio_dir: str = None) -> List[Path]:
        """
        Get all audio files from input directory

        Args:
            audio_dir: Directory to search (default: input/audio_files/)

        Returns:
            List of audio file paths
        """
        if audio_dir is None:
            audio_dir = self.input_dir / 'audio_files'

        audio_dir = Path(audio_dir)
        # Supported audio and video formats
        audio_formats = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'}
        video_formats = {'.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v'}
        all_formats = audio_formats | video_formats

        audio_files = []
        try:
            for file_path in audio_dir.glob('*'):
                if file_path.suffix.lower() in all_formats:
                    audio_files.append(file_path)

            logger.info(f"Found {len(audio_files)} audio/video files")
            return sorted(audio_files)
        except Exception as e:
            logger.error(f"Error scanning audio directory: {e}")
            return []

    def validate_audio_file(self, file_path: Path) -> Tuple[bool, str]:
        """
        Validate audio file

        Args:
            file_path: Path to audio file

        Returns:
            Tuple of (is_valid, message)
        """
        # Check if file exists
        if not file_path.exists():
            return False, f"File does not exist: {file_path}"

        # Check file size (max 2GB)
        file_size = file_path.stat().st_size
        max_size = 2 * 1024 * 1024 * 1024  # 2GB in bytes
        if file_size > max_size:
            return False, f"File too large: {file_size / 1024 / 1024 / 1024:.2f}GB (max 2GB)"

        # Check file extension
        # Supported audio and video formats
        audio_formats = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'}
        video_formats = {'.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v'}
        all_formats = audio_formats | video_formats
        
        if file_path.suffix.lower() not in all_formats:
            return False, f"Unsupported format: {file_path.suffix}"
        
        file_type = 'video' if file_path.suffix.lower() in video_formats else 'audio'
        return True, f"File is valid ({file_type})"

    def _extract_audio_from_video(self, video_file: Path) -> Path:
        """
        Extract audio from video file using AudioPreprocessor

        Args:
            video_file: Path to video file

        Returns:
            Path to extracted audio file
        """
        logger.info(f"🎬 Extracting audio from video: {video_file.name}")
        
        try:
            from audio_preprocessor import AudioPreprocessor
            
            preprocessor = AudioPreprocessor()
            extracted_audio = self.processing_dir / f"{video_file.stem}_extracted.wav"
            
            success, result = preprocessor.extract_audio_from_video(
                str(video_file),
                str(extracted_audio)
            )
            
            if not success:
                logger.error(f"Failed to extract audio: {result}")
                raise Exception(f"Audio extraction failed: {result}")
            
            logger.info(f"✓ Audio extracted: {extracted_audio}")
            return extracted_audio
            
        except ImportError:
            logger.error("Cannot import AudioPreprocessor")
            raise
        except Exception as e:
            logger.error(f"Error extracting audio from video: {e}")
            raise

    def process_audio_file(self, audio_file: Path, output_format: str = 'markdown') -> Dict:
        """
        Process single audio file (or video file with audio extraction) through STT

        Args:
            audio_file: Path to audio or video file
            output_format: Output format (markdown, docx, pdf)

        Returns:
            Processing result dictionary
        """
        logger.info(f"Processing file: {audio_file.name}")

        # Validate file
        is_valid, message = self.validate_audio_file(audio_file)
        if not is_valid:
            logger.error(message)
            return {
                'status': 'failed',
                'file': audio_file.name,
                'error': message
            }

        # Handle video files by extracting audio first
        video_formats = {'.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v'}
        processing_file = audio_file
        
        if audio_file.suffix.lower() in video_formats:
            logger.info(f"🎬 Video file detected: {audio_file.name}")
            try:
                processing_file = self._extract_audio_from_video(audio_file)
                logger.info(f"✓ Successfully extracted audio for processing")
            except Exception as e:
                logger.error(f"Failed to extract audio from video: {e}")
                return {
                    'status': 'failed',
                    'file': audio_file.name,
                    'error': str(e)
                }

        # Create processing result
        result = {
            'status': 'processing',
            'file': audio_file.name,
            'input_path': str(audio_file),
            'file_size': audio_file.stat().st_size,
            'start_time': datetime.now().isoformat(),
            'models_used': [],
            'confidence_scores': {},
            'corrections_applied': 0,
            'output_files': []
        }

        try:
            # Step 1: Extract audio metadata
            logger.info("Extracting audio metadata...")
            metadata = self._extract_audio_metadata(processing_file)
            result['metadata'] = metadata

            # Step 2: Generate temporary transcript path
            temp_transcript_dir = self.processing_dir / 'temp_transcripts'
            temp_transcript_path = temp_transcript_dir / f"{audio_file.stem}_transcript.txt"

            # Step 3: Process with STT models
            logger.info(f"Processing with STT models...")
            stt_results = self._process_with_stt_models(processing_file, temp_transcript_path)
            result['models_used'] = list(stt_results.keys())
            result['confidence_scores'] = {
                model: score for model, score in stt_results.items()
            }

            # Step 4: Apply corrections based on keywords
            logger.info("Applying context-based corrections...")
            corrected_text = self._apply_corrections(temp_transcript_path)
            result['corrections_applied'] = len(corrected_text.get('corrections', []))

            # Step 5: Generate output files
            logger.info("Generating output files...")
            output_files = self._generate_output_files(
                audio_file,
                corrected_text.get('text', ''),
                output_format,
                result
            )
            result['output_files'] = output_files

            # Step 6: Generate summary
            logger.info("Generating summary...")
            summary_file = self._generate_summary(audio_file, corrected_text.get('text', ''))
            result['summary_file'] = str(summary_file)

            result['status'] = 'completed'
            result['end_time'] = datetime.now().isoformat()

            logger.info(f"✓ Successfully processed: {audio_file.name}")

        except Exception as e:
            logger.error(f"Error processing file: {e}")
            result['status'] = 'failed'
            result['error'] = str(e)

        return result

    def _extract_audio_metadata(self, audio_file: Path) -> Dict:
        """Extract metadata from audio file"""
        return {
            'filename': audio_file.name,
            'format': audio_file.suffix.lower(),
            'size_bytes': audio_file.stat().st_size,
            'created': datetime.fromtimestamp(audio_file.stat().st_ctime).isoformat()
        }

    def _process_with_stt_models(self, audio_file: Path, output_path: Path) -> Dict:
        """Process audio file with multiple STT models using STT API Manager"""
        results = {}
        transcripts = {}
        
        logger.info("Starting STT processing with multiple models...")
        
        try:
            # Import STT API Manager and AI merger
            from stt_apis import STTAPIManager
            from transcript_merger import AITranscriptMerger
            
            # Get models configuration
            models_config = self.stt_models_config.get('stt_engines', [])
            
            # Initialize STT API Manager
            manager = STTAPIManager(models_config)
            
            # Transcribe with all available clients
            logger.info(f"Transcribing with {len(manager.get_available_clients())} available models...")
            all_results = manager.transcribe_with_all(str(audio_file))
            
            # Store results with model IDs
            for model_id, (text, confidence) in all_results.items():
                if text and not text.startswith('['):
                    transcripts[model_id] = (text, confidence)
                    results[model_id] = confidence
                    logger.info(f"✓ {model_id}: {confidence:.1%} confidence ({len(text)} chars)")
                else:
                    logger.warning(f"✗ {model_id}: Failed or returned error")
                    results[model_id] = 0.0
            
            # Use AI comparison if available and multiple transcripts exist
            final_text = ""
            selected_model = None
            
            if len(transcripts) > 1 and os.getenv('USE_AI_COMPARISON', 'true').lower() == 'true':
                logger.info(f"Using AI comparison for {len(transcripts)} transcripts...")
                ai_merger = AITranscriptMerger()
                
                if ai_merger.enabled:
                    # Run AI comparison
                    ai_result = ai_merger.compare_and_select(transcripts)
                    selected_model = ai_result.get('selected_model')
                    final_text = ai_result.get('selected_text', '')
                    
                    logger.info(f"AI selected: {selected_model}")
                    if ai_result.get('analysis'):
                        logger.info(f"Analysis: {ai_result['analysis'][:200]}...")
                else:
                    logger.info("AI comparison not available, using confidence-based selection...")
                    if transcripts:
                        selected_model = max(transcripts.items(), key=lambda x: x[1][1])[0]
                        final_text = transcripts[selected_model][0]
                        logger.info(f"Confidence-based selected: {selected_model}")
            else:
                # Single transcript or AI comparison disabled
                if transcripts:
                    selected_model = max(transcripts.items(), key=lambda x: x[1][1])[0]
                    final_text = transcripts[selected_model][0]
                    logger.info(f"Using highest confidence: {selected_model} ({results[selected_model]:.1%})")
            
            # Ensure we have some text
            if not final_text:
                logger.warning("No valid transcripts obtained, using first available...")
                if transcripts:
                    selected_model, (final_text, _) = list(transcripts.items())[0]
                else:
                    final_text = "[STT processing failed - no transcriptions available]"
            
            # Save final transcript
            output_path.write_text(final_text, encoding='utf-8')
            logger.info(f"✓ STT processing complete: {len(final_text)} characters")
            logger.info(f"  Selected model: {selected_model}")
            
        except ImportError as e:
            logger.error(f"STT module import error: {e}")
            output_path.write_text(f"[STT processing error: {e}]", encoding='utf-8')
        
        return results

    def _apply_corrections(self, transcript_path: Path) -> Dict:
        """Apply context-based corrections to transcript"""
        try:
            text = transcript_path.read_text(encoding='utf-8')
            corrections = []

            # Apply keyword corrections
            for keyword in self.keywords_config.get('domain_keywords', {}).get('technical_terms', []):
                term = keyword.get('term', '')
                expansion = keyword.get('expansion', '')
                if term.lower() in text.lower():
                    corrections.append({
                        'original': term,
                        'corrected': expansion
                    })

            return {
                'text': text,
                'corrections': corrections
            }
        except Exception as e:
            logger.error(f"Error applying corrections: {e}")
            return {'text': '', 'corrections': []}

    def _generate_output_files(self, audio_file: Path, transcript_text: str,
                              output_format: str, metadata: Dict) -> List[str]:
        """Generate output files in specified format"""
        output_files = []
        output_dir = self.output_dir / 'stt_final'
        base_name = audio_file.stem

        try:
            # Generate markdown output (default)
            if output_format in ['markdown', 'all']:
                md_file = output_dir / f"{base_name}_transcript.md"
                md_content = self._format_as_markdown(
                    transcript_text, metadata, audio_file
                )
                md_file.write_text(md_content, encoding='utf-8')
                output_files.append(str(md_file))
                logger.info(f"Generated: {md_file}")

            # In production, add DOCX and PDF generation
            # (requires python-docx, reportlab, etc.)

        except Exception as e:
            logger.error(f"Error generating output files: {e}")

        return output_files

    def _format_as_markdown(self, transcript: str, metadata: Dict,
                           audio_file: Path) -> str:
        """Format transcript as Markdown"""
        return f"""# Transcript: {audio_file.name}

## Meeting Information
| Field | Details |
|-------|---------|
| **Title** | {audio_file.stem} |
| **Date** | {datetime.now().strftime('%Y-%m-%d')} |
| **File Size** | {metadata.get('file_size', 0) / 1024 / 1024:.2f} MB |
| **Models Used** | {', '.join(metadata.get('models_used', []))} |
| **Status** | Processed |

## Transcript Content

{transcript}

## Processing Metadata
- Processed At: {datetime.now().isoformat()}
- File Format: {audio_file.suffix}
- Average Confidence Score: {sum(metadata.get('confidence_scores', {}).values()) / max(len(metadata.get('confidence_scores', {})), 1):.1%}

---
Generated by: STT Final Summary System v1.0
"""

    def _generate_summary(self, audio_file: Path, transcript_text: str) -> Path:
        """Generate summary document"""
        summary_dir = self.output_dir / 'summaries'
        summary_file = summary_dir / f"{audio_file.stem}_summary.md"

        summary_content = f"""# Summary: {audio_file.stem}

## Meeting Details
- **File**: {audio_file.name}
- **Date**: {datetime.now().strftime('%Y-%m-%d')}
- **Type**: Audio Transcription

## Executive Overview
[Summary of the transcribed content will be placed here]

## Key Points
- Point 1: [To be extracted from transcript]
- Point 2: [To be extracted from transcript]
- Point 3: [To be extracted from transcript]

## Action Items
- [ ] [Action items to be identified]

## Next Steps
[Follow-up actions and timeline]

---
**Generated**: {datetime.now().isoformat()}
"""

        summary_file.write_text(summary_content, encoding='utf-8')
        return summary_file

    def process_batch(self, audio_dir: str = None,
                     output_format: str = 'markdown') -> Dict:
        """
        Process all audio files in batch

        Args:
            audio_dir: Directory containing audio files
            output_format: Output format (markdown, docx, pdf)

        Returns:
            Batch processing results
        """
        logger.info("Starting batch processing...")

        audio_files = self.get_audio_files(audio_dir)

        if not audio_files:
            logger.warning("No audio files found")
            return {
                'status': 'no_files',
                'total_files': 0,
                'processed': 0,
                'failed': 0
            }

        results = {
            'status': 'processing',
            'total_files': len(audio_files),
            'processed': 0,
            'failed': 0,
            'details': [],
            'start_time': datetime.now().isoformat()
        }

        for audio_file in audio_files:
            result = self.process_audio_file(audio_file, output_format)
            results['details'].append(result)

            if result['status'] == 'completed':
                results['processed'] += 1
            else:
                results['failed'] += 1

        results['end_time'] = datetime.now().isoformat()
        results['status'] = 'completed'

        # Save batch results
        self._save_batch_results(results)

        logger.info(f"Batch processing completed: {results['processed']}/{results['total_files']} files processed successfully")

        return results

    def _save_batch_results(self, results: Dict):
        """Save batch processing results to file"""
        results_file = self.processing_dir / 'logs' / f"batch_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

        try:
            with open(results_file, 'w', encoding='utf-8') as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            logger.info(f"Batch results saved to {results_file}")
        except Exception as e:
            logger.error(f"Error saving batch results: {e}")

    def read_output_files(self, output_type: str = 'stt_final') -> List[Path]:
        """
        Read generated output files

        Args:
            output_type: Type of output (stt_final, summaries, reports)

        Returns:
            List of output file paths
        """
        output_dir = self.output_dir / output_type

        if not output_dir.exists():
            logger.warning(f"Output directory not found: {output_dir}")
            return []

        files = list(output_dir.glob('*'))
        logger.info(f"Found {len(files)} files in {output_type}")

        return sorted(files)

    def get_processing_status(self) -> Dict:
        """Get current processing status"""
        status = {
            'input_files': len(self.get_audio_files()),
            'output_files': {
                'transcripts': len(self.read_output_files('stt_final')),
                'summaries': len(self.read_output_files('summaries')),
                'reports': len(self.read_output_files('reports'))
            },
            'project_dir': str(self.project_dir)
        }

        return status

    def cleanup_temp_files(self, days_old: int = 7):
        """
        Clean up temporary files older than specified days

        Args:
            days_old: Age of files to delete in days
        """
        import time

        temp_dir = self.processing_dir / 'temp_transcripts'
        current_time = time.time()
        cutoff_time = current_time - (days_old * 24 * 60 * 60)

        deleted_count = 0

        try:
            for file_path in temp_dir.glob('*'):
                file_time = file_path.stat().st_mtime
                if file_time < cutoff_time:
                    file_path.unlink()
                    deleted_count += 1

            logger.info(f"Cleaned up {deleted_count} temporary files")
        except Exception as e:
            logger.error(f"Error cleaning up temporary files: {e}")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='STT Final Summary - Audio Processing Workflow'
    )

    parser.add_argument(
        'action',
        choices=['process', 'batch', 'list', 'status', 'cleanup'],
        help='Action to perform'
    )

    parser.add_argument(
        '-f', '--file',
        help='Path to audio file (for process action)'
    )

    parser.add_argument(
        '-d', '--directory',
        help='Path to audio directory (for batch action)'
    )

    parser.add_argument(
        '-o', '--output',
        choices=['markdown', 'docx', 'pdf', 'all'],
        default='markdown',
        help='Output format (default: markdown)'
    )

    parser.add_argument(
        '-p', '--project',
        default='.',
        help='Project directory (default: current directory)'
    )

    parser.add_argument(
        '-t', '--type',
        choices=['stt_final', 'summaries', 'reports'],
        default='stt_final',
        help='Output type for list action'
    )

    parser.add_argument(
        '-c', '--cleanup',
        type=int,
        default=7,
        help='Days old for cleanup (default: 7)'
    )

    args = parser.parse_args()

    # Initialize processor
    processor = STTProcessor(args.project)

    # Execute action
    if args.action == 'process':
        if not args.file:
            print("Error: --file is required for process action")
            sys.exit(1)
        result = processor.process_audio_file(Path(args.file), args.output)
        print(json.dumps(result, indent=2, ensure_ascii=False))

    elif args.action == 'batch':
        results = processor.process_batch(args.directory, args.output)
        print(json.dumps(results, indent=2, ensure_ascii=False))

    elif args.action == 'list':
        files = processor.read_output_files(args.type)
        print(f"\n📁 Files in {args.type}:\n")
        for i, file_path in enumerate(files, 1):
            print(f"{i}. {file_path.name}")

    elif args.action == 'status':
        status = processor.get_processing_status()
        print(json.dumps(status, indent=2))

    elif args.action == 'cleanup':
        processor.cleanup_temp_files(args.cleanup)


if __name__ == '__main__':
    main()
