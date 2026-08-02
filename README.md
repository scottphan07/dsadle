# DSAdle

A daily Wordle-style guessing game for data structures & algorithms.

- **Frontend:** Next.js + React (port 3000)
- **Backend:** FastAPI + SQLite (port 8000) — serves the question bank and runs the game logic (the daily answer never ships to the browser)

## Prerequisites

- Node.js 20.9+
- Python 3.12 (see `backend/.python-version` — match it locally so local and
  production resolve the same dependency versions)

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
curl http://localhost:8000/api/game/range            # which day indices are playable
curl http://localhost:8000/api/game/daily/20642      # clues for a given day index
curl -X POST http://localhost:8000/api/game/guess \
  -H 'Content-Type: application/json' \
  -d '{"day_idx": 20642, "guesses": ["Stack"]}'
```

The day index is days since the Unix epoch: `date +%s` divided by 86400. Only
days that have a question scheduled on them resolve — anything unscheduled, and
anything later than today, returns 404. `/api/game/range` lists exactly the
indices that work.

## Adding / editing questions

Questions live in SQLite (`backend/dsadle.db`) and are managed through the admin
API, which requires an `X-API-Key` header. The key comes from the `API_KEY`
environment variable and falls back to `dev-key` **only when
`APP_ENV=development`** (the default).

`dev-key` is published in this file, so it is development-only: with
`APP_ENV` set to anything else the app **refuses to start** unless `API_KEY` is
a real secret. That is deliberate — these endpoints return `name` and
`description` for every row, i.e. the entire answer bank, so a deploy that
quietly fell back to a well-known key would leak every puzzle.

For bulk edits prefer `seed_data.json` and `seed.py --replace` — see
[Editing the question set](#editing-the-question-set).

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
"View implementation" modal; `puzzle_date` is an optional `YYYY-MM-DD` string —
see [Scheduling puzzles](#scheduling-puzzles).

## How the game API works

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/game/names` | none | Names for the autocomplete |
| `GET /api/game/range` | none | Which days are playable — drives the calendar and archive |
| `GET /api/game/daily/{day_idx}` | none | The day's clues — never includes the answer |
| `POST /api/game/guess` | none | Evaluates the full guess list; reveals the answer only when the game is over (won or 5 guesses) |
| `/api/questions` CRUD | `X-API-Key` | Manage the question bank |

The daily answer is the question whose `puzzle_date` equals the requested day,
looked up server-side. Guesses are validated on the backend, so the answer
isn't visible in browser devtools until the game ends.

`/api/game/range` returns `{first_day_idx, last_day_idx, today_day_idx,
day_idxs}`. `day_idxs` is the full sorted list of playable days rather than
just the endpoints, so a gap in the schedule stays correct; days scheduled in
the future are excluded, so clues can't be fetched early. The frontend anchors
on `last_day_idx` and never derives "today" from the browser clock.

## Scheduling puzzles

Each question row carries a `puzzle_date` — the day it is the answer for.
It's unique (two questions can't share a day) and optional: a question with no
date stays in the autocomplete as a legal guess but is never the answer.

Schedule one through the admin API:

```bash
curl -X PUT http://localhost:8000/api/questions/28 \
  -H 'X-API-Key: dev-key' -H 'Content-Type: application/json' \
  -d '{"puzzle_date": "2026-08-15"}'      # 409 if that day is taken
curl -X PUT http://localhost:8000/api/questions/28 \
  -H 'X-API-Key: dev-key' -H 'Content-Type: application/json' \
  -d '{"puzzle_date": null}'              # unschedule
```

**When the schedule runs out**, `/api/game/daily/{today}` returns 404 and the
UI parks on the most recent scheduled puzzle, relabelling "Today's Puzzle" as
"Latest Puzzle". Add questions and give them dates to extend it.

Because the mapping is stored rather than computed, adding or deleting a
question no longer changes what any past day's answer was. The trade-off is
that puzzles have to actually be scheduled — deleting a scheduled question
leaves a 404 hole on that date rather than silently reshuffling everything.

## Editing the question set

`backend/seed_data.json` is the source of truth. `seed.py` validates it before
touching the database, and refuses to write if anything is wrong:

```bash
cd backend
.venv/bin/python seed.py --check      # validate and report; never opens the DB
.venv/bin/python seed.py --dry-run    # run the swap in a transaction, roll back
.venv/bin/python seed.py --replace    # swap the whole bank for the file
.venv/bin/python seed.py              # first run only: skips if rows exist
```

The report tells you the schedule shape — first and last date, any gaps, and how
many days of runway are left — plus warnings for the things that bite:

- **the first date is in the future** → the site shows its empty state until then
- **the last date has passed** → the bank is exhausted and the app parks on the
  newest puzzle, relabelling it "Latest Puzzle"
- **a question's name appears in its own clues** → `use_case`, `top_operation`,
  the complexities and `code` all ship to the browser in `/api/game/daily`, so a
  snippet like `class Trie:` gives the answer away in DevTools

Errors (duplicate name or date, bad `category`/`difficulty`, an unknown key from
a typo) abort before anything is written.

`--replace` makes the database disposable, which is what lets a deploy re-seed on
boot — but it discards anything created through the admin API. While authoring a
set, edit the file rather than Swagger.

## Resetting the database

Delete `backend/dsadle.db` and re-run `.venv/bin/python seed.py`, or just run
`.venv/bin/python seed.py --replace`.

## Deploying

Frontend on Vercel, backend anywhere that runs Python and terminates TLS.
Every setting below has a local-dev default, so nothing here affects
`npm run dev` / `uvicorn main:app`.

| Variable | Where | Notes |
|---|---|---|
| `APP_ENV` | backend | Anything other than `development` makes `API_KEY` mandatory |
| `API_KEY` | backend | `openssl rand -hex 32`. Required in production; `dev-key` is rejected |
| `CORS_ORIGINS` | backend | Comma-separated, no trailing slash. Defaults to the localhost origins |
| `CORS_ORIGIN_REGEX` | backend | Optional, e.g. `https://.*\.vercel\.app$` for preview deploys |
| `DSADLE_DB_PATH` | backend | Point at a mounted volume; the default is wiped on redeploy |
| `DATABASE_URL` | backend | Overrides the above; the escape hatch to Postgres |
| `NEXT_PUBLIC_API_URL` | Vercel | Backend base URL, **no trailing slash** |

See `backend/.env.example` and `.env.example`.

**Backend start command** — the app keeps no server-side user state (all
progress lives in the browser's localStorage), so the database is derived data
and can be rebuilt on every boot:

```bash
python seed.py --replace && uvicorn main:app --host 0.0.0.0 --port $PORT
```

This works with or without a persistent disk and guarantees the live bank
matches `seed_data.json`. `--host 0.0.0.0` is not optional — uvicorn binds
`127.0.0.1` by default, which produces a healthy-looking deploy that fails every
health check. Keep it to a single instance/worker, since two processes racing
`--replace` at boot would conflict.

The backend uses flat imports (`import models`), so set the host's **root
directory to `backend`**.

**Order of operations**, since each side needs the other's URL:

1. Deploy the backend with `CORS_ORIGINS` unset; confirm `GET /` returns `{"status":"ok"}`.
2. Set `NEXT_PUBLIC_API_URL` in Vercel, deploy, note the domain.
3. Set `CORS_ORIGINS` to that domain and restart the backend — no frontend
   rebuild needed, CORS is just a response header.

`NEXT_PUBLIC_API_URL` is inlined at **build** time, so changing it later needs a
redeploy rather than a restart; the build fails fast if it is missing on Vercel.

If the deployed site shows connection errors, check the backend is HTTPS before
suspecting CORS — Vercel is HTTPS-only, and a plain-HTTP backend gets blocked as
mixed content, which looks identical to a CORS failure in the console.

## Migrating an existing database

`Base.metadata.create_all()` creates missing tables but never alters an existing
one, so a database created before `puzzle_date` existed needs a one-off script:

```bash
cd backend
.venv/bin/python migrate_puzzle_dates.py    # stop uvicorn first
```

It adds the column and its unique index, then schedules the existing questions
in id order ending 2026-08-01. Safe to re-run — it won't touch rows that already
have a date.
