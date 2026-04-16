"""
STT API Integration Module
Handles communication with multiple STT service providers

Supported Providers:
- Google Cloud Speech-to-Text
- Microsoft Azure Speech Services
- OpenAI Whisper API
"""

import os
import logging
from typing import Dict, Optional, Tuple
from pathlib import Path
import json

# Load environment variables from .env
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

logger = logging.getLogger(__name__)


class STTAPIClient:
    """Base class for STT API clients"""

    def __init__(self, api_key: str, config: Dict = None):
        """
        Initialize STT API Client

        Args:
            api_key: API key for the service
            config: Configuration dictionary
        """
        self.api_key = api_key
        self.config = config or {}
        self.provider_name = "base"

    def transcribe(self, audio_path: str) -> Tuple[str, float]:
        """
        Transcribe audio file

        Args:
            audio_path: Path to audio file

        Returns:
            Tuple of (transcribed_text, confidence_score)
        """
        raise NotImplementedError("Subclasses must implement transcribe method")

    def validate_audio(self, audio_path: str) -> bool:
        """Validate audio file compatibility"""
        raise NotImplementedError("Subclasses must implement validate_audio method")


class GoogleSTTClient(STTAPIClient):
    """Google Cloud Speech-to-Text API Client"""

    def __init__(self, api_key: str, config: Dict = None):
        """Initialize Google STT Client"""
        super().__init__(api_key, config)
        self.provider_name = "Google Cloud Speech-to-Text"
        self.language = config.get('language', 'th-TH') if config else 'th-TH'

        try:
            # Import Google Cloud library
            # from google.cloud import speech
            # self.client = speech.SpeechClient()
            logger.info(f"Initialized {self.provider_name}")
        except ImportError:
            logger.warning(f"{self.provider_name} library not installed")
            logger.info("Install with: pip install google-cloud-speech")

    def transcribe(self, audio_path: str) -> Tuple[str, float]:
        """
        Transcribe audio using Google Cloud Speech-to-Text

        Args:
            audio_path: Path to audio file

        Returns:
            Tuple of (transcribed_text, confidence_score)
        """
        logger.info(f"Transcribing with {self.provider_name}: {audio_path}")

        try:
            from google.cloud import speech
            import io
            
            # Load audio file
            audio_path_obj = Path(audio_path)
            if not audio_path_obj.exists():
                logger.error(f"Audio file not found: {audio_path}")
                return "", 0.0
            
            # Create client
            client = speech.SpeechClient()
            
            # Read audio file
            with io.open(audio_path, "rb") as audio_file:
                content = audio_file.read()
            
            audio = speech.RecognitionAudio(content=content)
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.AUTO,
                sample_rate_hertz=16000,
                language_code=self.language,
            )
            
            # Perform transcription
            response = client.recognize(config=config, audio=audio)
            
            if response.results:
                transcript = response.results[0].alternatives[0].transcript
                confidence = response.results[0].alternatives[0].confidence
                logger.info(f"✓ Transcription complete: {len(transcript)} chars")
                return transcript, float(confidence)
            else:
                logger.warning("No transcription results returned")
                return "", 0.0
                
        except ImportError:
            logger.warning(f"{self.provider_name} library not installed")
            logger.info("Install with: pip install google-cloud-speech")
            # Fallback response
            return "[Transcription unavailable - library not installed]", 0.0
        except Exception as e:
            logger.error(f"Google STT error: {e}")
            # Fallback response
            return f"[Transcription failed: {str(e)}]", 0.0

    def validate_audio(self, audio_path: str) -> bool:
        """Validate audio file for Google API"""
        path = Path(audio_path)
        supported_formats = {'.wav', '.mp3', '.m4a', '.flac'}
        return path.suffix.lower() in supported_formats


class AzureSTTClient(STTAPIClient):
    """Microsoft Azure Speech Services Client"""

    def __init__(self, api_key: str, config: Dict = None):
        """Initialize Azure STT Client"""
        super().__init__(api_key, config)
        self.provider_name = "Microsoft Azure Speech"
        self.region = config.get('region', 'eastasia') if config else 'eastasia'
        self.language = config.get('language', 'th-TH') if config else 'th-TH'

        try:
            # Import Azure library
            # import azure.cognitiveservices.speech as speechsdk
            # self.speech_config = speechsdk.SpeechConfig(
            #     subscription=api_key,
            #     region=self.region
            # )
            logger.info(f"Initialized {self.provider_name}")
        except ImportError:
            logger.warning(f"{self.provider_name} library not installed")
            logger.info("Install with: pip install azure-cognitiveservices-speech")

    def transcribe(self, audio_path: str) -> Tuple[str, float]:
        """
        Transcribe audio using Azure Speech Services.
        WAV  -> Azure Speech SDK (file-based, continuous recognition)
        Other -> Azure Speech REST API (supports mp3/webm/flac/ogg/m4a without SDK enum issues)
        """
        logger.info(f"Transcribing with {self.provider_name}: {audio_path}")

        try:
            audio_path_obj = Path(audio_path)
            if not audio_path_obj.exists():
                logger.error(f"Audio file not found: {audio_path}")
                return "", 0.0

            ext = audio_path_obj.suffix.lower()

            if ext == '.wav':
                return self._transcribe_sdk(str(audio_path_obj))
            else:
                # All non-WAV formats → Azure Fast Transcription REST API
                # (SDK compressed stream has compatibility issues; Fast API has no duration limit)
                return self._transcribe_fast(audio_path_obj, ext)

        except Exception as e:
            logger.error(f"Azure STT error: {e}")
            return f"[Transcription failed: {str(e)}]", 0.0

    def _transcribe_sdk(self, audio_path: str):
        """Use Azure Speech SDK for WAV files."""
        import azure.cognitiveservices.speech as speechsdk
        import threading

        speech_config = speechsdk.SpeechConfig(
            subscription=self.api_key, region=self.region
        )
        speech_config.speech_recognition_language = self.language
        audio_config = speechsdk.AudioConfig(filename=audio_path)
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config, audio_config=audio_config
        )

        all_text = []
        done_evt = threading.Event()

        def on_recognized(evt):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                all_text.append(evt.result.text)

        recognizer.recognized.connect(on_recognized)
        recognizer.session_stopped.connect(lambda _: done_evt.set())
        recognizer.canceled.connect(lambda _: done_evt.set())

        recognizer.start_continuous_recognition()
        done_evt.wait(timeout=300)
        recognizer.stop_continuous_recognition()

        text = ' '.join(all_text).strip()
        if text:
            logger.info(f"✓ Azure SDK transcription: {len(text)} chars")
            return text, 0.91
        else:
            logger.warning("Azure SDK returned no speech")
            return "", 0.0

    # SDK supports these compressed formats via PushAudioInputStream
    _SDK_FORMATS = {'.mp3', '.flac', '.ogg'}
    # REST API for formats SDK doesn't have an enum for
    _REST_FORMATS = {'.webm', '.m4a', '.mp4'}

    def _transcribe_sdk_compressed(self, audio_path_obj: Path, ext: str):
        """Use Azure Speech SDK with PushAudioInputStream for MP3/FLAC/OGG."""
        import azure.cognitiveservices.speech as speechsdk
        import threading

        fmt_map = {
            '.mp3':  speechsdk.AudioStreamContainerFormat.MP3,
            '.flac': speechsdk.AudioStreamContainerFormat.FLAC,
            '.ogg':  speechsdk.AudioStreamContainerFormat.OGG_OPUS,
        }
        container_fmt = fmt_map.get(ext, speechsdk.AudioStreamContainerFormat.ANY)
        try:
            # Python SDK API: use constructor with compressed_stream_format keyword
            compressed_format = speechsdk.audio.AudioStreamFormat(compressed_stream_format=container_fmt)
        except Exception as e:
            logger.warning(f"AudioStreamFormat compressed init failed ({e}) — using Fast Transcription REST")
            return self._transcribe_fast(audio_path_obj, ext)
        push_stream = speechsdk.audio.PushAudioInputStream(stream_format=compressed_format)
        audio_config = speechsdk.AudioConfig(stream=push_stream)

        speech_config = speechsdk.SpeechConfig(subscription=self.api_key, region=self.region)
        speech_config.speech_recognition_language = self.language
        recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

        all_text = []
        done_evt = threading.Event()

        def on_recognized(evt):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                all_text.append(evt.result.text)

        recognizer.recognized.connect(on_recognized)
        recognizer.session_stopped.connect(lambda _: done_evt.set())
        recognizer.canceled.connect(lambda _: done_evt.set())

        recognizer.start_continuous_recognition()
        # Feed file in chunks then signal end-of-stream
        with open(str(audio_path_obj), 'rb') as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                push_stream.write(chunk)
        push_stream.close()

        done_evt.wait(timeout=300)
        recognizer.stop_continuous_recognition()

        text = ' '.join(all_text).strip()
        if text:
            logger.info(f"✓ Azure SDK compressed transcription: {len(text)} chars")
            return text, 0.91
        else:
            logger.warning("Azure SDK compressed: no speech detected")
            return "", 0.0

    def _transcribe_fast(self, audio_path_obj: Path, ext: str):
        """
        Use Azure Fast Transcription REST API.
        Supports files up to 200 MB / any duration.
        Endpoint: https://{region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe
        """
        import requests
        import json as _json

        _MIME = {
            '.wav':  'audio/wav',
            '.mp3':  'audio/mpeg',
            '.flac': 'audio/flac',
            '.ogg':  'audio/ogg; codecs=opus',
            '.webm': 'audio/webm; codecs=opus',
            '.m4a':  'audio/mp4',
            '.mp4':  'audio/mp4',
        }
        mime = _MIME.get(ext, 'audio/wav')

        url = (
            f"https://{self.region}.api.cognitive.microsoft.com"
            f"/speechtotext/transcriptions:transcribe?api-version=2024-11-15"
        )
        headers = {'Ocp-Apim-Subscription-Key': self.api_key}
        definition = {
            'locales': [self.language],
            'profanityFilterMode': 'None',
        }
        logger.info(f"Azure Fast Transcription: {url}  mime={mime}")
        with open(str(audio_path_obj), 'rb') as f:
            files = {
                'audio': (audio_path_obj.name, f, mime),
                'definition': (None, _json.dumps(definition), 'application/json'),
            }
            resp = requests.post(url, headers=headers, files=files, timeout=600)

        if resp.status_code == 200:
            result = resp.json()
            combined = result.get('combinedPhrases', [])
            text = ' '.join(p.get('text', '') for p in combined).strip()
            if not text:
                # fallback: phrases
                phrases = result.get('phrases', [])
                text = ' '.join(p.get('text', '') for p in phrases).strip()
            logger.info(f"✓ Azure Fast Transcription: {len(text)} chars")
            return (text, 0.91) if text else ('', 0.0)
        else:
            logger.warning(f"Azure Fast Transcription {resp.status_code}: {resp.text[:200]}")
            # final fallback: simple REST (≤60 s files)
            return self._transcribe_rest(audio_path_obj, ext)

    def _transcribe_rest(self, audio_path_obj: Path, ext: str):
        """Use Azure Speech simple REST API (≤60 seconds). For longer files use _transcribe_fast."""
        import requests

        mime_map = {
            '.wav':  'audio/wav',
            '.mp3':  'audio/mpeg',
            '.flac': 'audio/flac',
            '.ogg':  'audio/ogg; codecs=opus',
            '.webm': 'audio/webm; codecs=opus',
            '.m4a':  'audio/mp4',
            '.mp4':  'audio/mp4',
        }
        content_type = mime_map.get(ext, 'audio/mpeg')

        url = (
            f"https://{self.region}.stt.speech.microsoft.com"
            f"/speech/recognition/conversation/cognitiveservices/v1"
            f"?language={self.language}&format=simple"
        )
        headers = {
            'Ocp-Apim-Subscription-Key': self.api_key,
            'Content-Type': content_type,
        }

        logger.info(f"Azure REST STT: {url}  Content-Type: {content_type}")
        data = audio_path_obj.read_bytes()
        resp = requests.post(url, headers=headers, data=data, timeout=300)

        if resp.status_code == 200:
            result = resp.json()
            text = result.get('DisplayText', '')
            logger.info(f"✓ Azure REST transcription: {len(text)} chars")
            return (text, 0.91) if text else ("", 0.0)
        else:
            logger.error(f"Azure REST error {resp.status_code}: {resp.text[:200]}")
            return f"[Transcription failed: Azure REST {resp.status_code}]", 0.0

    def validate_audio(self, audio_path: str) -> bool:
        path = Path(audio_path)
        return path.suffix.lower() in {'.wav', '.mp3', '.m4a', '.flac', '.ogg', '.webm', '.mp4'}


class OpenAIWhisperClient(STTAPIClient):
    """OpenAI Whisper API Client"""

    def __init__(self, api_key: str, config: Dict = None):
        """Initialize OpenAI Whisper Client"""
        super().__init__(api_key, config)
        self.provider_name = "OpenAI Whisper"
        self.model = config.get('model', 'whisper-1') if config else 'whisper-1'
        self.language = config.get('language', 'th') if config else 'th'

        try:
            # Import OpenAI library
            # import openai
            # openai.api_key = api_key
            logger.info(f"Initialized {self.provider_name}")
        except ImportError:
            logger.warning(f"{self.provider_name} library not installed")
            logger.info("Install with: pip install openai")

    def transcribe(self, audio_path: str) -> Tuple[str, float]:
        """
        Transcribe audio using OpenAI Whisper API

        Args:
            audio_path: Path to audio file

        Returns:
            Tuple of (transcribed_text, confidence_score)
        """
        logger.info(f"Transcribing with {self.provider_name}: {audio_path}")

        try:
            from openai import OpenAI
            
            # Verify file exists
            audio_path_obj = Path(audio_path)
            if not audio_path_obj.exists():
                logger.error(f"Audio file not found: {audio_path}")
                return "", 0.0
            
            # Create client
            client = OpenAI(api_key=self.api_key)
            
            # Open and transcribe audio
            with open(audio_path, "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    model=self.model,
                    file=audio_file,
                    language=self.language
                )
            
            # Extract text from response
            text = transcript.text if hasattr(transcript, 'text') else str(transcript)
            logger.info(f"✓ Transcription complete: {len(text)} chars")
            # Whisper doesn't provide confidence, use default
            confidence = 0.89
            return text, confidence
                
        except ImportError:
            logger.warning(f"{self.provider_name} library not installed")
            logger.info("Install with: pip install openai")
            # Fallback response
            return "[Transcription unavailable - library not installed]", 0.0
        except Exception as e:
            logger.error(f"OpenAI Whisper error: {e}")
            # Fallback response
            return f"[Transcription failed: {str(e)}]", 0.0

    def validate_audio(self, audio_path: str) -> bool:
        """Validate audio file for OpenAI Whisper"""
        path = Path(audio_path)
        supported_formats = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'}
        return path.suffix.lower() in supported_formats


class LocalWhisperClient(STTAPIClient):
    """Local Whisper Model (Offline) Client"""

    def __init__(self, api_key: str = None, config: Dict = None):
        """Initialize Local Whisper Client"""
        super().__init__(api_key, config)
        self.provider_name = "Local Whisper (Offline)"
        self.model_size = config.get('model_size', 'base') if config else 'base'
        self.device = config.get('device', 'cpu') if config else 'cpu'

        try:
            # Import Whisper library
            # import whisper
            # self.model = whisper.load_model(self.model_size, device=self.device)
            logger.info(f"Initialized {self.provider_name} ({self.model_size} model on {self.device})")
        except ImportError:
            logger.warning(f"{self.provider_name} library not installed")
            logger.info("Install with: pip install openai-whisper")

    def transcribe(self, audio_path: str) -> Tuple[str, float]:
        """
        Transcribe audio using local Whisper model

        Args:
            audio_path: Path to audio file

        Returns:
            Tuple of (transcribed_text, confidence_score)
        """
        logger.info(f"Transcribing with {self.provider_name}: {audio_path}")

        # Placeholder for actual implementation
        # In production, use:
        # import whisper
        # result = self.model.transcribe(audio_path, language='th')
        # return result['text'], confidence_score

        # Placeholder response
        return "Transcribed text from local Whisper...", 0.92

    def validate_audio(self, audio_path: str) -> bool:
        """Validate audio file for local Whisper"""
        path = Path(audio_path)
        supported_formats = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'}
        return path.suffix.lower() in supported_formats


class ExternalWhisperClient(STTAPIClient):
    """External Whisper API Client (Docker/Server based)"""

    def __init__(self, api_key: str = None, config: Dict = None):
        """Initialize External Whisper Client"""
        super().__init__(api_key, config)
        self.provider_name = "External Whisper API"
        config = config or {}
        
        # Server connection
        self.server_ip = config.get('server_ip', '192.168.10.19')
        self.port = config.get('port', '8100')
        self.endpoint = f"http://{self.server_ip}:{self.port}/v1/media/transcribe"
        
        # Transcription parameters
        self.language = config.get('language', 'th')
        self.task = config.get('task', 'transcribe')
        self.output_format = config.get('output_format', 'json')
        self.include_segments = config.get('include_segments', True)
        self.include_word_timestamps = config.get('include_word_timestamps', False)
        self.include_speaker_labels = config.get('include_speaker_labels', False)
        
        # Advanced parameters
        self.max_speakers = config.get('max_speakers', None)
        self.beam_size = config.get('beam_size', 5)
        self.temperature = config.get('temperature', 0.0)
        self.max_words_per_line = config.get('max_words_per_line', None)
        self.request_id = config.get('id', None)

        logger.info(f"Initialized {self.provider_name} at {self.endpoint}")

    # MIME type map for common audio extensions
    _MIME_MAP = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.mp4': 'audio/mp4',
        '.flac': 'audio/flac',
        '.ogg': 'audio/ogg',
        '.webm': 'audio/webm',
    }

    def _is_server_reachable(self) -> bool:
        """Quick socket check (3-second timeout) before attempting full request."""
        import socket
        try:
            with socket.create_connection((self.server_ip, int(self.port)), timeout=3):
                return True
        except (socket.timeout, ConnectionRefusedError, OSError):
            return False

    def transcribe(self, audio_path: str) -> Tuple[str, float]:
        """Transcribe audio: upload to Cloudflare R2, pass public URL to Whisper, delete after done."""
        logger.info(f"Transcribing with {self.provider_name}: {audio_path}")
        try:
            import requests

            audio_path_obj = Path(audio_path)
            if not audio_path_obj.exists():
                logger.error(f"Audio file not found: {audio_path}")
                return "", 0.0

            if not self._is_server_reachable():
                logger.warning(f"External Whisper: server {self.server_ip}:{self.port} ไม่สามารถเชื่อมต่อได้ (skipping)")
                return f"[Transcription failed: ไม่สามารถเชื่อมต่อ Whisper server ({self.server_ip}:{self.port}) ได้]", 0.0

            # ── Upload to Cloudflare R2 ───────────────────────────────────────────
            r2_key = self._r2_upload(audio_path_obj)
            if not r2_key:
                return "[Transcription failed: R2 upload error]", 0.0

            r2_public_url = os.getenv('R2_PUBLIC_URL', '').rstrip('/')
            media_url = f"{r2_public_url}/{r2_key}"
            logger.info(f"External Whisper media_url: {media_url}")

            try:
                # Build payload with all supported parameters
                payload = {
                    "media_url": media_url,
                    "task": self.task,
                    "language": self.language,
                    "output_format": self.output_format,
                    "include_segments": self.include_segments,
                    "include_word_timestamps": self.include_word_timestamps,
                    "include_speaker_labels": self.include_speaker_labels,
                    "beam_size": self.beam_size,
                    "temperature": self.temperature,
                }
                
                # Add optional parameters only if set
                if self.max_speakers is not None:
                    payload["max_speakers"] = self.max_speakers
                if self.max_words_per_line is not None:
                    payload["max_words_per_line"] = self.max_words_per_line
                if self.request_id is not None:
                    payload["id"] = self.request_id
                
                logger.debug(f"Payload: {payload}")
                response = requests.post(self.endpoint, json=payload, timeout=(10, 600))

                # If speaker diarization unavailable, retry without it
                if response.status_code == 400 and self.include_speaker_labels:
                    logger.warning("Speaker diarization unavailable — retrying without speaker labels")
                    payload["include_speaker_labels"] = False
                    response = requests.post(self.endpoint, json=payload, timeout=(10, 600))
            finally:
                self._r2_delete(r2_key)

            if response.status_code == 200:
                result = response.json()
                # API response shape: { code, response: { text, segments, detected_language, ... }, message, processing_time }
                inner = result.get("response") or result
                text = (inner.get("text") or inner.get("transcription") or inner.get("transcript") or "")
                
                # If no text but has segments, combine them
                if not text:
                    segments = inner.get("segments") or []
                    text = " ".join(s.get("text", "") for s in segments if s.get("text")).strip()
                
                # Extract confidence from response or use default
                confidence = result.get("confidence", 0.88)
                if not confidence or confidence < 0.01:
                    confidence = 0.88  # Default confidence
                # Cap confidence at 0.99
                confidence = min(confidence, 0.99)
                
                processing_time = result.get("processing_time", 0)
                logger.info(f"✓ External Whisper complete: {len(text)} chars, processing_time={processing_time}s")
                return text, confidence
            else:
                err_body = response.text[:400]
                logger.error(f"External Whisper API error: {response.status_code} {err_body}")
                return f"[Transcription failed: HTTP {response.status_code}]", 0.0

        except requests.exceptions.ConnectTimeout:
            logger.error(f"External Whisper: connection timeout to {self.endpoint}")
            return f"[Transcription failed: ไม่สามารถเชื่อมต่อ Whisper server ({self.server_ip}:{self.port}) ได้]", 0.0
        except requests.exceptions.ConnectionError:
            logger.error(f"External Whisper: connection error to {self.endpoint}")
            return f"[Transcription failed: Whisper server ({self.server_ip}:{self.port}) ไม่ตอบสนอง]", 0.0
        except Exception as e:
            logger.error(f"External Whisper error: {e}")
            return f"[Transcription failed: {str(e)}]", 0.0

    def _r2_client(self):
        """Create a boto3 S3 client pointed at Cloudflare R2."""
        import boto3
        account_id  = os.getenv('R2_ACCOUNT_ID', '')
        access_key  = os.getenv('R2_ACCESS_KEY_ID', '')
        secret_key  = os.getenv('R2_SECRET_ACCESS_KEY', '')
        endpoint    = f"https://{account_id}.r2.cloudflarestorage.com"
        return boto3.client(
            's3',
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name='auto',
        )

    def _r2_upload(self, audio_path_obj: Path) -> str:
        """Upload file to R2; returns object key or empty string on error."""
        import uuid
        bucket  = os.getenv('R2_BUCKET', 'stt-audio-temp')
        key     = f"tmp/{uuid.uuid4().hex}{audio_path_obj.suffix}"
        mime    = self._MIME_MAP.get(audio_path_obj.suffix.lower(), 'audio/mpeg')
        try:
            client = self._r2_client()
            client.upload_file(
                str(audio_path_obj), bucket, key,
                ExtraArgs={'ContentType': mime},
            )
            logger.info(f"R2 upload OK: {key}")
            return key
        except Exception as e:
            logger.error(f"R2 upload failed: {e}")
            return ''

    def _r2_delete(self, key: str):
        """Delete object from R2 after Whisper has downloaded it."""
        bucket = os.getenv('R2_BUCKET', 'stt-audio-temp')
        try:
            self._r2_client().delete_object(Bucket=bucket, Key=key)
            logger.info(f"R2 deleted: {key}")
        except Exception as e:
            logger.warning(f"R2 delete failed (non-critical): {e}")

            if response.status_code == 200:
                result = response.json()
                # Shape: { code, message, response: { text, segments, detected_language } }
                inner = result.get("response") or result
                text = (inner.get("text") or inner.get("transcription") or inner.get("transcript") or "")
                if not text:
                    segments = inner.get("segments") or []
                    text = " ".join(s.get("text", "") for s in segments if s.get("text")).strip()
                confidence = inner.get("confidence", 0.88)
                logger.info(f"✓ External Whisper complete: {len(text)} chars")
                return text, confidence
            else:
                err_body = response.text[:400]
                logger.error(f"External Whisper API error: {response.status_code} {err_body}")
                return f"[Transcription failed: HTTP {response.status_code}]", 0.0

        except requests.exceptions.ConnectTimeout:
            logger.error(f"External Whisper: connection timeout to {self.endpoint}")
            return f"[Transcription failed: ไม่สามารถเชื่อมต่อ Whisper server ({self.server_ip}:{self.port}) ได้]", 0.0
        except requests.exceptions.ConnectionError:
            logger.error(f"External Whisper: connection error to {self.endpoint}")
            return f"[Transcription failed: Whisper server ({self.server_ip}:{self.port}) ไม่ตอบสนอง]", 0.0
        except Exception as e:
            logger.error(f"External Whisper error: {e}")
            return f"[Transcription failed: {str(e)}]", 0.0

    def validate_audio(self, audio_path: str) -> bool:
        """Validate audio file for External Whisper"""
        path = Path(audio_path)
        supported_formats = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'}
        return path.suffix.lower() in supported_formats


class MAITranscribeClient(STTAPIClient):
    """MAI Transcribe API (Azure Speech REST) Client"""

    def __init__(self, api_key: str, config: Dict = None):
        super().__init__(api_key, config)
        self.provider_name = "MAI Transcribe API"
        self.endpoint = config.get('endpoint', 'https://mai-speech.cognitiveservices.azure.com/') if config else 'https://mai-speech.cognitiveservices.azure.com/'
        self.language = config.get('language', 'th-TH') if config else 'th-TH'
        self.api_version = config.get('api_version', '2025-10-15') if config else '2025-10-15'
        logger.info(f"Initialized {self.provider_name} at {self.endpoint}")

    def transcribe(self, audio_path: str) -> Tuple[str, float]:
        """Transcribe audio using MAI Transcribe REST API"""
        logger.info(f"Transcribing with {self.provider_name}: {audio_path}")
        try:
            import requests
            audio_path_obj = Path(audio_path)
            if not audio_path_obj.exists():
                logger.error(f"Audio file not found: {audio_path}")
                return "", 0.0
            url = f"{self.endpoint.rstrip('/')}/speechtotext/transcriptions:transcribe?api-version={self.api_version}"
            headers = {"Ocp-Apim-Subscription-Key": self.api_key}
            definition = {"locales": [self.language], "profanityFilterMode": "None", "channels": [0, 1]}
            import json as _json
            _MIME = {'.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4',
                     '.mp4':'audio/mp4','.flac':'audio/flac','.ogg':'audio/ogg','.webm':'audio/webm'}
            mime = _MIME.get(audio_path_obj.suffix.lower(), 'audio/wav')
            with open(audio_path, "rb") as f:
                files = {
                    "audio": (audio_path_obj.name, f, mime),
                    "definition": (None, _json.dumps(definition), "application/json")
                }
                response = requests.post(url, headers=headers, files=files, timeout=300)
            if response.status_code == 200:
                result = response.json()
                combined = result.get("combinedPhrases", [])
                text = " ".join(p.get("text", "") for p in combined) if combined else ""
                confidence = 0.93
                logger.info(f"✓ Transcription complete: {len(text)} chars")
                return text, confidence
            else:
                logger.error(f"MAI API error: {response.status_code} {response.text}")
                return f"[Transcription failed: HTTP {response.status_code}]", 0.0
        except Exception as e:
            logger.error(f"MAI Transcribe error: {e}")
            return f"[Transcription failed: {str(e)}]", 0.0

    def validate_audio(self, audio_path: str) -> bool:
        path = Path(audio_path)
        return path.suffix.lower() in {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'}


class STTAPIManager:
    """Manager for multiple STT API clients"""

    PROVIDER_MAP = {
        "azure": AzureSTTClient,
        "external": ExternalWhisperClient,
        "mai": MAITranscribeClient,
        "openai": OpenAIWhisperClient,
        "local": LocalWhisperClient,
        "google": GoogleSTTClient,
    }

    def __init__(self, models_config: list):
        import os
        
        # Check if mock mode is enabled
        mock_mode = os.getenv('MOCK_MODE', 'false').lower() == 'true'
        
        if mock_mode:
            logger.warning("⚠️  MOCK MODE ENABLED - Using simulated API responses for testing")
            # Import mock clients
            from mock_stt import MockAzureSTTClient, MockWhisperClient, MockMAITranscribeClient
            self.clients = {
                'model1': MockAzureSTTClient(config={'language': 'th-TH'}),
                'model2': MockWhisperClient(config={'endpoint': 'http://192.168.10.19:8100'}),
                'model3': MockMAITranscribeClient(config={'endpoint': 'https://mai-speech.cognitiveservices.azure.com/'})
            }
            logger.info("✓ Loaded 3 mock STT clients")
            return
        
        # Real API mode
        self.clients: Dict[str, STTAPIClient] = {}
        for engine in models_config:
            if not engine.get("enabled", True):
                continue
            model_id = engine.get("id", engine.get("name", "unknown"))
            provider = engine.get("provider", "").lower()
            api_key_env = engine.get("api_key", "")
            api_key = os.getenv(api_key_env, api_key_env) if api_key_env != "none" else None
            config = engine.get("configuration", {})
            config.update({k: v for k, v in engine.items() if k not in ("id", "name", "provider", "api_key", "configuration", "enabled", "priority", "performance") and v != ""})
            client_class = self.PROVIDER_MAP.get(provider)
            if client_class:
                try:
                    self.clients[model_id] = client_class(api_key, config)
                    logger.info(f"Registered STT client: {model_id} ({provider})")
                except Exception as e:
                    logger.warning(f"Failed to initialize {model_id}: {e}")
            else:
                logger.warning(f"Unknown STT provider: {provider}")

    def get_available_clients(self) -> list:
        return list(self.clients.keys())

    def transcribe_with_all(self, audio_path: str) -> Dict[str, Tuple[str, float]]:
        results = {}
        for model_id, client in self.clients.items():
            try:
                logger.info(f"Running {model_id}...")
                text, confidence = client.transcribe(audio_path)
                results[model_id] = (text, confidence)
            except Exception as e:
                logger.error(f"{model_id} failed: {e}")
                results[model_id] = (f"[Error: {str(e)}]", 0.0)
        return results

  