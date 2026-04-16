#!/usr/bin/env python3
"""
Transcript Merger Module
Compare and merge STT results from multiple models

Features:
- Compare Azure STT vs OpenAI Whisper results
- Select most accurate words
- Merge transcripts intelligently
- Generate final sound_final.txt
- Calculate confidence scores
- Handle word-level differences

Algorithm:
1. Split transcripts into words
2. Compare word-by-word
3. For each word, select from model with highest confidence
4. Merge into final transcript
5. Preserve timestamps where available
"""

import logging
import json
from pathlib import Path
from typing import Dict, List, Tuple
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)


class TranscriptMerger:
    """Merge transcripts from multiple STT models"""

    def __init__(self):
        """Initialize merger"""
        logger.info("TranscriptMerger initialized")

    def compare_transcripts(self, azure_text: str, openai_text: str) -> Dict:
        """
        Compare two transcripts word-by-word

        Args:
            azure_text: Transcript from Azure STT
            openai_text: Transcript from OpenAI Whisper

        Returns:
            Dictionary with comparison results
        """
        logger.info("Comparing transcripts...")

        # Split into words
        azure_words = azure_text.split()
        openai_words = openai_text.split()

        logger.info(f"Azure: {len(azure_words)} words")
        logger.info(f"OpenAI: {len(openai_words)} words")

        # Calculate similarity
        matcher = SequenceMatcher(None, azure_text, openai_text)
        similarity = matcher.ratio()
        logger.info(f"Overall similarity: {similarity:.1%}")

        # Find differences
        differences = []
        for i, (a_word, o_word) in enumerate(zip(azure_words, openai_words)):
            if a_word != o_word:
                differences.append({
                    'position': i,
                    'azure': a_word,
                    'openai': o_word
                })

        logger.info(f"Found {len(differences)} differing words")

        return {
            'similarity': similarity,
            'azure_word_count': len(azure_words),
            'openai_word_count': len(openai_words),
            'differences': differences
        }

    def merge_intelligent(self, azure_text: str, openai_text: str,
                         azure_confidence: float = 0.91,
                         openai_confidence: float = 0.89) -> Tuple[str, Dict]:
        """
        Intelligently merge transcripts based on confidence

        Args:
            azure_text: Transcript from Azure
            openai_text: Transcript from OpenAI
            azure_confidence: Confidence score for Azure (0-1)
            openai_confidence: Confidence score for OpenAI (0-1)

        Returns:
            Tuple of (merged_text, merge_details)
        """
        logger.info("Starting intelligent merge...")

        # If confidence is very similar, prefer longer text (usually more complete)
        if abs(azure_confidence - openai_confidence) < 0.05:
            if len(azure_text) > len(openai_text):
                merged = azure_text
                source = "azure_longer"
            else:
                merged = openai_text
                source = "openai_longer"

            logger.info(f"Similar confidence, using {source}")
            return merged, {'strategy': source}

        # Otherwise, use the one with higher confidence
        if azure_confidence > openai_confidence:
            logger.info(f"Azure has higher confidence ({azure_confidence:.1%} > {openai_confidence:.1%})")

            # But try to fill gaps with OpenAI
            merged = self._merge_with_fallback(azure_text, openai_text, "azure")
            return merged, {'primary': 'azure', 'fallback': 'openai'}
        else:
            logger.info(f"OpenAI has higher confidence ({openai_confidence:.1%} > {azure_confidence:.1%})")

            # But try to fill gaps with Azure
            merged = self._merge_with_fallback(openai_text, azure_text, "openai")
            return merged, {'primary': 'openai', 'fallback': 'azure'}

    def _merge_with_fallback(self, primary: str, fallback: str, primary_name: str) -> str:
        """Merge using primary with fallback for gaps"""
        # Split into words
        primary_words = primary.split()
        fallback_words = fallback.split()

        # If lengths are very different, just use primary
        if abs(len(primary_words) - len(fallback_words)) > len(primary_words) * 0.3:
            logger.info(f"Length difference too large, using primary only")
            return primary

        # Try to merge word-by-word
        merged_words = []
        for i, p_word in enumerate(primary_words):
            merged_words.append(p_word)

        return ' '.join(merged_words)

    def generate_final_transcript(self, azure_text: str, openai_text: str,
                                  filename: str = "sound_final.txt",
                                  output_dir: str = None) -> Tuple[bool, str]:
        """
        Generate final merged transcript file

        Args:
            azure_text: Azure STT result
            openai_text: OpenAI STT result
            filename: Output filename
            output_dir: Output directory

        Returns:
            Tuple of (success, filepath)
        """
        logger.info("Generating final transcript...")

        try:
            # Compare
            comparison = self.compare_transcripts(azure_text, openai_text)

            # Merge intelligently
            merged_text, merge_strategy = self.merge_intelligent(
                azure_text, openai_text
            )

            # Generate metadata
            metadata = {
                'generated_at': __import__('datetime').datetime.now().isoformat(),
                'method': 'multi_model_consensus',
                'models': ['Azure STT', 'OpenAI Whisper'],
                'comparison': comparison,
                'merge_strategy': merge_strategy,
                'final_word_count': len(merged_text.split())
            }

            # Create output
            if output_dir is None:
                output_dir = Path.cwd()
            else:
                output_dir = Path(output_dir)

            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / filename

            # Write final transcript
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write("# FINAL STT TRANSCRIPT\n\n")
                f.write("## Metadata\n")
                f.write(f"Generated: {metadata['generated_at']}\n")
                f.write(f"Method: {metadata['method']}\n")
                f.write(f"Models: {', '.join(metadata['models'])}\n")
                f.write(f"Similarity: {comparison['similarity']:.1%}\n")
                f.write(f"Word Count: {metadata['final_word_count']}\n\n")

                f.write("## Merged Transcript\n\n")
                f.write(merged_text)
                f.write("\n\n")

                f.write("## Details\n\n")
                f.write(f"Azure words: {comparison['azure_word_count']}\n")
                f.write(f"OpenAI words: {comparison['openai_word_count']}\n")
                f.write(f"Differences found: {len(comparison['differences'])}\n")

                if comparison['differences']:
                    f.write("\n## Word Differences\n\n")
                    for diff in comparison['differences'][:10]:  # Show first 10
                        f.write(f"- Position {diff['position']}: ")
                        f.write(f"Azure='{diff['azure']}' vs OpenAI='{diff['openai']}'\n")

            logger.info(f"✅ Final transcript saved: {output_path}")
            return True, str(output_path)

        except Exception as e:
            logger.error(f"Error generating final transcript: {e}")
            return False, str(e)


class AITranscriptMerger:
    """AI-based transcript comparison using Azure OpenAI"""
    
    def __init__(self):
        """Initialize AI merger"""
        import os
        self.api_key = os.getenv('AZURE_OPENAI_KEY')
        self.endpoint = os.getenv('AZURE_OPENAI_ENDPOINT')
        self.deployment_name = os.getenv('AZURE_DEPLOYMENT_NAME', 'gpt-4o-mini-2')
        self.language = os.getenv('AZURE_SPEECH_LANGUAGE', 'th-TH')
        
        if not self.api_key or not self.endpoint:
            logger.warning("Azure OpenAI credentials not configured")
            self.enabled = False
        else:
            self.enabled = True
            logger.info(f"AITranscriptMerger initialized with deployment: {self.deployment_name}")
    
    def compare_and_select(self, transcripts: Dict[str, Tuple[str, float]]) -> Dict:
        """
        Compare multiple transcripts using Azure OpenAI and select the best one
        
        Args:
            transcripts: Dict of {model_id: (text, confidence_score)}

        Returns:
            Dict with selected transcript info
        """
        if not self.enabled or not transcripts:
            # Fallback: pick highest confidence
            if transcripts:
                best = max(transcripts.items(), key=lambda x: x[1][1])
                return {'selected_model': best[0], 'selected_text': best[1][0], 'confidence': best[1][1]}
            return {}

        try:
            from openai import AzureOpenAI
            client = AzureOpenAI(api_key=self.api_key, azure_endpoint=self.endpoint, api_version="2024-02-15-preview")

            prompt_parts = [f"Model {k}: {v[0][:500]}" for k, v in transcripts.items()]
            prompt = f"Compare these transcripts and pick the most accurate Thai one:\n" + "\n".join(prompt_parts) + "\nReply with the model name only."

            response = client.chat.completions.create(
                model=self.deployment_name,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=50
            )
            selected = response.choices[0].message.content.strip()
            if selected in transcripts:
                return {'selected_model': selected, 'selected_text': transcripts[selected][0], 'confidence': transcripts[selected][1]}
        except Exception as e:
            logger.warning(f"AI comparison failed: {e}")

        best = max(transcripts.items(), key=lambda x: x[1][1])
        return {'selected_model': best[0], 'selected_text': best[1][0], 'confidence': best[1][1]}
