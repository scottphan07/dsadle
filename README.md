# DSAdle

A daily Wordle-style guessing game for data structures and algorithms. One
puzzle a day: you get five guesses, and each wrong one unlocks another clue —
category, real-world use case, time complexity, space complexity, and finally a
Python implementation.

**Play:** [dsadle.vercel.app](https://dsadle.vercel.app) · **API:**
[dsadle.onrender.com/docs](https://dsadle.onrender.com/docs)

| | |
|---|---|
| **Frontend** | Next.js 16 · React 19 · TypeScript · Tailwind 4 · Motion — deployed on Vercel |
| **Backend** | FastAPI · SQLAlchemy 2 · SQLite · Python 3.12 — deployed on Render |
| **Question bank** | 30 questions, scheduled daily from 2026-08-17 |

```
  browser  ──►  Next.js (Vercel)  ──►  FastAPI + SQLite (Render)
                static + client         game logic, question bank
```

The answer never reaches the browser. `/api/game/daily/{day}` returns only
clues; guesses are scored server-side; the name and description are released
only once the game is over. Player progress lives entirely in `localStorage`,
which means the server holds no user state at all — the property that makes the
whole thing deployable on free tiers.

---

## Running locally

**Prerequisites:** Node 20.9+ and Python 3.12 (see `backend/.python-version` —
matching it locally means local and production resolve the same dependencies).

Two terminals.

### Backend

```bash
cd backend
python3 -m venv .venv                       # first time only
.venv/bin/pip install -r requirements.txt   # first time only
.venv/bin/python seed.py                    # first time only — loads the question bank
.venv/bin/uvicorn main:app --reload --port 8000
```

API at http://localhost:8000, interactive docs at http://localhost:8000/docs.

### Frontend

```bash
npm install        # first time only
npm run dev
```

Open http://localhost:3000. The frontend reads the API base URL from
`.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Create that file if it doesn't exist — see `.env.example`.

### Before pushing

```bash
npm run lint && npx tsc --noEmit && npm run build
```

`next build` type-checks more strictly than `next dev`, so this catches things
the dev server won't.

---

## Project structure

```
app/
  page.tsx          loads the game client-side (ssr: false)
  layout.tsx        metadata + the inline theme script
  error.tsx         route error boundary, with a "clear saved games" escape hatch
  globals.css       CSS custom properties for light/dark
components/
  DSAdle.tsx        the entire game UI
lib/
  api.ts            typed API client; ApiError / TimeoutError / NetworkError
backend/
  main.py           app setup, CORS, router mounting
  models.py         the Question table
  schemas.py        Pydantic schemas — game schemas exclude the answer by design
  database.py       engine + session, env-driven
  routers/game.py   public game endpoints
  routers/questions.py  admin CRUD, X-API-Key
  seed.py           load seed_data.json into the database
  validate_seed.py  schema, uniqueness, leak and schedule checks
  seed_data.json    the question bank — source of truth
```

---

## The game API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/game/names` | none | Names for the autocomplete |
| `GET /api/game/range` | none | Which days are playable — drives the calendar and archive |
| `GET /api/game/daily/{day_idx}` | none | The day's clues — never includes the answer |
| `POST /api/game/guess` | none | Scores a guess list; reveals the answer only once the game is over |
| `/api/questions` CRUD | `X-API-Key` | Manage the question bank |

A **day index** is days since the Unix epoch — `Math.floor(Date.now() / 86400000)`
in the browser, `int(time.time() // 86400)` on the server. Both are UTC on
purpose: `date.today()` is server-local and would roll the puzzle over at a
different moment for every player. In practice the puzzle changes at **00:00
UTC**, which is 7pm US Central.

```bash
curl https://dsadle.onrender.com/api/game/range
# {"first_day_idx":20682,"last_day_idx":20682,"today_day_idx":20682,"day_idxs":[20682]}
```

`day_idxs` is the full sorted list rather than just the endpoints, so a gap in
the schedule stays correct. Future days are filtered out, so clues can't be
fetched early.

---

## Scheduling puzzles

Every question row carries a `puzzle_date` — the day it is the answer for. It is
**unique** (two questions can't claim a day) and **nullable** (a question with no
date stays in the autocomplete as a legal guess but is never the answer, which is
how you grow the decoy pool without spending schedule days).

Because the mapping is stored rather than computed, adding or deleting a question
never changes what a past day's answer was. The trade-off is that puzzles must
actually be scheduled — deleting a scheduled question leaves a 404 hole on that
date rather than silently reshuffling everything.

**When the schedule runs out**, `/api/game/daily/{today}` 404s and the UI parks
on the most recent puzzle, relabelling "Today's Puzzle" as "Latest Puzzle".

> ⚠️ `LAUNCH_DAY` in `components/DSAdle.tsx` must match the **earliest**
> `puzzle_date` in `seed_data.json`. It's the floor for the archive, calendar and
> Prev navigation; set it earlier and the UI offers days the API will 404.
> Nothing enforces this — see [Known limitations](#known-limitations).

---

## Editing the question set

`backend/seed_data.json` is the source of truth. `seed.py` validates before
touching the database and refuses to write if anything is wrong.

```bash
cd backend
.venv/bin/python validate_seed.py     # validate only; never opens the DB
.venv/bin/python seed.py --dry-run    # run the swap in a transaction, roll back
.venv/bin/python seed.py --replace    # swap the whole bank for the file
.venv/bin/python seed.py              # first run only: skips if rows exist
```

The report gives the schedule shape — first and last date, gaps, days of runway
left — plus warnings for the things that actually bite:

- **first date in the future** → the site shows its empty state until then
- **last date has passed** → the bank is exhausted, the app parks on the newest puzzle
- **a name appears in its own clues** → `use_case`, `top_operation`, the
  complexities and `code` all ship to the browser in `/api/game/daily`, so a
  snippet like `class Trie:` gives the answer away in DevTools

Errors — duplicate name or date, bad `category`/`difficulty`, an unknown key from
a typo — abort before anything is written.

**Adding a batch:** append to the array (the file is the *entire* bank, not a
delta), validate, dry-run, commit, push. Render re-seeds on boot, so `git push`
is the deploy mechanism for content. Schedule ~30 days at a time; the validator
warns below 14 days of runway.

### Fields

| Field | Rules | Shown to the player? |
|---|---|---|
| `name` | unique, non-empty | only on reveal — **this is the answer** |
| `category` | `data_structure` \| `algorithm` | yes |
| `family` | non-empty | no |
| `time_complexity` | non-empty, e.g. `O(n log n)` | yes |
| `space_complexity` | non-empty, e.g. `O(1)` | yes |
| `difficulty` | `Beginner` \| `Intermediate` \| `Advanced` | no |
| `top_operation` | defaults to `Running time` | yes |
| `use_case` | non-empty | yes — the main clue |
| `description` | non-empty | only on reveal |
| `code` | Python snippet, `\n` for newlines | yes |
| `puzzle_date` | `YYYY-MM-DD`, unique, or `null` | no |

Unknown keys are rejected rather than silently dropped, so `top_operatoin` is an
error instead of a mystery default.

### Admin API

The `/api/questions` endpoints do full CRUD, guarded by an `X-API-Key` header.
In development the key falls back to `dev-key`. With `APP_ENV` set to anything
else the app **refuses to start** unless `API_KEY` is a real secret — and
rejects the literal `dev-key`, because it's published in this file. Those
endpoints return `name` and `description` for every row, i.e. the entire answer
bank, so a deploy that quietly fell back to a well-known key would leak every
puzzle.

Easiest path is Swagger: http://localhost:8000/docs → **Authorize** → `dev-key`.

Note that anything created this way is destroyed on the next restart, because
the production start command re-seeds from `seed_data.json` on boot. Use the
admin API to *inspect* production; use the seed file for anything permanent.

### Resetting the database

```bash
.venv/bin/python seed.py --replace
```

---

## Configuration

| Variable | Where | Secret | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Vercel | no — inlined into the bundle | Backend base URL, **no trailing slash** |
| `APP_ENV` | backend | no | Anything but `development` makes `API_KEY` mandatory |
| `API_KEY` | backend | **yes** | Guards the admin endpoints. `openssl rand -hex 32` |
| `CORS_ORIGINS` | backend | no | Comma-separated origins, no trailing slashes |
| `CORS_ORIGIN_REGEX` | backend | no | e.g. `https://.*\.vercel\.app$` for preview deploys |
| `DSADLE_DB_PATH` | backend | no | SQLite location; unset is fine on ephemeral hosts |
| `DATABASE_URL` | backend | **if set** | Overrides the above — the escape hatch to Postgres |

`NEXT_PUBLIC_*` is inlined at **build** time, not read at runtime: changing it
requires a redeploy, not a restart. `next.config.ts` fails the build outright if
it's missing on Vercel, rather than shipping a site that silently falls back to
localhost.

See `.env.example` and `backend/.env.example`.

---

## Deploying

Frontend on Vercel, backend anywhere that runs Python and terminates TLS.
Every setting has a local-dev default, so none of this affects `npm run dev`.

**Backend start command:**

```bash
python seed.py --replace && uvicorn main:app --host 0.0.0.0 --port $PORT
```

`--host 0.0.0.0` is not optional — uvicorn binds `127.0.0.1` by default, which
produces a deploy that looks healthy in the logs and refuses every outside
request. `$PORT` is supplied by the host.

`seed.py --replace` on every boot is what makes the database **derived data**:
rebuildable from a file in git, so no persistent disk is needed and the live bank
always matches `seed_data.json`.

**Three things have to line up:** both hosts build the same branch;
`NEXT_PUBLIC_API_URL` points at the backend; `CORS_ORIGINS` includes the
frontend's origin. Miss the second and the build fails loudly. Miss the third
and the site loads but every request is blocked in the browser console.

---

## Known limitations

Documented rather than hidden.

- **Cold start.** The backend sleeps after 15 minutes idle on Render's free
  tier; the first request then takes ~50–60s. The UI explains the wait after 3
  seconds and requests time out at 90s, but the delay is real.
- **`LAUNCH_DAY` is duplicated.** The frontend constant has to be kept in sync
  with the earliest `puzzle_date` by hand. `GET /api/game/range` already returns
  everything needed to derive it; wiring that up would remove the coupling.
- **Attempt counting is client-authoritative.** `POST /api/game/guess` is
  stateless — the client sends its full guess list and the server scores it. This
  is what lets a saved game be restored on reload, but it means the five-guess
  limit is a UI convention rather than something the server enforces per player.
  Fixing it properly needs server-side sessions, and therefore storage that
  survives a restart.
- **No rate limiting.** Fine at this scale; would matter with real traffic.
- **Accessibility gaps.** The sidebar, code modal and traffic-light buttons are
  `div`/`span` with click handlers rather than real `<button>`s, so they aren't
  keyboard reachable, and there's no focus trap or Escape handling in the modal.
  The theme switch is the one properly accessible control. This is the largest
  outstanding piece of work.
- **No tests.** Validation of the question bank is automated; nothing else is.

## Roadmap

- Wire up `fetchRange()` and delete `LAUNCH_DAY`
- Make the sidebar and modal keyboard accessible; add `aria-live` for results
- A `Dockerfile`, which unlocks hosts with faster cold starts
- Postgres via `DATABASE_URL` — already supported without a code change; would
  make server-side stats and streaks possible
- CI running `validate_seed.py`, `tsc --noEmit` and `eslint` on every push
