# DSAdle — Architecture Explained

DSAdle is a daily Wordle-style guessing game: instead of guessing a 5-letter
word, you guess a **data structure or algorithm** (e.g. "Stack", "Merge
Sort", "Union-Find"). Each wrong guess reveals a new clue about today's
answer, and you get 5 guesses total.

The project is a classic **two-process, two-language** web app:

```
┌─────────────────────────┐        HTTP/JSON        ┌──────────────────────────┐
│   FRONTEND (Next.js)    │  ───────────────────▶   │    BACKEND (FastAPI)     │
│   React + TypeScript    │  ◀───────────────────   │    Python + SQLAlchemy   │
│   http://localhost:3000 │                          │   http://localhost:8000  │
└─────────────────────────┘                          └──────────┬───────────────┘
                                                                  │`
                                                                  ▼
                                                        ┌──────────────────┐
                                                        │  SQLite database  │
                                                        │   dsadle.db        │
                                                        └──────────────────┘
```

They are **independent processes** that only talk to each other over HTTP.
The frontend never touches the database directly, and the backend never
renders any UI — it's a pure JSON API. This separation is why the answer
never leaks to the browser: all guess-checking logic lives server-side.

---

## 1. The backend (`backend/`)

Framework: **FastAPI** (Python), ORM: **SQLAlchemy**, storage: **SQLite**
(`backend/dsadle.db`, a single file on disk).

### File map

| File | Role |
|---|---|
| `main.py` | App entrypoint — creates the FastAPI app, wires in CORS and the two routers |
| `database.py` | SQLAlchemy engine/session setup — one function `get_db()` used as a per-request dependency |
| `models.py` | The one database table: `Question` |
| `schemas.py` | Pydantic request/response shapes (validation + API docs) |
| `routers/game.py` | Public game endpoints: names, daily clues, guess submission |
| `routers/questions.py` | Admin CRUD endpoints for managing the question bank (API-key protected) |
| `seed.py` | One-time script that loads `seed_data.json` into the database |
| `seed_data.json` | The starter question bank (27 entries: Array, Linked List, Stack, Merge Sort, Union-Find, etc.) |

### Data model (`models.py`)

There is exactly **one table**, `questions`:

```
id, name, category (data_structure|algorithm), family, time_complexity,
space_complexity, difficulty (Beginner|Intermediate|Advanced),
top_operation, use_case, description, code
```

Every guessable "answer" in the game is a row in this table. `name` is
unique — that's literally what the player types into the guess box.

### How "today's answer" is chosen — `routers/game.py`

There's no `daily_puzzle` table. Instead the day's answer is computed
**deterministically** from the day index:

```python
day_idx = <days since Unix epoch>          # e.g. Date.now() / 86400000 in JS
questions = all questions ordered by id
answer = questions[day_idx % len(questions)]
```

Same formula on every server restart → same puzzle for everyone on the same
UTC day, no scheduling job needed. This is computed **inside the request
handler**, never sent to the client.

### The 3 public game endpoints

1. **`GET /api/game/names`** — returns just `["Array", "Stack", ...]`, the
   full list of valid names, used to power the frontend's autocomplete. Safe
   to expose because it doesn't say *which* one is today's answer.

2. **`GET /api/game/daily/{day_idx}`** — returns only the **clues** for that
   day's answer (`schemas.DailyClues`): category, use-case sentence, a time
   complexity clue string, a space complexity clue string, and the code
   snippet. Notice `schemas.DailyClues` has no `name` or `description`
   field — the answer-identifying fields are structurally excluded from the
   response type, not just omitted by convention.

3. **`POST /api/game/guess`** — the only stateful-feeling endpoint, but the
   backend keeps **no session state**. The client sends the *entire* guess
   history (`{day_idx, guesses: [...]}`) every time. The server:
   - validates every guess name exists in the DB (422 if not),
   - compares each guess to the real answer → `results: bool[]`,
   - decides `won` (any guess correct) and `game_over` (won OR 5 guesses used),
   - only if `game_over`, includes `reveal: {name, description}`.

   This "replay the whole history" design means the backend is fully
   stateless per-request — no server-side session/cookie needed — while
   still keeping the answer hidden until the game legitimately ends.

### Admin endpoints — `routers/questions.py`

Full CRUD (`GET/POST/PUT/DELETE /api/questions[/{id}]`) for managing the
question bank. Protected by a `X-API-Key` header, checked against the
`API_KEY` env var (defaults to `dev-key` locally). These endpoints return
full rows including `name` and `description`, which is exactly the
answer-leaking data the game endpoints are designed to withhold — hence the
key requirement. Reachable via Swagger UI at `/docs` (click "Authorize").

### Wiring it together — `main.py`

```python
Base.metadata.create_all(bind=engine)   # creates the table if missing
app = FastAPI(...)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", ...])
app.include_router(game.router)          # prefix /api/game
app.include_router(questions.router)     # prefix /api/questions
```

CORS is locked to the Next.js dev origin — this is what lets
`fetch()` calls from `localhost:3000` reach `localhost:8000` from the
browser at all.

`database.py`'s `get_db()` is a FastAPI dependency: every route function
declares `db: Session = Depends(get_db)`, and FastAPI opens a fresh
SQLAlchemy session per request and closes it afterward (see the `yield`
pattern).

---

## 2. The frontend (`app/`, `components/`, `lib/`)

Framework: **Next.js 16 (App Router)** + **React 19** + **TypeScript**,
styled with inline styles (Tailwind is imported in `globals.css` but the
component itself uses plain inline `style={{...}}` objects, not utility
classes).

### File map

| File | Role |
|---|---|
| `app/layout.tsx` | Root HTML shell + page `<title>`/meta description |
| `app/page.tsx` | The route `/` — dynamically imports the game component with SSR disabled |
| `components/DSAdle.tsx` | **The entire game UI and client-side logic** (~470 lines, one big component) |
| `lib/api.ts` | Thin typed `fetch()` wrapper around the 3 backend game endpoints |
| `app/globals.css` | Tailwind import + a few `:hover` utility classes used by DSAdle.tsx |

### Why `app/page.tsx` disables SSR

```tsx
const DSAdle = dynamic(() => import('@/components/DSAdle'), { ssr: false });
```

The game reads `localStorage` and `Date.now()` to figure out "today" and
restore saved progress — those don't exist during server-side rendering.
Disabling SSR sidesteps hydration mismatches entirely by only ever
rendering this component in the browser.

### `lib/api.ts` — the only place that knows the backend's URL

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
```

Three functions — `fetchNames()`, `fetchDaily(dayIdx)`,
`submitGuesses(dayIdx, guesses)` — each a typed wrapper over `fetch()`,
mirroring the 3 backend game endpoints and their `schemas.py` shapes almost
field-for-field (`DailyResponse`, `GuessResponse`, `Reveal`). This is the
**entire integration surface** between frontend and backend — everything
else in the app is pure UI state.

### `components/DSAdle.tsx` — state and data flow

**Day indexing.** `todayIndex()` mirrors the backend's formula
(`Date.now() / 86400000`, floored). An `offset` state variable (0 = today,
negative = past days) lets the user browse the archive; `dayIdx = todayIndex() + offset`
is what actually gets sent to the backend on every call.

**Persistence — localStorage, not the backend.** Since the backend is
stateless per-guess-list, *someone* has to remember what you've guessed
across page reloads. That's the frontend's job:
- `dsadle-{dayIdx}` → the array of guessed names for that day
- `dsadle-result-{dayIdx}` → `"won"` or `"lost"`, used to render checkmarks/✗
  in the Archive list

This is why `submitGuesses` always resends the *full* guess array (read
from localStorage, appended to, then saved back) — it's replaying history
to a backend that never remembers it.

**Load sequence** (the main `useEffect`, keyed on `[offset, retryTick]`):
1. Compute `dayIdx` for the current offset.
2. Read any saved guesses for that day from localStorage.
3. Fetch `names` (autocomplete list) and `daily` (today's clues) in
   parallel.
4. If there were saved guesses, **replay them** via `submitGuesses` to
   reconstruct `results`/`reveal` state (e.g. after a page refresh
   mid-game). If those names no longer exist in the DB (question was
   deleted via admin API), the saved guesses are discarded.

**Derived UI state** (computed each render, not stored):
- `won` = any guess correct; `isOver` = won or 5 guesses used
- `wrong` = guesses that were incorrect (rendered as red chips)
- `revealed` = how many of the 5 clue cards have their "lid" removed —
  starts at 1, unlocks one more per wrong guess, all 5 once the game is
  over
- `clues` array = the 5 clue cards (category, use-case, time complexity,
  space complexity, and a "View implementation" trigger), each carrying a
  computed lid opacity/pointer-events pair driven by `revealed`

**Autocomplete.** `getSuggestions()` filters the `names` list by substring
match against the input, excluding already-guessed names, capped at 6.
Arrow keys move a highlighted index (`hi`); Enter either submits the
highlighted suggestion or falls back to `submitGuess()`'s best-match logic
(exact case-insensitive match first, else first substring match).

**Submitting a guess (`submit`)** — POSTs the full updated guess list,
updates `results`/`reveal` from the response, persists to localStorage, and
records win/loss once `game_over` is true.

**UI regions**, top to bottom in the JSX:
- Header bar (hamburger menu, "DSAdle" title/home link)
- Prev/Next day navigation + guesses-left counter
- Error banner with Retry button (shown if the backend is unreachable)
- 5 clue cards with lid overlays
- Wrong-guess chips
- Game-over reveal panel (name + description + "View implementation" button)
- Guess input + autocomplete dropdown (hidden once the game is over)
- Code modal (a macOS-style window chrome showing the `code` snippet,
  expandable)
- Slide-out sidebar with "Today's Puzzle" / "Archive" (last 30 days, each
  showing ✓/✗ based on localStorage)

All of this — clue unlocking, archive browsing, autocomplete, the modal —
is **one component with `useState` hooks**; there's no external state
library, router-based state, or context.

---

## 3. Request lifecycle — a full guess, end to end

1. User types "Stack" in the input; `getSuggestions()` filters `names`
   client-side, showing a dropdown.
2. User hits Enter → `submit("Stack")` fires.
3. Frontend appends to the in-memory `guesses` array and calls
   `submitGuesses(dayIdx, ["Array", "Stack"])` → `POST /api/game/guess`.
4. FastAPI's `guess()` handler in `routers/game.py`:
   - loads all questions, computes `answer = questions[day_idx % n]`,
   - validates both guessed names exist,
   - compares each to `answer.name` → `[false, true]`,
   - `won = true`, `game_over = true` → includes `reveal`.
5. Frontend receives `{results: [false, true], won: true, game_over: true, reveal: {...}}`,
   updates `results`/`reveal` state, saves guesses + `"won"` to
   localStorage.
6. Re-render: `isOver` flips true → clue lids fully open, input hides,
   reveal panel shows the name/description, guess chips show ✕ Array.

---

## 4. Running it

Two independent dev servers, per `README.md`:

```bash
# Terminal 1 — backend
cd backend
.venv/bin/uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
npm run dev   # port 3000, reads NEXT_PUBLIC_API_URL from .env.local
```

Nothing about the architecture requires them to be co-located — the
frontend just needs `NEXT_PUBLIC_API_URL` pointed at wherever the FastAPI
process is reachable, and CORS on the backend to allow that origin.

## 5. Key design decisions worth understanding

- **Answer never ships to the browser until the game is over.** Enforced
  structurally: `DailyClues`/`schemas.py` simply has no field for it, and
  the admin endpoints that *do* expose it are API-key gated.
- **No sessions, no auth for players.** State lives in the client
  (localStorage) and is *replayed* to a stateless backend on every guess.
  Simple, but means clearing localStorage resets "memory" of past
  games, and guesses aren't tied to a real user identity.
- **The daily puzzle needs no cron job or scheduler.** It's a pure
  function of `day_idx % question_count`, computed fresh on both sides
  (frontend for display/offsets, backend for the actual answer) from the
  same epoch-day formula.
- **One SQLite table, one resource type.** The entire "game content" is
  just rows of `Question` — adding a new puzzle is inserting one row via
  the admin API, not writing code.
