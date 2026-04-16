import os

PORT = int(os.getenv("PORT", "5772"))
TIMEOUT_SECONDS = int(os.getenv("TIMEOUT_SECONDS", "1200"))
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "large-v3")
DEVICE = os.getenv("DEVICE", "cuda")
COMPUTE_TYPE = os.getenv("COMPUTE_TYPE", "float16")
HUGGINGFACE_TOKEN = os.getenv("HUGGINGFACE_TOKEN", "")
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
TEMP_DIR = os.getenv("TEMP_DIR", "/tmp/whisperx")
