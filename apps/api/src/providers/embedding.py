from abc import ABC, abstractmethod

import httpx

from src.core.config import get_settings


class EmbeddingServiceError(Exception):
    """Raised when the embedding API is unavailable or returns an error (e.g. 522 timeout)."""


class EmbeddingProvider(ABC):
    @property
    @abstractmethod
    def dimension(self) -> int:
        pass

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        pass


class OpenAICompatibleEmbeddingProvider(EmbeddingProvider):
    """OpenAI-compatible /embeddings endpoint."""

    def __init__(self, base_url: str, api_key: str | None, model: str, dimension: int = 324):
        self.base_url = base_url.rstrip("/")
        if not self.base_url.endswith("/v1"):
            self.base_url = f"{self.base_url}/v1"
        self.api_key = api_key
        self.model = model
        self._dimension = dimension
        self._client = httpx.AsyncClient(
            timeout=60.0,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )

    async def close(self) -> None:
        await self._client.aclose()

    @property
    def dimension(self) -> int:
        return self._dimension

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        try:
            r = await self._client.post(
                f"{self.base_url}/embeddings",
                json={"model": self.model, "input": texts},
                headers=headers,
            )
            r.raise_for_status()
            data = r.json()
            try:
                out = [
                    item["embedding"] for item in sorted(data["data"], key=lambda x: x["index"])
                ]
                return out
            except (KeyError, TypeError) as e:
                raise EmbeddingServiceError(
                    "Embedding API returned unexpected response format."
                ) from e
        except httpx.HTTPStatusError as e:
            raise EmbeddingServiceError(
                f"Embedding API returned {e.response.status_code}. Please try again later."
            ) from e
        except httpx.RequestError as e:
            raise EmbeddingServiceError(
                "Embedding service unavailable (timeout or connection error). Please try again later."
            ) from e


_embedding_provider: EmbeddingProvider | None = None


def get_embedding_provider() -> EmbeddingProvider:
    global _embedding_provider
    if _embedding_provider is not None:
        return _embedding_provider
    s = get_settings()
    if s.embed_api_base_url:
        _embedding_provider = OpenAICompatibleEmbeddingProvider(
            base_url=s.embed_api_base_url,
            api_key=s.embed_api_key,
            model=s.embed_model,
            dimension=s.embed_dimension,
        )
        return _embedding_provider
    raise RuntimeError("Embedding model not configured. Set EMBED_API_BASE_URL (and EMBED_MODEL).")


async def close_embedding_provider() -> None:
    global _embedding_provider
    if _embedding_provider is not None and hasattr(_embedding_provider, "close"):
        await _embedding_provider.close()
    _embedding_provider = None
