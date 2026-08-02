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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
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
