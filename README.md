# DSAdle

A daily Wordle-style guessing game for data structures and algorithms.

**[Play DSAdle →](https://dsadle.vercel.app)**

## How to play

1. There's one new puzzle every day. It resets at **00:00 UTC** (7pm US Central).
2. Guess which data structure or algorithm is the answer. Start typing a name and
   pick it from the autocomplete.
3. You get **5 guesses**. Each wrong guess unlocks another clue, in this order:
   - **Category**: data structure or algorithm
   - **Use case**: where it shows up in the real world
   - **Time complexity**
   - **Space complexity**
   - **Code**: a Python implementation
4. Guess it right, or use up all five, and the answer is revealed along with a
   short description.

## Features

- **Archive and calendar**: go back and play any past puzzle
- **Saved progress**: your games are stored in your browser, so you don't need an account
- **Light and dark mode**: follows your system setting by default

## Built with

Next.js, React, TypeScript and Tailwind on the frontend (Vercel), and FastAPI
with SQLite on the backend (Render). Guesses are checked on the server, so the
answer never reaches your browser until the game is over.

> **Heads up:** the backend runs on a free tier and goes to sleep when nobody is
> playing. If it's been idle, the first load can take up to about a minute.

## Running locally

**Backend** (Python 3.12):

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python seed.py
.venv/bin/uvicorn main:app --reload --port 8000
```

**Frontend** (Node 20.9+), in a second terminal:

```bash
npm install
npm run dev
```

Create `.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8000`, then open
http://localhost:3000.
