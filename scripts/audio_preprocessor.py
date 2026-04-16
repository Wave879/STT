#!/usr/bin/env python3
"""
Audio Preprocessor Module
Clean and enhance audio files before STT processing

Features:
- Extract audio from video files
- Remove background noise
- Normalize audio levels
- Remove silence/gaps
- Enhance clarity
- Save preprocessed audio

Supports Audio: MP3, WAV, M4A, FLAC, OGG, WebM
Supports Video: MP4, AVI, MOV, MKV, FLV, WMV
"""

import os
import sys
import logging
import subprocess
from pathlib import Path
from typing import Tuple

logger = logging.getLogger(__name__)


class AudioPreprocessor:
    """Audio preprocessing and enhancement"""

    def __init__(self):
        """Initialize audio preprocessor"""
        logger.info("AudioPreprocessor initialized")
        self._check_ffmpeg()

    def _check_ffmpeg(self) -> bool:
        """Check if ffmpeg is available"""
        try:
            result = subprocess.run(['ffmpeg', '-version'], 
                                    capture_output=True, timeout=5)
            if result.returncode == 0:
                logger.info("✓ ffmpeg available")
                return True
        except FileNotFoundError:
            logger.warning("⚠ ffmpeg not found - video extraction disabled")
            return False
        except Exception as e:
            logger.warning(f"⚠ ffmpeg check failed: {e}")
            return False

    def extract_audio_from_video(self, video_path: str, output_path: str = None) -> Tuple[bool, str]:
        """
        Extract audio from video file using ffmpeg

        Args:
            video_path: Path to video file
            output_path: Path to save extracted audio (default: video_stem.wav)

        Returns:
            Tuple of (success, message or audio_path)
        """
        video_path = Path(video_path)
        logger.info(f"🎬 Extracting audio from video: {video_path.name}")

        try:
            # Check ffmpeg availability
            result = subprocess.run(['ffmpeg', '-version'], 
                                    capture_output=True, timeout=5)
            if result.returncode != 0:
                return False, "ffmpeg not available - install with: choco install ffmpeg (Windows) or brew install ffmpeg (Mac)"

            if output_path is None:
                output_path = str(video_path.parent / f"{video_path.stem}.wav")

            logger.info(f"Extracting to: {output_path}")

            # Extract audio using ffmpeg
            cmd = [
                'ffmpeg',
                '-i', str(video_path),
                '-vn',  # No video
                '-acodec', 'pcm_s16le',  # 16-bit PCM
                '-ar', '16000',  # 16kHz sample rate
                '-ac', '1',  # Mono
                '-y',  # Overwrite output
                output_path
            ]

            result = subprocess.run(cmd, capture_output=True, timeout=300)

            if result.returncode == 0:
                logger.info(f"✓ Audio extracted: {output_path}")
                return True, output_path
            else:
                error_msg = result.stderr.decode() if result.stderr else "Unknown error"
                logger.error(f"ffmpeg extraction failed: {error_msg}")
                return False, f"Audio extraction failed: {error_msg}"

        except subprocess.TimeoutExpired:
            logger.error("Audio extraction timed out")
            return False, "Audio extraction timed out (>5 minutes)"
        except Exception as e:
            logger.error(f"Error extracting audio from video: {e}")
            return False, str(e)

    def preprocess_audio(self, input_path: str, output_path: str = None) -> Tuple[bool, str]:
        """
        Preprocess audio file

        Steps:
        1. Load audio
        2. Remove silence
        3. Reduce noise
        4. Normalize volume
        5. Enhance clarity
        6. Save to output

        Args:
            input_path: Path to input audio file
            output_path: Path to save preprocessed audio

        Returns:
            Tuple of (success, message)
        """
        logger.info(f"Starting audio preprocessing: {input_path}")

        try:
            # Import audio libraries
            try:
                import librosa
                import soundfile as sf
                import noisereduce as nr
                import numpy as np
            except ImportError:
                logger.error("Missing audio libraries")
                logger.error("Install with: pip install librosa soundfile noisereduce numpy scipy")
                return False, "Missing audio libraries"

            input_path = Path(input_path)

            # Step 1: Load audio
            logger.info("[Step 1/5] Loading audio file...")
            y, sr = librosa.load(str(input_path), sr=16000)
            logger.info(f"✓ Loaded: {len(y)/sr:.1f}s at {sr}Hz")

            # Step 2: Remove silence
            logger.info("[Step 2/5] Removing silence...")
            S = librosa.feature.melspectrogram(y=y, sr=sr)
            S_db = librosa.power_to_db(S, ref=np.max)
            threshold = -40  # dB
            frames = np.where(np.mean(S_db, axis=0) > threshold)[0]

            if len(frames) > 0:
                start_sample = librosa.frames_to_samples(frames[0])
                end_sample = librosa.frames_to_samples(frames[-1] + 1)
                y_trimmed = y[start_sample:end_sample]
                logger.info(f"✓ Silence removed: {len(y_trimmed)/sr:.1f}s")
            else:
                y_trimmed = y
                logger.warning("⚠ No audio found above threshold")

            # Step 3: Reduce noise
            logger.info("[Step 3/5] Reducing background noise...")
            try:
                y_denoised = nr.reduce_noise(y=y_trimmed, sr=sr)
                logger.info("✓ Noise reduction applied")
            except Exception as e:
                logger.warning(f"Noise reduction failed: {e}, skipping")
                y_denoised = y_trimmed

            # Step 4: Normalize volume
            logger.info("[Step 4/5] Normalizing audio levels...")
            # Target RMS level: -20 dB
            target_rms = 10 ** (-20 / 20)
            current_rms = np.sqrt(np.mean(y_denoised ** 2))

            if current_rms > 0:
                y_normalized = y_denoised * (target_rms / current_rms)
                # Prevent clipping
                y_normalized = np.clip(y_normalized, -1.0, 1.0)
                logger.info(f"✓ Normalized: RMS ~{-20}dB")
            else:
                y_normalized = y_denoised

            # Step 5: Enhance clarity (simple high-pass filter effect)
            logger.info("[Step 5/5] Enhancing clarity...")
            # Apply simple high-pass filter via frequency domain
            try:
                import scipy.signal
                # Create a high-pass filter
                sos = scipy.signal.butter(4, 100, 'hp', fs=sr, output='sos')
                y_enhanced = scipy.signal.sosfilt(sos, y_normalized)
                logger.info("✓ Clarity enhanced")
            except Exception as e:
                logger.warning(f"Clarity enhancement failed: {e}")
                y_enhanced = y_normalized

            # Save processed audio
            import soundfile as sf
            sf.write(str(output_path), y_enhanced, sr)
            logger.info(f"✓ Preprocessing complete: {output_path}")
            return True, str(output_path)

        except Exception as e:
            logger.error(f"Preprocessing failed: {e}")
            return False, str(e)
