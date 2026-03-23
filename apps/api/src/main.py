from contextlib import asynccontextmanager
from pathlib import Path
import logging

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from src.core import get_settings, limiter
from src.db.session import get_db
from src.routers import ROUTERS

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


app = FastAPI(
    title="CONXA API",
    description="Trust-weighted, AI-structured search for people by experience.",
    version="0.1.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_api_root = Path(__file__).resolve().parents[1]  # apps/api/
_img_dir = _api_root / "img"
if _img_dir.exists():
    app.mount("/img", StaticFiles(directory=str(_img_dir)), name="img")

for router in ROUTERS:
    app.include_router(router)


@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    """
    Enhanced health check endpoint.
    Returns service status and database connectivity.
    """
    health_status = {
        "status": "ok",
        "service": "conxa-api",
        "version": "0.1.0"
    }

    # Check database connectivity
    try:
        result = await db.execute(text("SELECT 1"))
        result.scalar()
        health_status["database"] = "connected"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        health_status["database"] = "disconnected"
        health_status["status"] = "degraded"

    return health_status


@app.get("/")
async def root():
    """API root endpoint with basic information."""
    return {
        "service": "CONXA API",
        "description": "Trust-weighted, AI-structured search for people by experience",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health"
    }

