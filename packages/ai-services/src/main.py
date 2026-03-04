"""
LUMINO AI SERVICES — Entry Point

FastAPI server providing AI/ML capabilities behind the AIProvider abstraction.
Each service is a separate router with its own business logic.

Services:
    /nl-matching     — Embedding generation + semantic search via pgvector
    /relevance       — Rule-based (MVP) → ML scoring (Phase 2)
    /health-monitor  — Walkthrough health analysis + auto-healing
    /translation     — LLM-based translation with review workflow
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config.settings import settings
from .services.nl_matching.router import router as nl_router
from .services.relevance.router import router as relevance_router
from .services.health_monitor.router import router as health_router
from .services.translation.router import router as translation_router
from .providers import get_ai_provider


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    # Initialize AI provider (cloud or local based on config)
    provider = get_ai_provider(settings.ai_provider)
    app.state.ai_provider = provider
    yield
    # Cleanup
    await provider.shutdown()


app = FastAPI(
    title="Lumino AI Services",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register service routers
app.include_router(nl_router, prefix="/api/v1/nl", tags=["NL Matching"])
app.include_router(relevance_router, prefix="/api/v1/relevance", tags=["Relevance"])
app.include_router(health_router, prefix="/api/v1/health", tags=["Health Monitor"])
app.include_router(translation_router, prefix="/api/v1/translate", tags=["Translation"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "provider": settings.ai_provider}
