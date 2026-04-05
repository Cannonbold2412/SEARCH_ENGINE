import asyncio
import json
import logging
from abc import ABC, abstractmethod
from typing import Any

import httpx

from src.core import get_settings
from src.prompts.search_filters import (
    get_cleanup_prompt,
    get_single_extract_prompt,
)
from src.utils import extract_json_from_llm_response

logger = logging.getLogger(__name__)


class ChatServiceError(Exception):
    """Raised when the chat/LLM API is unavailable or returns invalid output."""


class ChatRateLimitError(ChatServiceError):
    """Raised when the chat/LLM API rate limits the request."""


class ChatBadRequestError(ChatServiceError):
    """Raised when the chat API rejects the request payload."""

    def __init__(self, message: str, *, status_code: int, response_body: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class ChatProvider(ABC):
    @abstractmethod
    async def _chat(
        self,
        messages: list[dict[str, str]],
        max_tokens: int = 20480,
        temperature: float | None = None,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        """Send chat-completion messages and return the assistant text."""

    @abstractmethod
    async def parse_search_filters(self, query: str) -> dict[str, Any]:
        """Cleanup -> extract -> validate; return full filters JSON for search parsing."""

    async def chat(
        self,
        user_message: str,
        max_tokens: int = 20480,
        temperature: float | None = None,
    ) -> str:
        """Send a single user message and return the assistant reply."""
        return await self._chat(
            [{"role": "user", "content": user_message}],
            max_tokens=max_tokens,
            temperature=temperature,
        )


class OpenAICompatibleChatProvider(ChatProvider):
    """OpenAI-compatible endpoint (vLLM, Groq, Ollama, etc.)."""

    def __init__(self, base_url: str, api_key: str | None, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        if not self.base_url.endswith("/v1"):
            self.base_url = f"{self.base_url}/v1"
        self.api_key = api_key
        self.model = model

    @staticmethod
    def _extract_text_content(content: Any) -> str | None:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if not isinstance(item, dict):
                    continue
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text)
            if parts:
                return "".join(parts)
        return None

    @staticmethod
    def _should_retry_without_response_format(exc: ChatServiceError) -> bool:
        if not isinstance(exc, ChatBadRequestError):
            return False
        body = exc.response_body.lower()
        if "response_format" not in body:
            return False
        markers = ("unsupported", "not supported", "invalid", "json_object", "json schema")
        return any(marker in body for marker in markers)

    async def _chat(
        self,
        messages: list[dict[str, str]],
        max_tokens: int = 20480,
        temperature: float | None = None,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature if temperature is not None else 0.2,
        }
        if response_format is not None:
            payload["response_format"] = response_format

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        retries = 3
        base_delay_s = 1.0

        for attempt in range(retries + 1):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        json=payload,
                        headers=headers,
                    )
                    response.raise_for_status()

                data = response.json()
                choices = data.get("choices") or []
                if not choices:
                    raise ChatServiceError("Chat API returned no choices.")

                message = choices[0].get("message") or {}
                content = self._extract_text_content(message.get("content"))
                if content is None:
                    raise ChatServiceError("Chat API returned missing or unsupported content.")

                stripped = content.strip()
                if not stripped:
                    raise ChatServiceError("Chat API returned empty content.")
                return stripped

            except httpx.HTTPStatusError as exc:
                body = getattr(exc.response, "text", None) or ""
                status_code = exc.response.status_code

                if status_code == 429:
                    if attempt < retries:
                        retry_after = exc.response.headers.get("Retry-After")
                        try:
                            delay_s = float(retry_after) if retry_after else base_delay_s
                        except ValueError:
                            delay_s = base_delay_s
                        await asyncio.sleep(delay_s * (attempt + 1))
                        continue
                    raise ChatRateLimitError(
                        "Chat API rate limited the request. Please retry later."
                    ) from exc

                if status_code == 400:
                    raise ChatBadRequestError(
                        "Chat API rejected the request payload.",
                        status_code=status_code,
                        response_body=body,
                    ) from exc

                if body:
                    logger.warning("Chat API error %s: %s", status_code, body[:500])
                raise ChatServiceError(
                    f"Chat API returned {status_code}. Please try again later."
                ) from exc

            except httpx.RequestError as exc:
                raise ChatServiceError(
                    "Chat service unavailable (timeout or connection error). Please try again later."
                ) from exc

            except (KeyError, TypeError, IndexError) as exc:
                raise ChatServiceError("Chat API returned unexpected response format.") from exc

        raise ChatServiceError("Chat API request failed after retries.")

    async def _chat_json(
        self,
        messages: list[dict[str, str]],
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        """Call _chat and parse the response as a JSON object."""
        try:
            text = await self._chat(
                messages,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
        except ChatServiceError as exc:
            if not self._should_retry_without_response_format(exc):
                raise
            logger.info("Chat API rejected response_format=json_object, retrying without it.")
            text = await self._chat(messages, max_tokens=max_tokens, response_format=None)

        raw = extract_json_from_llm_response(text or "")
        try:
            parsed = json.loads(raw)
        except (ValueError, json.JSONDecodeError) as exc:
            raise ChatServiceError("Chat returned invalid JSON.") from exc

        if not isinstance(parsed, dict):
            raise ChatServiceError("Chat returned a non-object JSON payload.")
        return parsed

    async def parse_search_filters(self, query: str) -> dict[str, Any]:
        """Cleanup -> single extract; return parsed search constraints JSON."""
        cleanup_prompt = get_cleanup_prompt(query)
        cleaned_text = (
            await self._chat(
                [{"role": "user", "content": cleanup_prompt}],
                max_tokens=500,
                response_format=None,
            )
        ).strip()
        if not cleaned_text:
            cleaned_text = query

        extract_prompt = get_single_extract_prompt(query, cleaned_text)
        return await self._chat_json(
            [{"role": "user", "content": extract_prompt}],
            max_tokens=4096,
        )


class OpenAIChatProvider(OpenAICompatibleChatProvider):
    """Official OpenAI API."""

    def __init__(self) -> None:
        settings = get_settings()
        super().__init__(
            base_url="https://api.openai.com/v1",
            api_key=settings.openai_api_key,
            model=settings.chat_model or _OPENAI_DEFAULT_MODEL,
        )


_OPENAI_DEFAULT_MODEL = "gpt-4o-mini"
_OPENAI_COMPATIBLE_DEFAULT_MODEL = "Qwen/Qwen2.5-7B-Instruct"


def get_chat_provider() -> ChatProvider:
    settings = get_settings()
    if settings.openai_api_key and not settings.chat_api_base_url:
        return OpenAIChatProvider()
    if settings.chat_api_base_url:
        return OpenAICompatibleChatProvider(
            base_url=settings.chat_api_base_url,
            api_key=settings.chat_api_key,
            model=settings.chat_model or _OPENAI_COMPATIBLE_DEFAULT_MODEL,
        )
    raise RuntimeError(
        "Chat LLM not configured. Set OPENAI_API_KEY or CHAT_API_BASE_URL (and CHAT_MODEL)."
    )
