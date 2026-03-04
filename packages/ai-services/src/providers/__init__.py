"""
AI Provider Abstraction Layer

This is the key interface that enables swapping between cloud APIs (MVP)
and local models (production) without changing any business logic.
"""

from abc import ABC, abstractmethod


class AIProvider(ABC):
    """Abstract base for all AI providers."""

    @abstractmethod
    async def generate_embedding(self, text: str) -> list[float]:
        """Generate embedding vector for text."""
        ...

    @abstractmethod
    async def complete(self, prompt: str, max_tokens: int = 1000) -> str:
        """Generate text completion."""
        ...

    @abstractmethod
    async def translate(self, text: str, target_language: str) -> str:
        """Translate text to target language."""
        ...

    async def shutdown(self) -> None:
        """Cleanup resources."""
        pass


class CloudProvider(AIProvider):
    """Cloud API provider (OpenAI/Anthropic) — used in MVP."""

    async def generate_embedding(self, text: str) -> list[float]:
        # TODO: Implement with OpenAI embeddings API
        return [0.0] * 384

    async def complete(self, prompt: str, max_tokens: int = 1000) -> str:
        # TODO: Implement with Claude/GPT API
        return ""

    async def translate(self, text: str, target_language: str) -> str:
        # TODO: Implement with Claude/GPT API
        return text


class LocalProvider(AIProvider):
    """Local model provider (Ollama) — used in production."""

    async def generate_embedding(self, text: str) -> list[float]:
        # TODO: Implement with sentence-transformers
        return [0.0] * 384

    async def complete(self, prompt: str, max_tokens: int = 1000) -> str:
        # TODO: Implement with Ollama
        return ""

    async def translate(self, text: str, target_language: str) -> str:
        # TODO: Implement with Ollama
        return text


def get_ai_provider(provider_type: str) -> AIProvider:
    """Factory: returns the configured AI provider."""
    if provider_type == "local":
        return LocalProvider()
    return CloudProvider()
