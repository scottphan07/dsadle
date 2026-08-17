import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import models  # noqa: F401 — registers the Question model with Base.metadata
from database import Base, engine
from routers import game, questions

Base.metadata.create_all(bind=engine)

# Comma-separated, e.g. CORS_ORIGINS=https://dsadle.vercel.app,https://dsadle.com
# The default is the local dev origins, never "*": a restrictive default fails
# loudly instead of silently masking an unconfigured deploy. Trailing slashes are
# stripped because browsers never send one in the Origin header.
_DEFAULT_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
CORS_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("CORS_ORIGINS", _DEFAULT_ORIGINS).split(",")
    if o.strip()
]
# Optional, for hosts that mint a URL per deploy — e.g. Vercel previews:
#   CORS_ORIGIN_REGEX=https://.*\.vercel\.app$
# Safe to widen: the admin router is guarded by its API key, not by CORS.
CORS_ORIGIN_REGEX = os.environ.get("CORS_ORIGIN_REGEX") or None

app = FastAPI(
    title="DSAdle API",
    description="Question bank and game logic for DSAdle. "
    "Game endpoints are public; question admin endpoints need an X-API-Key header.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(game.router)
app.include_router(questions.router)


@app.get("/", tags=["health"])
def health():
    return {"status": "ok", "docs": "/docs"}
