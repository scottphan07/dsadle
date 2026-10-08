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

// `day_idxs` is the full sorted list, not just the endpoints, so the calendar
// stays correct when the schedule has gaps. Null endpoints mean nothing is scheduled.
export interface DayRange {
  first_day_idx: number | null;
  last_day_idx: number | null;
  today_day_idx: number;
  day_idxs: number[];
  /** Whether tomorrow has a puzzle — false means the schedule ends today. */
  has_next: boolean;
}

export interface GuessResponse {
  results: boolean[];
  won: boolean;
  game_over: boolean;
  reveal: Reveal | null;
}

// Carries the status so callers can tell invalid saved data (4xx) from a
// struggling server (5xx / network); the restore path discards progress only on 4xx.
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`API ${status}: ${body}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Long enough to survive a Render free-tier cold start (~50-60s after 15 min
// idle); it exists to bound the browser's ~300s default, not to fail fast.
const TIMEOUT_MS = 90_000;

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
    // anything else reaching here is a transport failure.
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
