from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import models  # noqa: F401 — registers the Question model with Base.metadata
from database import Base, engine
from routers import game, questions

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="DSAdle API",
    description="Question bank and game logic for DSAdle. "
    "Game endpoints are public; question admin endpoints need an X-API-Key header.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(game.router)
app.include_router(questions.router)


@app.get("/", tags=["health"])
def health():
    return {"status": "ok", "docs": "/docs"}
