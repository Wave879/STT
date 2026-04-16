#!/usr/bin/env python3
"""
ทดสอบ Azure Speech SDK แบบ Continuous Recognition + Diarization
รองรับทั้ง stereo (2 channels) และ mono
"""
import os, sys, time, threading
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env')

import azure.cognitiveservices.speech as speechsdk

KEY    = os.getenv('AZURE_SPEECH_KEY', '')
REGION = os.getenv('AZURE_SPEECH_REGION', 'southeastasia')
LANG   = os.getenv('AZURE_SPEECH_LANGUAGE', 'th-TH')

# ไฟล์ทดสอบ
AUDIO_FILE = Path(__file__).parent.parent / 'web' / 'uploads' / '07a78e25.mp3'

def ensure_wav(audio_path: Path) -> Path:
    """
    ถ้าไม่ใช่ WAV ให้แปลงเป็น WAV 16kHz mono ก่อน
    ใช้ miniaudio (ไม่ต้องการ ffmpeg/GStreamer)
    คืนค่า path ของ WAV file
    """
    if audio_path.suffix.lower() == '.wav':
        return audio_path

    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from audio_preprocessor import AudioPreprocessor

    out_path = audio_path.parent / f"{audio_path.stem}_converted.wav"
    if out_path.exists():
        print(f"[CACHE] Using existing WAV: {out_path.name}")
        return out_path

    print(f"[CONVERT] {audio_path.name} → {out_path.name} ...")
    processor = AudioPreprocessor()
    ok, result = processor.convert_to_wav(str(audio_path), str(out_path))
    if not ok:
        raise RuntimeError(f"แปลงไฟล์ไม่สำเร็จ: {result}")
    return out_path


def _make_wav_audio_config(audio_path: Path) -> speechsdk.audio.AudioConfig:
    """แปลงไฟล์เป็น WAV แล้วสร้าง AudioConfig สำหรับ Azure Speech SDK"""
    wav_path = ensure_wav(audio_path)
    return speechsdk.audio.AudioConfig(filename=str(wav_path))


def test_diarization(audio_path: Path):
    """Conversation Transcription — แยกผู้พูดได้"""
    print(f"\n{'='*60}")
    print("MODE: Conversation Transcription (Diarization)")
    print(f"File: {audio_path.name} ({audio_path.stat().st_size/1024:.1f} KB)")
    print('='*60)

    speech_config = speechsdk.SpeechConfig(subscription=KEY, region=REGION)
    speech_config.speech_recognition_language = LANG
    speech_config.request_word_level_timestamps()
    speech_config.output_format = speechsdk.OutputFormat.Detailed

    audio_config = _make_wav_audio_config(audio_path)

    transcriber = speechsdk.transcription.ConversationTranscriber(
        speech_config=speech_config,
        audio_config=audio_config
    )

    results = []
    done = threading.Event()

    def on_transcribed(evt):
        if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
            spk = evt.result.speaker_id or "Unknown"
            txt = evt.result.text
            offset_sec = evt.result.offset / 10_000_000
            mins = int(offset_sec) // 60
            secs = int(offset_sec) % 60
            line = f"[{mins:02d}:{secs:02d}] [{spk}]: {txt}"
            results.append(line)
            print(line)
        elif evt.result.reason == speechsdk.ResultReason.NoMatch:
            print(f"  (NoMatch: {evt.result.no_match_details})")

    def on_canceled(evt):
        if evt.result.cancellation_details.reason == speechsdk.CancellationReason.Error:
            print(f"ERROR: {evt.result.cancellation_details.error_details}")
        done.set()

    def on_stopped(evt):
        done.set()

    transcriber.transcribed.connect(on_transcribed)
    transcriber.canceled.connect(on_canceled)
    transcriber.session_stopped.connect(on_stopped)

    print("กำลังถอดความ...\n")
    transcriber.start_transcribing_async().get()
    done.wait(timeout=300)
    transcriber.stop_transcribing_async().get()

    print(f"\n{'='*60}")
    print(f"สรุป: {len(results)} ประโยค")
    speakers = set()
    for r in results:
        parts = r.split('] [')
        if len(parts) >= 2:
            spk = parts[1].rstrip(']:').rstrip(']').split(']:')[0]
            speakers.add(spk)
    print(f"ผู้พูดที่พบ: {speakers if speakers else 'ไม่สามารถแยกได้'}")
    return results


def test_single_shot(audio_path: Path):
    """Single-shot recognition (ไม่มี diarization แต่เร็ว)"""
    print(f"\n{'='*60}")
    print("MODE: Single-shot Recognition (fast, no diarization)")
    print(f"File: {audio_path.name}")
    print('='*60)

    speech_config = speechsdk.SpeechConfig(subscription=KEY, region=REGION)
    speech_config.speech_recognition_language = LANG
    speech_config.output_format = speechsdk.OutputFormat.Detailed

    audio_config = _make_wav_audio_config(audio_path)
    recognizer = speechsdk.SpeechRecognizer(
        speech_config=speech_config,
        audio_config=audio_config
    )

    results = []
    done = threading.Event()

    def on_recognized(evt):
        if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
            offset_sec = evt.result.offset / 10_000_000
            mins = int(offset_sec) // 60
            secs = int(offset_sec) % 60
            line = f"[{mins:02d}:{secs:02d}]: {evt.result.text}"
            results.append(line)
            print(line)

    def on_canceled(evt):
        if evt.result.cancellation_details.reason == speechsdk.CancellationReason.Error:
            print(f"ERROR: {evt.result.cancellation_details.error_details}")
        done.set()

    def on_stopped(evt):
        done.set()

    recognizer.recognized.connect(on_recognized)
    recognizer.canceled.connect(on_canceled)
    recognizer.session_stopped.connect(on_stopped)

    print("กำลังถอดความ...\n")
    recognizer.start_continuous_recognition_async().get()
    done.wait(timeout=300)
    recognizer.stop_continuous_recognition_async().get()

    print(f"\nสรุป: {len(results)} ประโยค")
    return results


if __name__ == '__main__':
    if not KEY:
        print("ERROR: AZURE_SPEECH_KEY ไม่ได้ตั้งค่า")
        sys.exit(1)

    # รับ argument: [mode] [audio_file]
    mode = 'diarize'
    target_file = AUDIO_FILE

    for arg in sys.argv[1:]:
        if arg in ('diarize', 'single'):
            mode = arg
        elif Path(arg).exists():
            target_file = Path(arg)

    if not target_file.exists():
        print(f"ERROR: ไม่พบไฟล์ {target_file}")
        sys.exit(1)

    if mode == 'single':
        test_single_shot(target_file)
    else:
        try:
            test_diarization(target_file)
        except Exception as e:
            print(f"\nDiarization error: {e}")
            print("ลองโหมด single-shot แทน...")
            test_single_shot(target_file)
