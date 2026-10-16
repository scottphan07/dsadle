// Sandbox sessions: scoring, filter matching and localStorage.
//
// Kept apart from the daily game's storage on purpose. Nothing here writes a
// `dsadle-result-*` key, so sandbox play can never mark an archive day as
// solved or touch a daily streak.

import type { Difficulty, FacetItem, SandboxFilter } from './api';

export const DIFFICULTIES: Difficulty[] = ['Beginner', 'Intermediate', 'Advanced'];

export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = {
  Beginner: 1,
  Intermediate: 2,
  Advanced: 3,
};

/** A session needs this many rounds before its score counts at full value. */
export const FULL_SESSION_ROUNDS = 5;

/** How many best sessions the stats keep. */
export const BEST_KEPT = 3;

export type SandboxRoundResult = {
  roundId: string;
  difficulty: Difficulty;
  won: boolean;
  /** Guesses used, 1–5. */
  guesses: number;
};

/** The round on screen. Saved so that reloading or ending mid-round can't erase a bad round. */
export type PendingRound = {
  roundId: string;
  difficulty: Difficulty;
  guesses: number;
};

export type ActiveSession = {
  filter: SandboxFilter;
  rounds: SandboxRoundResult[];
  pending: PendingRound | null;
  startedAt: number;
};

export type SessionSummary = {
  filter: SandboxFilter;
  rounds: number;
  solved: number;
  /** 0–100, rounded. */
  accuracy: number;
  /** Average difficulty weight of the rounds played, 1–3. */
  difficulty: number;
  score: number;
  endedAt: number;
};

export type SandboxStats = {
  sessions: number;
  rounds: number;
  solved: number;
  best: SessionSummary[];
};

// ─── Filter matching ─────────────────────────────────────────────────────────

/** Same rule as the server: empty means "any"; tags match if any selected tag fits. */
export function matchesFilter(item: FacetItem, filter: SandboxFilter): boolean {
  if (filter.difficulties.length && !filter.difficulties.includes(item.difficulty)) return false;
  if (filter.tags.length && !item.tags.some((t) => filter.tags.includes(t))) return false;
  return true;
}

/**
 * Counts an abandoned round that already had guesses in it as a loss, so leaving
 * a round you're about to lose (by reloading or ending the session) doesn't
 * protect your accuracy. A round with no guesses yet is simply dropped.
 */
export function settlePending(session: ActiveSession): ActiveSession {
  const p = session.pending;
  if (!p) return session;
  const rounds = p.guesses > 0
    ? [...session.rounds, { roundId: p.roundId, difficulty: p.difficulty, won: false, guesses: p.guesses }]
    : session.rounds;
  return { ...session, rounds, pending: null };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

// accuracy × average difficulty weight × length factor, ×100 for display.
// The length factor stops a lucky one-round session from topping the table.
export function summarize(session: ActiveSession, endedAt = Date.now()): SessionSummary {
  const rounds = session.rounds.length;
  const solved = session.rounds.filter((r) => r.won).length;
  const accuracy = rounds ? solved / rounds : 0;
  const difficulty = rounds
    ? session.rounds.reduce((sum, r) => sum + DIFFICULTY_WEIGHT[r.difficulty], 0) / rounds
    : 0;
  const lengthFactor = Math.min(1, rounds / FULL_SESSION_ROUNDS);
  return {
    filter: session.filter,
    rounds,
    solved,
    accuracy: Math.round(accuracy * 100),
    difficulty: Math.round(difficulty * 10) / 10,
    score: Math.round(accuracy * difficulty * lengthFactor * 100),
    endedAt,
  };
}

// ─── Labels ──────────────────────────────────────────────────────────────────

// Used before the server's labels have loaded, e.g. in the stats popup.
function prettySlug(slug: string): string {
  const words = slug.split('-').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function filterLabel(filter: SandboxFilter, tagLabels: Record<string, string>): string {
  const diff = filter.difficulties.length ? filter.difficulties.join(' + ') : 'Any difficulty';
  const tags = filter.tags.length
    ? filter.tags.map((t) => tagLabels[t] ?? prettySlug(t)).join(' + ')
    : 'All families';
  return `${diff} · ${tags}`;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

// Versioned keys, so a later format change can migrate rather than crash.
const ACTIVE_KEY = 'dsadle-v1-sandbox-active';
const STATS_KEY = 'dsadle-v1-sandbox-stats';

const EMPTY_STATS: SandboxStats = { sessions: 0, rounds: 0, solved: 0, best: [] };

function readJson(key: string): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isDifficulty = (v: unknown): v is Difficulty => DIFFICULTIES.includes(v as Difficulty);

function isFilter(v: unknown): v is SandboxFilter {
  return isObj(v) && isStrArr(v.difficulties) && v.difficulties.every(isDifficulty) && isStrArr(v.tags);
}

function isRound(v: unknown): v is SandboxRoundResult {
  return isObj(v) && typeof v.roundId === 'string' && isDifficulty(v.difficulty)
    && typeof v.won === 'boolean' && typeof v.guesses === 'number';
}

function isSummary(v: unknown): v is SessionSummary {
  return isObj(v) && isFilter(v.filter) && typeof v.rounds === 'number' && typeof v.solved === 'number'
    && typeof v.accuracy === 'number' && typeof v.difficulty === 'number'
    && typeof v.score === 'number' && typeof v.endedAt === 'number';
}

// Every reader validates its shape: a corrupt value would otherwise throw during
// render on every load (the audit's C3, which the daily storage already guards).
function isPending(v: unknown): v is PendingRound {
  return isObj(v) && typeof v.roundId === 'string' && isDifficulty(v.difficulty) && typeof v.guesses === 'number';
}

export function readActiveSession(): ActiveSession | null {
  const v = readJson(ACTIVE_KEY);
  if (isObj(v) && isFilter(v.filter) && Array.isArray(v.rounds) && v.rounds.every(isRound)
    && (v.pending === null || v.pending === undefined || isPending(v.pending))
    && typeof v.startedAt === 'number') {
    return { ...(v as ActiveSession), pending: (v.pending as PendingRound | undefined) ?? null };
  }
  return null;
}

export function saveActiveSession(session: ActiveSession | null): void {
  writeJson(ACTIVE_KEY, session);
}

export function readSandboxStats(): SandboxStats {
  const v = readJson(STATS_KEY);
  if (isObj(v) && typeof v.sessions === 'number' && typeof v.rounds === 'number'
    && typeof v.solved === 'number' && Array.isArray(v.best) && v.best.every(isSummary)) {
    return v as SandboxStats;
  }
  return EMPTY_STATS;
}

/** Folds a finished session into the lifetime totals. Returns its rank (1-based) among the best, or null. */
export function recordSession(summary: SessionSummary): number | null {
  if (summary.rounds === 0) return null;
  const prev = readSandboxStats();
  // Ties go to the earlier session: it got there first.
  const best = [...prev.best, summary]
    .sort((a, b) => b.score - a.score || a.endedAt - b.endedAt)
    .slice(0, BEST_KEPT);
  writeJson(STATS_KEY, {
    sessions: prev.sessions + 1,
    rounds: prev.rounds + summary.rounds,
    solved: prev.solved + summary.solved,
    best,
  });
  const rank = best.indexOf(summary);
  return rank >= 0 ? rank + 1 : null;
}
