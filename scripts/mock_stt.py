#!/usr/bin/env python3
"""
Mock STT API Clients
For testing and sandbox environments with limited network access

Provides mock implementations that simulate real STT API responses
without requiring actual API connections.
"""

import os
import logging
from typing import Dict, Optional, Tuple
from pathlib import Path
import random

logger = logging.getLogger(__name__)


class MockAzureSTTClient:
    """Mock Microsoft Azure Speech Services Client"""

    def __init__(self, api_key: str = None, config: Dict = None):
        """Initialize mock Azure STT Client"""
        self.provider_name = "Mock Azure Speech Services"
        self.language = config.get('language', 'th-TH') if config else 'th-TH'
        logger.info(f"✓ Initialized {self.provider_name} (MOCK MODE)")

    def transcribe(self, audio_path: str) -> Tuple[str, float]:
        """Return mock Azure transcription"""
        logger.info(f"[MOCK] Transcribing with {self.provider_name}: {audio_path}")
        
        # Simulate processing time
        import time
        time.sleep(1)
        
        mock_text = os.getenv('MOCK_AZURE_RESPONSE', 
            'สวัสดีครับ นี่คือประเมินจาก Azure Speech Services ข้อความตัวอย่างสำหรับการทดสอบระบบทำงาน')
        confidence = 0.91
        
        logger.info(f"✓ [MOCK] Azure transcription complete")
        return mock_text, confidence

    def validate_audio(self, audio_path: str) -> bool:
        """Mock validation"""
        path = Path(audio_path)
        supported_formats = {'.wav', '.mp3', '.m4a', '.flac', '.ogg', '.webm'}
        return path.suffix.lower() in supported_formats


class MockWhisperClient:
    """Mock Docker Whisper API Client"""

    def __init__(self, api_key: str = None, config: Dict = None):
        """Initialize mock Whisper Client"""
        self.provider_name = "Mock Docker Whisper API"
        self.endpoint = config.get('endpoint', 'http://localhost:8100') if config else 'http://localhost:8100'
        logger.info(f"✓ Initialized {self.provider_name} (MOCK MODE)")

    def transcribe(self, audio_path: str) -> Tuple[str, float]:
        """Return mock Whisper transcription"""
        logger.info(f"[MOCK] Transcribing with {self.provider_name}: {audio_path}")
        
        # Simulate processing time
        import time
        time.sleep(1.2)
        
        mock_text = os.getenv('MOCK_WHISPER_RESPONSE',
            'สวัสดี นี่เป็นผลลัพธ์จาก Docker Whisper API เวอร์ชั่นทดสอบสำหรับระบบ')
        confidence = 0.88
        
        logger.info(f"✓ [MOCK] Whisper transcription complete")
        return mock_text, confidence

    def validate_audio(self, audio_path: str) -> bool:
        """Mock validation"""
        path = Path(audio_path)
        supported_formats = {'.wav', '.mp3', '.m4a', '.flac', '.ogg', '.webm'}
        return path.suffix.lower() in supported_formats


class MockMAITranscribeClient:
    """Mock MAI Transcribe API Client"""

    def __init__(self, api_key: str = None, config: Dict = None):
        """Initialize mock MAI Transcribe Client"""
        self.provider_name = "Mock MAI Transcribe API"
        self.endpoint = config.get('endpoint', 'https://mai-speech.cognitiveservices.azure.com/') if config else 'https://mai-speech.cognitiveservices.azure.com/'
        logger.info(f"✓ Initialized {self.provider_name} (MOCK MODE)")

    def transcribe(self, audio_path: str) -> Tuple[str, float]:
        """Return mock MAI transcription"""
        logger.info(f"[MOCK] Transcribing with {self.provider_name}: {audio_path}")
        
        # Simulate processing time
        import time
        time.sleep(0.8)
        
        mock_text = os.getenv('MOCK_MAI_RESPONSE',
            'สวัสดีครับผม นี่คือการทดสอบจาก MAI Transcribe API ผลลัพธ์ที่ประมวลผลแล้ว')
        confidence = 0.93  # MAI typically has highest accuracy
        
        logger.info(f"✓ [MOCK] MAI transcription complete")
        return mock_text, confidence

    def validate_audio(self, audio_path: str) -> bool:
        """Mock validation"""
        path = Path(audio_path)
        supported_formats = {'.wav', '.mp3', '.m4a', '.flac', '.ogg', '.webm', '.mp4', '.avi', '.mov'}
        return path.suffix.lower() in supported_formats


class MockSTTAPIManager:
    """Mock STT API Manager - manages all mock clients"""

    def __init__(self, models_config: list = None):
        """Initialize mock STT API Manager"""
        self.models_config = models_config or []
        self.clients = {
            'model1': MockAzureSTTClient(config={'language': 'th-TH'}),
            'model2': MockWhisperClient(config={'endpoint': 'http://192.168.10.19:8100'}),
            'model3': MockMAITranscribeClient(config={'endpoint': 'https://mai-speech.cognitiveservices.azure.com/'})
        }
        logger.info("✓ MockSTTAPIManager initialized with 3 mock clients")

    def transcribe_with_all(self, audio_path: str) -> Dict[str, Tuple[str, float]]:
        """Transcribe with all mock models in parallel simulation"""
        logger.info(f"[MOCK] Transcribing with all {len(self.clients)} models...")
        
        results = {}
        for model_id, client in self.clients.items():
            try:
                text, confidence = client.transcribe(audio_path)
                results[model_id] = {
                    'text': text,
                    'confidence': confidence,
                    'provider': client.provider_name
                }
            except Exception as e:
                logger.error(f"[MOCK] Error with {model_id}: {e}")
                results[model_id] = {
                    'text': f"[Mock Error: {str(e)}]",
                    'confidence': 0.0,
                    'provider': getattr(client, 'provider_name', 'Unknown')
                }
        
        logger.info(f"✓ [MOCK] All {len(results)} models processed")
        return results

    def get_available_clients(self) -> list:
        """List available mock clients"""
        return list(self.clients.keys())


def enable_mock_mode():
    """Enable mock mode globally"""
    import os
    os.environ['MOCK_MODE'] = 'true'
    logger.info("🔧 MOCK MODE ENABLED - Using simulated API responses")
    logger.warning("⚠️  WARNING: Using mock responses, not real API data")


def disable_mock_mode():
    """Disable mock mode globally"""
    import os
    os.environ['MOCK_MODE'] = 'false'
    logger.info("🔧 MOCK MODE DISABLED - Using real API responses")


def is_mock_mode_enabled() -> bool:
    """Check if mock mode is enabled"""
    return os.getenv('MOCK_MODE', 'false').lower() == 'true'


if __name__ == "__main__":
    # Example usage
    logging.basicConfig(
        level=logging.INFO,
        format='[%(asctime)s] %(levelname)s - %(message)s'
    )
    
    print("\n" + "="*70)
    print("🔧 Mock STT API - Test Mode")
    print("="*70 + "\n")
    
    # Create test audio file path
    test_audio = "input/audio_files/test.wav"
    
    # Initialize mock manager
    manager = MockSTTAPIManager()
    
    # Test transcription
    print("Testing mock transcription...")
    results = manager.transcribe_with_all(test_audio)
    
    print("\n📊 Mock Results:")
    for model_id, result in results.items():
        print(f"\n{model_id.upper()}:")
        print(f"  Provider: {result['provider']}")
        print(f"  Text: {result['text'][:50]}...")
        print(f"  Confidence: {result['confidence']}")
    
    print("\n" + "="*70)
    print("✅ Mock mode test complete!")
    print("="*70)
