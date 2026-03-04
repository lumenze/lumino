from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """AI Services configuration. Reads from environment variables."""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    # AI Provider: "cloud" (MVP) or "local" (production)
    ai_provider: str = "cloud"

    # Cloud API keys (MVP)
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # Local model config (production)
    ollama_url: str = "http://localhost:11434"
    embedding_model: str = "all-MiniLM-L6-v2"
    llm_model: str = "phi3"

    # Database
    database_url: str = "postgresql://lumino:lumino@localhost:5432/lumino"
    redis_url: str = "redis://localhost:6379"

    class Config:
        env_prefix = "LUMINO_AI_"


settings = Settings()
