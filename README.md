# DSAdle

A daily Wordle-style guessing game for data structures & algorithms.

- **Frontend:** Next.js + React (port 3000)
- **Backend:** FastAPI + SQLite (port 8000) — serves the question bank and runs the game logic (the daily answer never ships to the browser)

## Prerequisites

- Node.js 18+
- Python 3.10+

## Running locally

You need two terminals: one for the backend, one for the frontend.

### 1. Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv                       # first time only
.venv/bin/pip install -r requirements.txt   # first time only
.venv/bin/python seed.py                    # first time only — loads the 27 starter questions
.venv/bin/uvicorn main:app --reload --port 8000
```

The API is now at http://localhost:8000 and interactive docs at http://localhost:8000/docs.

### 2. Frontend (Next.js)

```bash
npm install        # first time only
npm run dev
```

Open http://localhost:3000. The frontend reads the API base URL from `.env.local`
(`NEXT_PUBLIC_API_URL=http://localhost:8000`); create that file if it doesn't exist.

## Verifying the backend is up

```bash
curl http://localhost:8000/                          # {"status":"ok",...}
curl http://localhost:8000/api/game/names            # all guessable names
curl http://localhost:8000/api/game/daily/20642      # clues for a given day index
curl -X POST http://localhost:8000/api/game/guess \
  -H 'Content-Type: application/json' \
  -d '{"day_idx": 20642, "guesses": ["Stack"]}'
```

The day index is days since the Unix epoch: `date +%s` divided by 86400.

## Adding / editing questions

Questions live in SQLite (`backend/dsadle.db`) and are managed through the admin
API, which requires an `X-API-Key` header. The key comes from the `API_KEY`
environment variable and defaults to `dev-key` for local development
(set a real one when deploying: `API_KEY=... uvicorn main:app ...`).

**Easiest way — Swagger UI:** open http://localhost:8000/docs, click **Authorize**,
enter `dev-key`, then use the `questions (admin)` endpoints to create, update, or
delete questions with a form. New questions appear in the game on the next page
refresh — no frontend rebuild needed.

**Or with curl:**

```bash
# list all questions
curl -H 'X-API-Key: dev-key' http://localhost:8000/api/questions

# add a question
curl -X POST http://localhost:8000/api/questions \
  -H 'X-API-Key: dev-key' -H 'Content-Type: application/json' \
  -d '{
    "name": "Union-Find",
    "category": "data_structure",
    "family": "Disjoint Set",
    "time_complexity": "O(α(n))",
    "space_complexity": "O(n)",
    "difficulty": "Advanced",
    "top_operation": "Union / find",
    "use_case": "Detecting cycles while building a maze",
    "description": "Disjoint-set forest with path compression and union by rank.",
    "code": "parent = list(range(n))"
  }'

# update fields on question 28 (partial update is fine)
curl -X PUT http://localhost:8000/api/questions/28 \
  -H 'X-API-Key: dev-key' -H 'Content-Type: application/json' \
  -d '{"difficulty": "Intermediate"}'

# delete question 28
curl -X DELETE -H 'X-API-Key: dev-key' http://localhost:8000/api/questions/28
```

Field notes: `category` is `data_structure` or `algorithm`; `difficulty` is
`Beginner`, `Intermediate`, or `Advanced`; `time_complexity`/`space_complexity`
are plain strings like `O(n log n)`; `code` is the Python snippet shown in the
"View implementation" modal.

## How the game API works

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/game/names` | none | Names for the autocomplete |
| `GET /api/game/daily/{day_idx}` | none | The day's clues — never includes the answer |
| `POST /api/game/guess` | none | Evaluates the full guess list; reveals the answer only when the game is over (won or 5 guesses) |
| `/api/questions` CRUD | `X-API-Key` | Manage the question bank |

The daily answer is `questions[day_idx % count]` ordered by id, computed
server-side. Guesses are validated on the backend, so the answer isn't visible
in browser devtools until the game ends.

## Resetting the database

Delete `backend/dsadle.db` and re-run `.venv/bin/python seed.py` to restore the
27 starter questions from `backend/seed_data.json`.
