from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.api.v1 import ingest, journals, auth, reddit_sightings, animal_search

app = FastAPI(
    title="WildTrack Server",
    description="Spatio-temporal data platform for proactive conservation",
    version="1.0.0"
)

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS middleware - adjust origins for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers (after limiter setup)
app.include_router(auth.router, prefix="/api/v1/auth", tags=["authentication"])
app.include_router(ingest.router, prefix="/api/v1", tags=["ingestion"])
app.include_router(journals.router, prefix="/api/v1", tags=["journals"])
app.include_router(reddit_sightings.router, prefix="/api/v1", tags=["reddit-sightings"])
app.include_router(animal_search.router, prefix="/api/v1", tags=["animal-search"])


@app.get("/")
async def root():
    return {
        "message": "WildTrack Server API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}



