import logging
from abc import ABC, abstractmethod

import httpx

from src.core.config import get_settings

logger = logging.getLogger(__name__)


class TranslationConfigError(Exception):
    """Raised when translation provider is not configured."""


class TranslationServiceError(Exception):
    """Raised when the translation API is unavailable or returns an error."""


class TranslationProvider(ABC):
    @abstractmethod
    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate text from source language to target language.

        Args:
            text: Text to translate
            source_lang: ISO 639-1 language code (e.g. "en", "hi")
            target_lang: ISO 639-1 language code (e.g. "en", "hi")
        """

    @abstractmethod
    async def translate_batch(
        self, texts: list[str], source_lang: str, target_lang: str
    ) -> list[str]:
        """Translate multiple texts from source language to target language.

        Args:
            texts: List of texts to translate
            source_lang: ISO 639-1 language code (e.g. "en", "hi")
            target_lang: ISO 639-1 language code (e.g. "en", "hi")
        """


class OpenAICompatibleTranslationProvider(TranslationProvider):
    """OpenAI-compatible /chat/completions endpoint for translation."""

    def __init__(self, base_url: str, api_key: str | None, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        if not self.base_url.endswith("/v1"):
            self.base_url = f"{self.base_url}/v1"
        self.api_key = api_key
        self.model = model

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate a single text."""
        if not text or not text.strip():
            return text
        if source_lang == target_lang:
            return text

        results = await self.translate_batch([text], source_lang, target_lang)
        return results[0] if results else text

    async def translate_batch(
        self, texts: list[str], source_lang: str, target_lang: str
    ) -> list[str]:
        """Translate multiple texts."""
        if not texts:
            return []
        if source_lang == target_lang:
            return texts

        # Filter out empty texts but preserve indices for mapping back
        non_empty_texts = [t for t in texts if t and t.strip()]
        if not non_empty_texts:
            return texts

        # Build prompt for translation
        prompt = (
            f"Translate the following texts from {source_lang} to {target_lang}. "
            f"Return ONLY the translated texts, one per line, in the same order as the input.\n\n"
        )
        for text in non_empty_texts:
            prompt += f"- {text}\n"

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.0,
                    },
                    headers=headers,
                )
                response.raise_for_status()
                data = response.json()

                choices = data.get("choices") or []
                if not choices:
                    raise TranslationServiceError("Translation API returned no choices.")

                message = choices[0].get("message") or {}
                content = message.get("content", "").strip()
                if not content:
                    raise TranslationServiceError("Translation API returned empty content.")

                # Parse the translated texts (one per line)
                translated_lines = [line.strip() for line in content.split("\n") if line.strip()]

                # Map back to original texts with empty values preserved
                result = []
                translated_idx = 0
                for original_text in texts:
                    if original_text and original_text.strip():
                        if translated_idx < len(translated_lines):
                            result.append(translated_lines[translated_idx])
                            translated_idx += 1
                        else:
                            result.append(original_text)  # Fallback to original
                    else:
                        result.append(original_text)  # Preserve empty strings
                return result

        except httpx.HTTPStatusError as e:
            raise TranslationServiceError(
                f"Translation API returned {e.response.status_code}. Please try again later."
            ) from e
        except httpx.RequestError as e:
            raise TranslationServiceError(
                "Translation service unavailable (timeout or connection error). "
                "Please try again later."
            ) from e
        except (KeyError, TypeError) as e:
            raise TranslationServiceError(
                "Translation API returned unexpected response format."
            ) from e


class SarvamTranslationProvider(TranslationProvider):
    """Sarvam AI translation API for Indian languages + English.

    Supports 23 languages via Sarvam Translate (22 Indian + English).
    See https://docs.sarvam.ai/api-reference-docs/getting-started/models
    """

    # ISO 639-1 to Sarvam language code mapping
    LANG_CODE_MAP = {
        "hi": "hi-IN",  # Hindi
        "bn": "bn-IN",  # Bengali
        "ta": "ta-IN",  # Tamil
        "te": "te-IN",  # Telugu
        "gu": "gu-IN",  # Gujarati
        "kn": "kn-IN",  # Kannada
        "ml": "ml-IN",  # Malayalam
        "mr": "mr-IN",  # Marathi
        "pa": "pa-IN",  # Punjabi
        "or": "od-IN",  # Odia (note: Sarvam uses 'od' not 'or')
        "as": "as-IN",  # Assamese
        "ur": "ur-IN",  # Urdu
        "ne": "ne-IN",  # Nepali
        "kok": "kok-IN",  # Konkani
        "ks": "ks-IN",  # Kashmiri
        "sd": "sd-IN",  # Sindhi
        "sa": "sa-IN",  # Sanskrit
        "sat": "sat-IN",  # Santali
        "mni": "mni-IN",  # Manipuri
        "brx": "brx-IN",  # Bodo
        "mai": "mai-IN",  # Maithili
        "doi": "doi-IN",  # Dogri
        "en": "en-IN",  # English
    }

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key
        self.base_url = "https://api.sarvam.ai"

    def _to_sarvam_lang(self, lang_code: str) -> str:
        """Convert ISO 639-1 / BCP-47 (or common aliases) to Sarvam language code."""
        raw = (lang_code or "").strip()
        key = raw.lower().replace("_", "-")
        primary = key.split("-", 1)[0] if "-" in key else key
        if primary in ("english", "en"):
            return self.LANG_CODE_MAP["en"]
        if primary in self.LANG_CODE_MAP:
            return self.LANG_CODE_MAP[primary]
        return raw

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate a single text using Sarvam Translate API."""
        if not text or not text.strip():
            return text
        if source_lang == target_lang:
            return text

        results = await self.translate_batch([text], source_lang, target_lang)
        return results[0] if results else text

    async def translate_batch(
        self, texts: list[str], source_lang: str, target_lang: str
    ) -> list[str]:
        """Translate multiple texts using Sarvam Translate API.

        Note: Sarvam's translate endpoint processes one text at a time.
        Requests run sequentially to avoid burst rate limits / partial failures
        that left some strings in English while others translated.
        """
        if not texts:
            return []
        if source_lang == target_lang:
            return texts

        # Filter out empty texts but preserve indices
        indices_to_translate = [i for i, t in enumerate(texts) if t and t.strip()]
        if not indices_to_translate:
            return texts

        source_sarvam = self._to_sarvam_lang(source_lang)
        target_sarvam = self._to_sarvam_lang(target_lang)

        headers = {
            "Content-Type": "application/json",
            "api-subscription-key": self.api_key,
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                result = list(texts)
                for idx in indices_to_translate:
                    payload = {
                        "input": texts[idx],
                        "source_language_code": source_sarvam,
                        "target_language_code": target_sarvam,
                    }
                    translated_out: str | None = None
                    for attempt in range(2):
                        try:
                            r = await client.post(
                                f"{self.base_url}/translate",
                                json=payload,
                                headers=headers,
                            )
                            r.raise_for_status()
                            data = r.json()
                            t = data.get("translated_text", "").strip()
                            if t:
                                translated_out = t
                                break
                            logger.warning(
                                "Sarvam returned empty translation for index %s (attempt %s)",
                                idx,
                                attempt + 1,
                            )
                        except httpx.HTTPStatusError as e:
                            logger.warning("Sarvam translation error for index %s: %s", idx, e)
                        except (httpx.RequestError, KeyError, TypeError) as e:
                            logger.warning("Sarvam translation error for index %s: %s", idx, e)
                    if translated_out:
                        result[idx] = translated_out
                return result

        except httpx.RequestError as e:
            raise TranslationServiceError(
                "Sarvam translation service unavailable (timeout or connection error). "
                "Please try again later."
            ) from e


_translation_provider_cache: TranslationProvider | None = None


def get_translation_provider() -> TranslationProvider:
    """Get or create a cached translation provider instance.

    Supports two provider types:
    - "sarvam": Sarvam AI (23 Indian languages + English)
    - "openai": OpenAI-compatible chat endpoint (any LLM)

    Set TRANSLATION_PROVIDER env var to choose (default: "sarvam").
    """
    global _translation_provider_cache

    if _translation_provider_cache is not None:
        return _translation_provider_cache

    settings = get_settings()
    provider_type = settings.translation_provider.lower()

    if provider_type == "sarvam":
        if not settings.translation_api_key:
            raise TranslationConfigError(
                "Sarvam translation provider requires TRANSLATION_API_KEY."
            )
        _translation_provider_cache = SarvamTranslationProvider(
            api_key=settings.translation_api_key
        )
    elif provider_type == "openai":
        if not settings.translation_api_key or not settings.translation_api_base_url:
            raise TranslationConfigError(
                "OpenAI-compatible translation provider requires "
                "TRANSLATION_API_KEY and TRANSLATION_API_BASE_URL."
            )
        _translation_provider_cache = OpenAICompatibleTranslationProvider(
            base_url=settings.translation_api_base_url,
            api_key=settings.translation_api_key,
            model=settings.translation_model,
        )
    else:
        raise TranslationConfigError(
            f"Unknown translation provider: {provider_type}. Use 'sarvam' or 'openai'."
        )

    return _translation_provider_cache
