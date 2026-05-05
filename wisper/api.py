from fastapi import FastAPI, UploadFile, File, Form, HTTPException
import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import os
import time
import shutil
import torchaudio

# Optional Windows fallback for local development (CapCut ffmpeg)
ffmpeg_path = r"C:\Users\wave\AppData\Local\CapCut\Apps\8.1.1.3417\ffmpeg.exe"
if os.name == "nt" and os.path.exists(ffmpeg_path):
    os.environ["PATH"] += os.pathsep + os.path.dirname(ffmpeg_path)

app = FastAPI(title="Optimized Whisper API")

# ── GPU detection ──────────────────────────────────────────────────────────────
def detect_gpu():
    """
    Detect GPU and return (device, dtype, batch_size, attn_impl).

    GPU tiers:
      RTX 5070 Ti / 5080 / 5090  (Blackwell sm_100, VRAM ≥ 16 GB)
        → float16, batch 16, flash_attention_2 (requires PyTorch ≥ 2.7 + CUDA 12.8)
      RTX 3090 / 4090 / A100 etc (Ampere+ sm_80+, VRAM ≥ 16 GB)
        → float16, batch 16, flash_attention_2
      RTX 2060 / 3060 / 3070 etc (Turing/Ampere, VRAM < 16 GB)
        → float16, batch 8, sdpa
      CPU fallback
        → float32, batch 1, sdpa
    """
    if not torch.cuda.is_available():
        print("⚠️  No CUDA GPU found — running on CPU (slow)", flush=True)
        return "cpu", torch.float32, 1, "sdpa"

    gpu_name  = torch.cuda.get_device_name(0).upper()
    vram_gb   = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    sm_major  = torch.cuda.get_device_properties(0).major  # compute capability major

    print(f"🎮 GPU detected: {torch.cuda.get_device_name(0)}", flush=True)
    print(f"   VRAM: {vram_gb:.1f} GB  |  Compute: sm_{sm_major}{torch.cuda.get_device_properties(0).minor}", flush=True)
    print(f"   PyTorch: {torch.__version__}  |  CUDA: {torch.version.cuda}", flush=True)

    # Blackwell (RTX 50xx) — sm_10x
    if sm_major >= 10:
        # flash_attention_2 requires PyTorch ≥ 2.7 on Blackwell
        pt_major, pt_minor = [int(x) for x in torch.__version__.split(".")[:2]]
        attn = "flash_attention_2" if (pt_major > 2 or (pt_major == 2 and pt_minor >= 7)) else "sdpa"
        batch = 16
        print(f"   → Blackwell tier: dtype=float16, batch={batch}, attn={attn}", flush=True)
        return "cuda:0", torch.float16, batch, attn

    # Ampere+ (RTX 30xx / 40xx / A100) with large VRAM
    if sm_major >= 8 and vram_gb >= 16:
        attn = "flash_attention_2"
        batch = 16
        print(f"   → High-end Ampere+ tier: dtype=float16, batch={batch}, attn={attn}", flush=True)
        return "cuda:0", torch.float16, batch, attn

    # Turing / mid-range Ampere (RTX 20xx / 30xx with < 16 GB)
    if sm_major >= 7:
        batch = 8
        print(f"   → Mid-range GPU tier: dtype=float16, batch={batch}, attn=sdpa", flush=True)
        return "cuda:0", torch.float16, batch, "sdpa"

    # Older GPU — safe fallback
    print("   → Legacy GPU tier: dtype=float32, batch=4, attn=sdpa", flush=True)
    return "cuda:0", torch.float32, 4, "sdpa"


DEVICE, TORCH_DTYPE, BATCH_SIZE, ATTN_IMPL = detect_gpu()

# Global model (lazy-loaded on first request)
pipe = None


def load_audio(file_path):
    """Load audio file → 16 kHz mono numpy array via torchaudio (no ffmpeg needed)."""
    waveform, sample_rate = torchaudio.load(file_path)
    if sample_rate != 16000:
        waveform = torchaudio.transforms.Resample(sample_rate, 16000)(waveform)
    if waveform.shape[0] > 1:
        waveform = torch.mean(waveform, dim=0, keepdim=True)
    return waveform.squeeze().numpy()


def load_model():
    global pipe
    if pipe is not None:
        return pipe

    print("Loading Whisper large-v3 model...", flush=True)
    model_id = "openai/whisper-large-v3"

    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        model_id,
        torch_dtype=TORCH_DTYPE,
        low_cpu_mem_usage=True,
        use_safetensors=True,
        attn_implementation=ATTN_IMPL,
    )
    model.to(DEVICE)

    processor = AutoProcessor.from_pretrained(model_id)

    pipe = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        max_new_tokens=448,
        chunk_length_s=30,
        batch_size=BATCH_SIZE,
        return_timestamps=True,
        torch_dtype=TORCH_DTYPE,
        device=DEVICE,
    )
    print(f"✅ Model loaded on {DEVICE} (dtype={TORCH_DTYPE}, batch={BATCH_SIZE}, attn={ATTN_IMPL})", flush=True)
    return pipe


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("openai/whisper-large-v3"),
    language: str = Form("th"),
    device: str = Form("cuda"),
    chunk_seconds: float = Form(30.0),
    max_new_tokens: int = Form(440),
):
    start_time = time.time()
    os.makedirs("temp", exist_ok=True)
    temp_path = os.path.join("temp", f"{int(time.time())}_{file.filename}")

    try:
        with open(temp_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)

        audio_data = load_audio(temp_path)

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        p = load_model()

        result = p(
            audio_data,
            generate_kwargs={"language": language, "max_new_tokens": max_new_tokens},
            chunk_length_s=chunk_seconds,
        )

        elapsed = time.time() - start_time
        print(f"✅ Transcribed in {elapsed:.1f}s on {DEVICE}", flush=True)

        return {
            "text": result["text"],
            "chunks": result.get("chunks", []),
            "processing_time": elapsed,
            "device": DEVICE,
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
        }

    except Exception as e:
        print(f"❌ Transcription error: {e}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if os.path.exists(temp_path):
            for _ in range(5):
                try:
                    os.remove(temp_path)
                    break
                except PermissionError:
                    time.sleep(0.5)


@app.get("/")
async def root():
    gpu_info = {
        "name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
        "vram_gb": round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 1) if torch.cuda.is_available() else 0,
    }
    return {
        "status": "online",
        "model": "openai/whisper-large-v3",
        "device": DEVICE,
        "dtype": str(TORCH_DTYPE),
        "batch_size": BATCH_SIZE,
        "attn_impl": ATTN_IMPL,
        "gpu": gpu_info,
    }
