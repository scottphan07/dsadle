const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface DailyClues {
  category: string;
  use_case: string;
  time_clue: string;
  space_clue: string;
  code: string;
}

export interface DailyResponse {
  day_idx: number;
  clues: DailyClues;
}

export interface Reveal {
  name: string;
  description: string;
}

// Which days are actually playable. `day_idxs` is the full sorted list rather
// than just the endpoints, so the calendar stays correct if the schedule has
// gaps. Null endpoints / empty list mean nothing is scheduled yet.
export interface DayRange {
  first_day_idx: number | null;
  last_day_idx: number | null;
  today_day_idx: number;
  day_idxs: number[];
}

export interface GuessResponse {
  results: boolean[];
  won: boolean;
  game_over: boolean;
  reveal: Reveal | null;
}

// Carries the status code so callers can tell "your saved data is invalid"
// (4xx) from "the server is having a moment" (5xx / network). Without this,
// every failure looked identical and the restore path deleted real progress
// whenever the free-tier backend happened to be restarting.
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`API ${status}: ${body}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Render's free tier spins the service down after 15 minutes idle, and the
// next request waits ~50-60s while the instance boots. So this is deliberately
// generous: it is not here to fail fast, it is here to bound the browser's
// ~300s default so a genuinely dead request eventually surfaces as an error
// with a retry button instead of a spinner that never resolves.
const TIMEOUT_MS = 90_000;

/** The request exceeded TIMEOUT_MS. */
export class TimeoutError extends Error {
  constructor() {
    super(`Request timed out after ${TIMEOUT_MS}ms`);
    this.name = 'TimeoutError';
  }
}

/** fetch() itself rejected — offline, DNS failure, or a CORS block. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    // AbortSignal.timeout rejects with a DOMException named 'TimeoutError';
    // everything else reaching here is a transport failure. Distinguishing the
    // two is what lets the UI say something true rather than one catch-all.
    if (err instanceof DOMException && err.name === 'TimeoutError') throw new TimeoutError();
    throw new NetworkError(err);
  }
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  return res.json() as Promise<T>;
}

export function fetchNames(): Promise<string[]> {
  return request<string[]>('/api/game/names');
}

export function fetchRange(): Promise<DayRange> {
  return request<DayRange>('/api/game/range');
}

export function fetchDaily(dayIdx: number): Promise<DailyResponse> {
  return request<DailyResponse>(`/api/game/daily/${dayIdx}`);
}

export function submitGuesses(dayIdx: number, guesses: string[]): Promise<GuessResponse> {
  return request<GuessResponse>('/api/game/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ day_idx: dayIdx, guesses }),
  });
}
