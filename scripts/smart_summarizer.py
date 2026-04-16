#!/usr/bin/env python3
"""
Summarizer - Azure OpenAI summarization for Thai transcripts.
"""

import logging
import os
from pathlib import Path
from typing import Tuple

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env')

logger = logging.getLogger(__name__)

_SYSTEM = "คุณเป็นผู้ช่วยสรุปบทสนทนาจากการประชุม กรุณาสรุปเป็นภาษาไทยให้ชัดเจนและกระชับ"
_USER_TMPL = """สรุปบทถอดเสียงต่อไปนี้เป็นภาษาไทย โดยให้มี:

1. **บทสรุปโดยย่อ** (2-3 ประโยค)
2. **ประเด็นสำคัญ** (bullet 5-7 ข้อ)
3. **Action Items** (ถ้ามี)
4. **ผลการตัดสินใจ** (ถ้ามี)

---
{transcript}"""




class SmartSummarizer:
    """Wrapper class kept for backward compatibility. Use summarize() directly."""

    def summarize(self, text: str, prompt: str = None) -> Tuple[bool, str]:
        result = summarize(text)
        return True, result


def summarize(transcript: str) -> str:
    """
    Summarize transcript text using Azure OpenAI.
    Returns summary as markdown string.
    """
    if not transcript or len(transcript.strip()) < 50:
        return "_(ข้อความสั้นเกินไปสำหรับการสรุป)_"

    key      = os.getenv('AZURE_OPENAI_KEY')
    endpoint = os.getenv('AZURE_OPENAI_ENDPOINT')
    deploy   = os.getenv('AZURE_DEPLOYMENT_NAME', 'gpt-4o-mini-2')

    if not key or not endpoint:
        logger.warning("Azure OpenAI credentials not configured")
        return "_(ไม่สามารถสรุปได้ — ไม่พบ AZURE_OPENAI_KEY / AZURE_OPENAI_ENDPOINT)_"

    try:
        from openai import AzureOpenAI
        client = AzureOpenAI(api_key=key, azure_endpoint=endpoint, api_version="2024-02-01")
        resp = client.chat.completions.create(
            model=deploy,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user",   "content": _USER_TMPL.format(transcript=transcript)},
            ],
            max_tokens=2000,
            temperature=0.3,
        )
        return resp.choices[0].message.content.strip()
    except Exception as exc:
        logger.error(f"Summarization failed: {exc}")
        return f"_(สรุปไม่สำเร็จ: {exc})_"
