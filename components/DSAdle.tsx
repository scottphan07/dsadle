'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef, KeyboardEvent, CSSProperties } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  fetchNames, fetchDaily, fetchRange, submitGuesses,
  ApiError, TimeoutError, NetworkError,
  DailyClues, DayRange, Reveal,
} from '@/lib/api';

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// Delay before the wait is explained: above a warm backend's ~200ms, below the
// point where the page reads as dead.
const SLOW_LOAD_MS = 3000;

// Failures are reported twice: the player gets a sentence in the game's voice,
// the developer gets the status code, error name and original object in the console.

type ErrorContext = 'load' | 'guess' | 'restore';

const ATTEMPTED: Record<ErrorContext, string> = {
  load: "Couldn't grab the DSAdle",
  guess: "Couldn't grade your guess",
  restore: "Couldn't pick your game back up",
};

// Named in terms of DSAdle, not the stack behind it: the player can't act on
// "502 from the origin", and the console carries that for whoever can.
function reasonFor(err: unknown): string {
  if (err instanceof TimeoutError) return 'DSAdle is still waking up.';
  if (err instanceof NetworkError) return "Can't reach DSAdle right now.";
  if (err instanceof ApiError) {
    if (err.status === 404) return "There's no DSAdle scheduled for that day.";
    if (err.status >= 500) return 'Something went wrong on our end.';
    return "That didn't go through.";
  }
  return 'Something unexpected happened.';
}

function describeError(context: ErrorContext, err: unknown): string {
  // A 404 is permanent for that day, so it must not invite a retry.
  const retryable = !(err instanceof ApiError && err.status === 404);
  return `${ATTEMPTED[context]}. ${reasonFor(err)}${retryable ? ' Try again in a moment.' : ''}`;
}

/** The developer half of an error report; read it in the DevTools console. */
function logError(context: ErrorContext, err: unknown): void {
  const detail =
    err instanceof ApiError
      ? `ApiError ${err.status} — ${err.message}`
      : err instanceof Error
        ? `${err.name} — ${err.message}`
        : String(err);
  console.error(`[DSAdle] ${context} failed: ${detail}`, err);
}
const MAX_GUESSES = 5;

// Suggestion list height: ~6 rows on desktop, then it scrolls. The dvh cap keeps
// it clear of the header on short phone screens with the keyboard up.
const SUGGEST_MAX_H = 'min(276px, 38dvh)';

// Day one: the floor for the archive, the calendar and Prev navigation. Must match
// the earliest puzzle_date in backend/seed_data.json — earlier days 404. Month is 0-based.
const LAUNCH_DAY = Math.floor(Date.UTC(2026, 7, 17) / 86400000); // 2026-08-17

// ─── Layout ────────────────────────────────────────────────────────────────

// Inline styles can't carry media queries, so clamp()/min() do the responsive work.
const GUTTER = 'clamp(16px, 4vw, 32px)';
// Carries its own gutter, so the reading column inside stays 488px at desktop.
const CONTENT_MAX = 552;
const SECTION_GAP = 'clamp(12px, 3.5vw, 18px)';

// The header spans the viewport, so only the game content is centred.
const contentColumn: CSSProperties = {
  width: '100%', maxWidth: CONTENT_MAX, margin: '0 auto',
  paddingInline: GUTTER, boxSizing: 'border-box',
};

// Both header slots reserve the same box, which centres the wordmark.
const HEADER_SLOT = 40;

// Horizontal padding shared by every sidebar row
const SIDE_PAD = 'clamp(16px, 5vw, 20px)';

// Day indices are UTC epoch-days, so labels must be formatted in UTC too —
// formatting UTC midnight in local time shifts the date back a day west of UTC.
const DATE_FMT: Intl.DateTimeFormatOptions = {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
};

const calNavStyle: CSSProperties = {
  border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
  fontSize: 16, fontWeight: 700, lineHeight: 1, padding: '2px 8px',
};

// Padded out to a comfortable tap target; the negative margin at the call site
// keeps the label optically flush with the content edge.
const navBtnStyle: CSSProperties = {
  border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
  fontSize: 'inherit', fontWeight: 600, padding: '6px 8px', flexShrink: 0, whiteSpace: 'nowrap',
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ─── Animation ─────────────────────────────────────────────────────────────

const SPRING = { type: 'spring', stiffness: 300, damping: 28 } as const;
const EASE_OUT = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;
const INSTANT = { duration: 0 } as const;
// Warp duration: long enough that the staggered rows read as a curve, not a blur.
const GENIE_MS = 320;
// Duration-based spring: `duration`/`bounce` replace stiffness/damping, never mix the two
const FLIP = { type: 'spring', duration: 0.8, bounce: 0.18 } as const;
// After the final guess, the results popup waits for the last clues to finish
// flipping open, the way Wordle waits for its tiles.
const END_DELAY_MS = 1100;

const pressable = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.94 },
  transition: { type: 'spring', stiffness: 500, damping: 30 },
} as const;

// Sidebar rows are full-width — scaling them up on hover looks wrong
const pressableRow = {
  whileTap: { scale: 0.98 },
  transition: { type: 'spring', stiffness: 500, damping: 30 },
} as const;

// ─── localStorage helpers ──────────────────────────────────────────────────

function todayIndex() {
  return Math.floor(Date.now() / 86400000);
}

function keyForDay(dayIdx: number): string {
  return 'dsadle-' + dayIdx;
}

function readGuesses(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // A corrupt stored value persists, so an unchecked cast here would throw
    // during render on every reload.
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) return [];
    // Checked assertion — the guard above is its proof.
    return parsed as string[];
  } catch {
    return [];
  }
}

// Takes an absolute day index, not an offset, so a write straddling UTC midnight
// still lands under the key its read came from.
function saveGuesses(names: string[], dayIdx: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(keyForDay(dayIdx), JSON.stringify(names));
  } catch {}
}

// ─── Modal chrome ──────────────────────────────────────────────────────────

// Shared by the real window and the animating copy so the two can't drift apart.
const MODAL_HEADER_STYLE: CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '13px clamp(12px, 4vw, 18px)',
  background: '#2a2a30', borderBottom: '1px solid #3a3a42', flexShrink: 0,
};

const MODAL_PRE_STYLE: CSSProperties = {
  margin: 0, padding: 'clamp(14px, 4vw, 22px)', overflow: 'auto',
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontSize: 'clamp(11px, 3vw, 12.5px)', lineHeight: 1.65, color: '#e6e6ea', whiteSpace: 'pre',
};

// Truncates rather than shoving the traffic lights around on a narrow screen
const MODAL_FILENAME_STYLE: CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: '#b8b8c0', marginLeft: 8,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
};

const LIGHT_COLORS = ['#ff5f57', '#febc2e', '#28c840'];

function readResult(dayIdx: number): 'won' | 'lost' | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('dsadle-result-' + dayIdx);
    return raw === 'won' || raw === 'lost' ? raw : null;
  } catch {
    // localStorage throws rather than returning null when site data is blocked,
    // and this runs during render — an unguarded throw would take the page down.
    return null;
  }
}

function saveResult(dayIdx: number, result: 'won' | 'lost'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('dsadle-result-' + dayIdx, result);
  } catch {}
}

// Marks a game finished on its own day. Only these count toward streaks, so the
// archive can't be used to backfill one. Games finished before this key existed
// carry no mark, so streaks effectively start counting from this release.
function markOnTime(dayIdx: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('dsadle-ontime-' + dayIdx, '1');
  } catch {}
}

function readOnTime(dayIdx: number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('dsadle-ontime-' + dayIdx) === '1';
  } catch {
    return false;
  }
}

type Stats = {
  played: number;
  winPct: number;
  current: number;
  max: number;
  /** Wins by guess count, index 0 = solved on the first guess. */
  dist: number[];
  losses: number;
};

// Everything comes from what the game already saves per day, so there's no
// separate stats record to drift out of sync. `days` must be ascending.
function computeStats(days: number[], today: number): Stats {
  let played = 0, wins = 0, losses = 0, run = 0, max = 0;
  const dist = new Array(MAX_GUESSES).fill(0);
  for (const d of days) {
    const res = readResult(d);
    if (res) {
      played++;
      if (res === 'won') {
        wins++;
        const n = readGuesses(keyForDay(d)).length;
        dist[Math.min(MAX_GUESSES, Math.max(1, n)) - 1]++;
      } else {
        losses++;
      }
    }
    // Streaks: archive and lost games break them; today in progress doesn't.
    if (res === 'won' && readOnTime(d)) {
      run++;
      max = Math.max(max, run);
    } else if (!(d === today && res === null)) {
      run = 0;
    }
  }
  return {
    played,
    winPct: played ? Math.round((wins / played) * 100) : 0,
    current: run,
    max,
    dist,
    losses,
  };
}

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

// ─── Theme ─────────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark';

// Reads the DOM attribute, not localStorage: layout.tsx's inline script already
// resolved stored choice vs. OS preference before first paint.
function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function saveTheme(t: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('dsadle-theme', t);
  } catch {}
}

// Gates the OS listener below: a stored choice outranks the system preference,
// matching the layout.tsx script.
function hasStoredTheme(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const t = localStorage.getItem('dsadle-theme');
    return t === 'light' || t === 'dark';
  } catch {
    return false;
  }
}

// 'lost' also covers games left in progress — anything attempted but not won
function dayStatus(dayIdx: number): 'won' | 'lost' | null {
  if (readResult(dayIdx) === 'won') return 'won';
  return readGuesses(keyForDay(dayIdx)).length > 0 ? 'lost' : null;
}

function labelForDay(dayIdx: number): string {
  return new Date(dayIdx * 86400000).toLocaleDateString('en-US', DATE_FMT);
}

// ─── macOS traffic light ───────────────────────────────────────────────────

// The glyph fades in with the group hover, matching how macOS reveals all three
// symbols whenever the pointer is over the cluster.
function TrafficLight({ color, glyphColor, hoverClass, title, onClick, visible, children }: {
  color: string;
  glyphColor: string;
  hoverClass: string;
  title: string;
  onClick: () => void;
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      onClick={onClick}
      title={title}
      className={hoverClass}
      style={{
        width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0,
        boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        color: glyphColor,
      }}
    >
      <motion.svg
        viewBox="0 0 12 12"
        width={12}
        height={12}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.12 }}
        style={{ display: 'block' }}
      >
        {children}
      </motion.svg>
    </span>
  );
}

// ─── Theme switch ──────────────────────────────────────────────────────────

const TRACK_W = 44, TRACK_H = 26, KNOB = 22, PAD = 2;
const KNOB_TRAVEL = TRACK_W - PAD * 2 - KNOB;
// Literals, not tokens: Motion can't interpolate a CSS variable, and "on" always
// means dark mode.
const TRACK_OFF = '#d3d6da', TRACK_ON = '#34c759';
// Damped harder than `pressable` so the knob settles instead of overshooting.
const SWITCH_SPRING = { type: 'spring', stiffness: 500, damping: 32 } as const;

// The knob animates `x` rather than `layout`: layout projection inside the
// sidebar's own x-translating motion.div jitters.
function Switch({ checked, onChange, label, reduceMotion }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  reduceMotion: boolean;
}) {
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      whileTap={{ scale: 0.94 }}
      animate={{ backgroundColor: checked ? TRACK_ON : TRACK_OFF }}
      transition={reduceMotion ? INSTANT : { backgroundColor: { duration: 0.2 }, default: SWITCH_SPRING }}
      style={{
        width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, border: 'none',
        padding: PAD, flexShrink: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
      }}
    >
      <motion.span
        animate={{ x: checked ? KNOB_TRAVEL : 0 }}
        transition={reduceMotion ? INSTANT : SWITCH_SPRING}
        style={{
          width: KNOB, height: KNOB, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,.3), 0 0 0 .5px rgba(0,0,0,.06)',
        }}
      />
    </motion.button>
  );
}

// ─── Genie ─────────────────────────────────────────────────────────────────

type Rect = { x: number; y: number; w: number; h: number };
type GenieState = { from: Rect; to: Rect; dir: 'in' | 'out'; snap: Snapshot };
type Snapshot = { canvas: HTMLCanvasElement; dpr: number };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInQuad = (t: number) => t * t;

// Rasterised first because the genie moves each row separately, which a canvas
// transform can't. Styles are read live: the modal's clamp() values resolve at runtime.
function paintWindow(box: HTMLElement, code: string): Snapshot | null {
  const header = box.firstElementChild as HTMLElement | null;
  const pre = box.querySelector('pre');
  if (!header || !pre) return null;

  const { width: w, height: h } = box.getBoundingClientRect();
  // 3x buys nothing here — the bitmap lives for half a second
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);

  const boxCS = getComputedStyle(box);
  const headCS = getComputedStyle(header);
  const preCS = getComputedStyle(pre);
  const headH = header.getBoundingClientRect().height;

  // Body
  const radius = parseFloat(boxCS.borderTopLeftRadius) || 0;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, radius);
  ctx.clip();
  ctx.fillStyle = boxCS.backgroundColor;
  ctx.fillRect(0, 0, w, h);

  // Header bar and its hairline
  ctx.fillStyle = headCS.backgroundColor;
  ctx.fillRect(0, 0, w, headH);
  ctx.fillStyle = headCS.borderBottomColor;
  ctx.fillRect(0, headH - 1, w, 1);

  // Traffic lights, then the filename to their right
  const padL = parseFloat(headCS.paddingLeft) || 0;
  const midY = headH / 2;
  LIGHT_COLORS.forEach((color, i) => {
    ctx.beginPath();
    ctx.arc(padL + 6 + i * 20, midY, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
  const nameEl = header.querySelector('span:last-child');
  if (nameEl) {
    const nameCS = getComputedStyle(nameEl);
    ctx.font = `${nameCS.fontWeight} ${nameCS.fontSize} ${nameCS.fontFamily}`;
    ctx.fillStyle = nameCS.color;
    ctx.textBaseline = 'middle';
    ctx.fillText(nameEl.textContent ?? '', padL + 52, midY);
  }

  // Code. Clipped to the <pre> so long lines are cut exactly where the real
  // window cuts them, and offset by its scroll so a scrolled window matches.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, headH, w, h - headH);
  ctx.clip();
  const lineH = parseFloat(preCS.lineHeight) || parseFloat(preCS.fontSize) * 1.65;
  const textX = parseFloat(preCS.paddingLeft) - pre.scrollLeft;
  const textY = headH + parseFloat(preCS.paddingTop) - pre.scrollTop;
  ctx.font = `${preCS.fontWeight} ${preCS.fontSize} ${preCS.fontFamily}`;
  ctx.fillStyle = preCS.color;
  ctx.textBaseline = 'middle';
  code.split('\n').forEach((line, i) => {
    ctx.fillText(line, textX, textY + lineH * (i + 0.5));
  });
  ctx.restore();

  return { canvas, dpr };
}

// One frame of the warp. Each row gets its own start time on both axes; that
// stagger is what bends the silhouette into a neck instead of a rectangle.
function renderGenie(
  ctx: CanvasRenderingContext2D,
  snap: Snapshot,
  from: Rect,
  to: Rect,
  dir: 'in' | 'out',
  t: number,
) {
  const { canvas: src, dpr } = snap;
  ctx.clearRect(0, 0, ctx.canvas.width / dpr, ctx.canvas.height / dpr);

  const out = dir === 'out';
  // A point, not the trigger's box: a 488px card against a 580px window would
  // barely squeeze, leaving no neck.
  const target = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  // Tall windows (the expanded state) cost twice the drawImage calls per frame
  const step = from.h > 600 ? 2 : 1;

  for (let y = 0; y < from.h; y += step) {
    const r = y / from.h;

    // 0.65 of the timeline is handed out as per-row delay — this is what bends
    // the shape. Minimize starts from the bottom row; restore reverses.
    const xStart = out ? (1 - r) * 0.65 : r * 0.65;
    const xE = easeInOutCubic(clamp((t - xStart) / (1 - xStart), 0, 1));
    // The fall is staggered far less than the squeeze, which is what reads as
    // pouring rather than sliding.
    const yStart = out ? (1 - r) * 0.2 : r * 0.2;
    const yE = easeInQuad(clamp((t - yStart) / (1 - yStart), 0, 1));

    const left = out ? lerp(from.x, target.x, xE) : lerp(target.x, from.x, xE);
    const right = out
      ? lerp(from.x + from.w, target.x, xE)
      : lerp(target.x, from.x + from.w, xE);
    const destY = out
      ? lerp(from.y + y, target.y, yE)
      : lerp(target.y, from.y + y, yE);

    const rowW = right - left;
    if (rowW < 0.8) continue;
    ctx.drawImage(src, 0, y * dpr, src.width, step * dpr, left, destY, rowW, step);
  }
}

// Full-viewport canvas that plays one warp and unmounts. The rAF loop draws
// straight to the canvas — no React state per frame.
function Genie({ state, onDone }: { state: GenieState; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Held in a ref so a re-rendered parent can't restart the animation mid-warp
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = state.snap.dpr;
    canvas.width = Math.ceil(window.innerWidth * dpr);
    canvas.height = Math.ceil(window.innerHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) { doneRef.current(); return; }
    // Destination maths stays in CSS pixels; the source slicing is what has to
    // be in device pixels.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      doneRef.current();
    };

    const start = performance.now();
    const tick = (now: number) => {
      const t = clamp((now - start) / GENIE_MS, 0, 1);
      renderGenie(ctx, state.snap, state.from, state.to, state.dir, t);
      if (t < 1) raf = requestAnimationFrame(tick);
      else finish();
    };
    raf = requestAnimationFrame(tick);

    // rAF stops in a backgrounded tab while timers still fire; the opening warp
    // keeps the real window hidden until done, so it needs this bail-out.
    const bail = setTimeout(finish, GENIE_MS + 250);

    return () => { cancelAnimationFrame(raf); clearTimeout(bail); };
  }, [state]);

  return (
    <canvas
      ref={ref}
      style={{
        position: 'fixed', inset: 0, zIndex: 51, pointerEvents: 'none',
        width: '100%', height: '100%',
      }}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export default function DSAdle() {
  const [names, setNames] = useState<string[]>([]);
  const [daily, setDaily] = useState<DailyClues | null>(null);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [results, setResults] = useState<boolean[]>([]);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A 404 on load isn't a failure: the day simply has no puzzle (the schedule
  // ran out, or it's a gap day). Kept apart from `error` so it gets a calm
  // notice pointing at the archive instead of a red box with Retry.
  const [noPuzzle, setNoPuzzle] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  // Separate from `loading` so a fast load never flashes the cold-start message.
  const [slowLoad, setSlowLoad] = useState(false);
  const [q, setQ] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalExpanded, setModalExpanded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [sideOpen, setSideOpen] = useState(false);
  const [sideView, setSideView] = useState<'main' | 'archive'>('main');
  const [mounted, setMounted] = useState(false);
  const [lightsHover, setLightsHover] = useState(false);
  const [exitMode, setExitMode] = useState<'instant' | 'minimize'>('instant');
  const [openedFrom, setOpenedFrom] = useState<'card' | 'over'>('card');
  const [genie, setGenie] = useState<GenieState | null>(null);
  const [pendingGenieOpen, setPendingGenieOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  // Set on mount rather than at declaration — todayIndex() is client-only
  const [calMonth, setCalMonth] = useState<{ y: number; m: number } | null>(null);
  // The lazy initializer needs no mount gate: page.tsx loads this with ssr:false,
  // so the first render already follows the inline theme script.
  const [theme, setTheme] = useState<Theme>(readTheme);
  // Results popup. Opens after a final guess, and straight away when loading a
  // day that's already finished.
  const [endOpen, setEndOpen] = useState(false);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Scheduled days and whether tomorrow has one. Null until fetched or if the
  // fetch fails; the popup falls back to sensible defaults either way.
  const [range, setRange] = useState<DayRange | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Held in state, not derived during render, so the UTC rollover is a state change
  // that re-runs the load effect instead of desyncing dayIdx from `daily`.
  const [todayIdx, setTodayIdx] = useState(todayIndex);

  useEffect(() => {
    const id = setInterval(() => {
      setTodayIdx((prev) => {
        const now = todayIndex();
        return now === prev ? prev : now;
      });
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!loading) {
      setSlowLoad(false);
      return;
    }
    const id = setTimeout(() => setSlowLoad(true), SLOW_LOAD_MS);
    return () => clearTimeout(id);
  }, [loading]);

  const reduceMotion = useReducedMotion();

  // Measured at animation time, never cached — the page can scroll while the
  // window is open, and the box resizes when `modalExpanded` toggles.
  const cardTriggerRef = useRef<HTMLDivElement>(null);
  const overTriggerRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Load the day's puzzle (and restore any saved game) whenever the day changes
  useEffect(() => {
    setMounted(true);
    setCalMonth((prev) => {
      if (prev) return prev;
      const d = new Date(todayIdx * 86400000);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setNoPuzzle(false);
      if (endTimer.current) clearTimeout(endTimer.current);
      setEndOpen(false);
      setDaily(null);
      setResults([]);
      setReveal(null);
      const dayIdx = todayIdx + offset;
      const saved = readGuesses(keyForDay(dayIdx));
      setGuesses(saved);
      try {
        const [nm, d] = await Promise.all([fetchNames(), fetchDaily(dayIdx)]);
        if (cancelled) return;
        setNames(nm);
        setDaily(d.clues);
        if (saved.length > 0) {
          try {
            const r = await submitGuesses(dayIdx, saved);
            if (cancelled) return;
            setResults(r.results);
            setReveal(r.reveal);
            // A finished day shows its results straight away: no delay, since
            // nothing is flipping open on a restored board.
            if (r.game_over) setEndOpen(true);
          } catch (err) {
            if (cancelled) return;
            // Only a 4xx means the saved guesses are genuinely invalid; 5xx and
            // dropped connections are transient, so the game survives them.
            if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
              // Expected when a saved guess names a question that has left the bank.
              console.warn(
                `[DSAdle] discarding saved guesses for day ${dayIdx} — server rejected them (${err.status})`,
                err,
              );
              setGuesses([]);
              saveGuesses([], dayIdx);
            } else {
              logError('restore', err);
              setError(describeError('restore', err));
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          console.info(`[DSAdle] no puzzle scheduled for day ${dayIdx}`);
          setNoPuzzle(true);
        } else {
          logError('load', err);
          setError(describeError('load', err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [offset, retryTick, todayIdx]);

  // The schedule only changes at rollover, so this needn't follow `offset`.
  useEffect(() => {
    let cancelled = false;
    fetchRange()
      .then((r) => { if (!cancelled) setRange(r); })
      .catch((err) => console.warn('[DSAdle] could not fetch the schedule', err));
    return () => { cancelled = true; };
  }, [todayIdx, retryTick]);

  // Ticks the "Next DSAdle" countdown, only while someone can see it.
  useEffect(() => {
    if (!endOpen || offset !== 0) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endOpen, offset]);

  useEffect(() => () => {
    if (endTimer.current) clearTimeout(endTimer.current);
  }, []);

  // Follows the OS while the tab is open. Deliberately does not saveTheme: a system
  // change is not a user choice, so the page stays on "follow the OS".
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function onChange(e: MediaQueryListEvent) {
      if (hasStoredTheme()) return;
      const next: Theme = e.matches ? 'dark' : 'light';
      setTheme(next);
      document.documentElement.setAttribute('data-theme', next);
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const dayIdx = todayIdx + offset;
  const won = results.some(Boolean);
  const isOver = won || guesses.length >= MAX_GUESSES;
  const wrong = guesses.filter((_, i) => results[i] === false);
  const revealed = loading || !daily ? 0 : isOver ? 5 : Math.min(5, 1 + wrong.length);
  const attemptsLeft = Math.max(0, MAX_GUESSES - guesses.length);
  const dateLabel = labelForDay(dayIdx);
  const codeSnippet = daily?.code ?? '# implementation coming soon';

  // ── Clues ─────────────────────────────────────────────────────────────────

  const clues = [
    { value: daily?.category ?? '', isCode: false },
    { value: daily?.use_case ?? '', isCode: false },
    { value: daily?.time_clue ?? '', isCode: false },
    { value: daily?.space_clue ?? '', isCode: false },
    { value: '', isCode: true },
  ].map((c, i) => ({ ...c, open: i < revealed }));

  // ── Suggestions ───────────────────────────────────────────────────────────

  function getSuggestions(): string[] {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) return [];
    const used = new Set(guesses);
    // Every match, not a top few: the list scrolls (see SUGGEST_MAX_H), so a
    // short query like "tree" can still reach all 15+ trees.
    return names.filter(
      (n) => !used.has(n) && n.toLowerCase().includes(trimmed)
    );
  }

  const suggList = getSuggestions();
  const hiClamped = Math.min(hi, Math.max(0, suggList.length - 1));
  const suggestions = suggList.map((name, i) => ({
    name,
    bg: i === hiClamped ? 'var(--surface-hi)' : 'var(--surface)',
  }));

  // Arrow keys can move the highlight past the visible rows, so follow it.
  // 'nearest' scrolls only when the row is actually out of view.
  const suggestRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = suggestRef.current?.children[hiClamped] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, [hiClamped]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function submit(name: string) {
    if (isOver || submitting) return;
    if (!names.includes(name) || guesses.includes(name)) return;
    const next = [...guesses, name];
    setSubmitting(true);
    try {
      const r = await submitGuesses(dayIdx, next);
      setGuesses(next);
      setResults(r.results);
      setReveal(r.reveal);
      saveGuesses(next, dayIdx);
      if (r.game_over) {
        saveResult(dayIdx, r.won ? 'won' : 'lost');
        // The live clock, not `todayIdx`, which can lag rollover by up to 30s.
        if (dayIdx === todayIndex()) markOnTime(dayIdx);
        if (endTimer.current) clearTimeout(endTimer.current);
        endTimer.current = setTimeout(() => setEndOpen(true), reduceMotion ? 0 : END_DELAY_MS);
      }
      setError(null);
      setQ('');
      setDropdownOpen(false);
      setHi(0);
    } catch (err) {
      logError('guess', err);
      setError(describeError('guess', err));
    } finally {
      setSubmitting(false);
    }
  }

  function submitGuess() {
    const trimmed = q.trim();
    if (!trimmed) return;
    const used = new Set(guesses);
    const target =
      names.find((n) => n.toLowerCase() === trimmed.toLowerCase() && !used.has(n)) ??
      names.find((n) => !used.has(n) && n.toLowerCase().includes(trimmed.toLowerCase()));
    if (!target) return;
    submit(target);
  }

  function fill(name: string) {
    setQ(name);
    setDropdownOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const list = getSuggestions();
    const listOpen = dropdownOpen && list.length > 0;
    if (listOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setHi((prev) => Math.max(0, Math.min(list.length - 1, prev + dir)));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (listOpen) {
        submit(list[hiClamped]);
      } else {
        submitGuess();
      }
    }
  }

  // Offsets are relative to today and run negative into the past, so the launch
  // day is the floor and 0 is the ceiling.
  function clampOffset(o: number) {
    return Math.min(0, Math.max(LAUNCH_DAY - todayIdx, o));
  }

  function navigate(delta: number) {
    setOffset((prev) => clampOffset(prev + delta));
    setQ('');
    setDropdownOpen(false);
  }

  function navigateTo(target: number) {
    setOffset(clampOffset(target));
    setQ('');
    setDropdownOpen(false);
  }

  function goHome() {
    navigateTo(0);
    setSideOpen(false);
  }

  // Shared by the archive list and the calendar; navigateTo clamps out the future
  function goToDay(target: number) {
    navigateTo(target - todayIdx);
    setSideOpen(false);
  }

  // The attribute does the recolouring via the cascade; `theme` state exists
  // only so the switch knows which side it's on.
  function applyTheme(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    saveTheme(next);
  }

  // `mode` picks the backdrop fade: red closes instantly, yellow lingers so the
  // scrim doesn't pop while the window is still travelling.
  function closeModal(mode: 'instant' | 'minimize' = 'instant') {
    setExitMode(mode);
    setModalOpen(false);
    setModalExpanded(false);
    setLightsHover(false);
  }

  // ── Minimize / restore ────────────────────────────────────────────────────

  function toRect(el: Element | null): Rect | null {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }

  // Whichever trigger opened the window is where it goes home to
  function triggerRect(src: 'card' | 'over'): Rect {
    const el = src === 'card' ? cardTriggerRef.current : overTriggerRef.current;
    return toRect(el) ?? {
      x: window.innerWidth / 2 - 60, y: window.innerHeight - 48, w: 120, h: 32,
    };
  }

  function openModal(src: 'card' | 'over') {
    setOpenedFrom(src);
    setModalOpen(true);
    if (!reduceMotion) setPendingGenieOpen(true);
  }

  function minimizeModal() {
    const box = boxRef.current;
    const from = toRect(box);
    // Both must happen before closeModal, which resets modalExpanded in the
    // same batch and would resize the box out from under the snapshot
    const snap = box ? paintWindow(box, codeSnippet) : null;
    if (reduceMotion || !from || !snap) { closeModal('instant'); return; }
    setGenie({ from, to: triggerRect(openedFrom), dir: 'out', snap });
    closeModal('minimize');
  }

  // Measure and snapshot the real box once it's mounted, then warp a copy of it
  // out over the top. Predicting the rect instead would be wrong for
  // `height: auto`, and there'd be nothing to snapshot.
  useLayoutEffect(() => {
    if (!pendingGenieOpen || !modalOpen || !boxRef.current) return;
    const from = toRect(boxRef.current);
    const snap = paintWindow(boxRef.current, codeSnippet);
    if (from && snap) setGenie({ from, to: triggerRect(openedFrom), dir: 'in', snap });
    setPendingGenieOpen(false);
    // triggerRect/toRect read refs only; re-running on identity churn is pointless
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGenieOpen, modalOpen, openedFrom, codeSnippet]);

  // ── Archive days ──────────────────────────────────────────────────────────

  // Memoised: each entry hits localStorage twice.
  const archiveDays = useMemo(
    () => (mounted
      // 30 at most, but never further back than launch day
      ? Array.from({ length: Math.min(30, Math.max(0, todayIdx - LAUNCH_DAY)) }, (_, i) => {
          const dayOff = -(i + 1);
          const d = todayIdx + dayOff;
          const status = dayStatus(d);
          return {
            dayIdx: d,
            label: labelForDay(d),
            dot: status === 'won' ? '✓' : status === 'lost' ? '✗' : '',
            dotColor: status === 'won' ? 'var(--accent-won)' : 'var(--accent-lost)',
          };
        })
      : []),
    // `guesses` isn't read here — it's a cache key. These entries read
    // localStorage, which the linter can't see, so we re-derive whenever the
    // played state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mounted, guesses, todayIdx],
  );

  // ── Results popup ─────────────────────────────────────────────────────────

  // Every scheduled day up to today. Until the range loads (or if it fails),
  // fall back to every day since launch, which only differs on gap days.
  const scheduledDays = useMemo(
    () => (range && range.day_idxs.length > 0
      ? range.day_idxs
      : Array.from({ length: Math.max(0, todayIdx - LAUNCH_DAY + 1) }, (_, i) => LAUNCH_DAY + i)),
    [range, todayIdx],
  );

  // Computed only while the popup is open: it walks localStorage for every day.
  const endInfo = useMemo(() => {
    if (!endOpen) return null;
    const stats = computeStats(scheduledDays, todayIdx);
    // Forward from this day first, then back, so working through the archive
    // in either direction keeps moving the same way.
    const later = scheduledDays.filter((d) => d > dayIdx && dayStatus(d) === null);
    const earlier = scheduledDays.filter((d) => d < dayIdx && dayStatus(d) === null);
    const nextUnplayed = later.length ? later[0] : earlier.length ? earlier[earlier.length - 1] : null;
    return { stats, nextUnplayed };
    // `guesses` is a localStorage cache key, not a value read above — see archiveDays
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endOpen, scheduledDays, todayIdx, dayIdx, guesses]);

  const solvedIn = won ? results.findIndex(Boolean) + 1 : 0;
  const endTiles = Array.from({ length: MAX_GUESSES }, (_, i) =>
    i >= guesses.length ? 'empty' : results[i] ? 'right' : 'wrong');
  const distRows = endInfo
    ? [...endInfo.stats.dist.map((count, i) => ({ label: String(i + 1), count, hit: won && solvedIn === i + 1 })),
       { label: '✕', count: endInfo.stats.losses, hit: !won }]
    : [];
  const distMax = Math.max(1, ...distRows.map((r) => r.count));
  // Optimistic until the range says otherwise, so a failed fetch never claims
  // the game has run out.
  const hasNext = range ? range.has_next : true;

  function closeEnd() {
    setEndOpen(false);
  }

  // ── Calendar ──────────────────────────────────────────────────────────────

  // All arithmetic is UTC — day indices are UTC epoch-days, and mixing in local
  // accessors is what shifts dates by one either side of midnight.
  const calendar = useMemo(() => {
    if (!mounted || !calMonth) return null;
    const { y, m } = calMonth;
    const today = todayIdx;
    const firstWeekday = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const todayDate = new Date(today * 86400000);
    const isCurrentMonth = todayDate.getUTCFullYear() === y && todayDate.getUTCMonth() === m;
    const launchDate = new Date(LAUNCH_DAY * 86400000);
    const isLaunchMonth = launchDate.getUTCFullYear() === y && launchDate.getUTCMonth() === m;

    const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, i) => {
      if (i < firstWeekday) return null;
      const date = i - firstWeekday + 1;
      const d = Date.UTC(y, m, date) / 86400000;
      // Locked at both ends: nothing before launch, nothing after today
      return { date, dayIdx: d, status: dayStatus(d), locked: d < LAUNCH_DAY || d > today, isToday: d === today };
    });

    return { cells, label: `${MONTHS[m]} ${y}`, atCurrentMonth: isCurrentMonth, atLaunchMonth: isLaunchMonth };
    // `guesses` is a localStorage cache key, not a value read above — see archiveDays
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, calMonth, guesses, todayIdx]);

  // Clamped as well as arrow-disabled, so the button state can't drift from
  // what the function actually permits.
  function shiftMonth(delta: number) {
    setCalMonth((prev) => {
      if (!prev) return prev;
      const d = new Date(Date.UTC(prev.y, prev.m + delta, 1));
      const first = new Date(Date.UTC(
        new Date(LAUNCH_DAY * 86400000).getUTCFullYear(),
        new Date(LAUNCH_DAY * 86400000).getUTCMonth(), 1));
      const last = new Date(Date.UTC(
        new Date(todayIdx * 86400000).getUTCFullYear(),
        new Date(todayIdx * 86400000).getUTCMonth(), 1));
      const clamped = d < first ? first : d > last ? last : d;
      return { y: clamped.getUTCFullYear(), m: clamped.getUTCMonth() };
    });
  }

  // ── Modal box style ───────────────────────────────────────────────────────

  const modalBoxStyle: CSSProperties = {
    background: '#1e1e22',
    borderRadius: '10px',
    boxShadow: '0 24px 70px rgba(0,0,0,.45)',
    width: modalExpanded ? '96%' : 'min(580px, 100%)',
    maxWidth: modalExpanded ? '96%' : '100%',
    height: modalExpanded ? '92dvh' : 'auto',
    maxHeight: modalExpanded ? '92dvh' : '82dvh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    // Mounted but concealed while the animating copy scales in over the top
    visibility: pendingGenieOpen || genie?.dir === 'in' ? 'hidden' : 'visible',
  };

  // ── Modal / traffic-light animation ───────────────────────────────────────

  // Memoised: swapping the variants object mid-animation stalls Motion. Exit is a
  // dynamic variant so AnimatePresence's `custom` supplies the mode at removal time.
  const backdropVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: reduceMotion ? INSTANT : EASE_OUT },
    exit: (mode: 'instant' | 'minimize') => ({
      opacity: 0,
      // Hold the scrim for the warp's travel so it doesn't pop out from under it
      transition: mode === 'minimize' && !reduceMotion ? { duration: GENIE_MS / 1000 } : INSTANT,
    }),
  }), [reduceMotion]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', fontFamily: FONT, color: 'var(--text)' }}>

      {/* ── Header ── */}
      {/* Full-bleed: the menu anchors the viewport edge, not the content column.
          Matching side slots keep the wordmark optically centred. */}
      <div style={{ borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', paddingBlock: 'clamp(9px, 2.5vw, 11px)', paddingInline: GUTTER }}>
          <motion.span
            {...pressable}
            onClick={() => { setSideOpen(true); setSideView('main'); }}
            /* Bigger than the glyph for a proper touch target, pulled back so
               the glyph itself still lines up with the gutter */
            style={{ justifySelf: 'start', marginLeft: -9, width: HEADER_SLOT, height: HEADER_SLOT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 21, cursor: 'pointer', lineHeight: '1' }}
          >☰</motion.span>
          <div
            onClick={goHome}
            /* Negative margin cancels the trailing letter-space, which would
               otherwise push the glyphs left of true centre */
            style={{ fontSize: 'clamp(22px, 6vw, 30px)', fontWeight: 800, letterSpacing: '.16em', marginRight: '-.16em', textTransform: 'uppercase', color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >DSAdle</div>
          {isOver && reveal ? (
            <motion.button
              {...pressable}
              onClick={() => setEndOpen(true)}
              title="Results"
              aria-label="Show results"
              style={{ justifySelf: 'end', marginRight: -9, width: HEADER_SLOT, height: HEADER_SLOT, border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {/* Bar chart: same 16-unit grid, stroke and round caps as the calendar */}
              <svg viewBox="0 0 16 16" width={18} height={18} style={{ display: 'block' }}>
                <path d="M3 13.5 L3 9 M8 13.5 L8 3 M13 13.5 L13 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
            </motion.button>
          ) : (
            <span style={{ justifySelf: 'end', width: HEADER_SLOT, height: HEADER_SLOT }} />
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ ...contentColumn, paddingTop: SECTION_GAP, paddingBottom: 'clamp(32px, 9vw, 56px)' }}>

        {/* Nav row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'clamp(11px, 3.2vw, 12px)', color: 'var(--text-muted)', marginBottom: 8 }}>
          <motion.button {...pressable} onClick={() => navigate(-1)} disabled={dayIdx <= LAUNCH_DAY} style={{ ...navBtnStyle, marginLeft: -8 }}>‹ Prev</motion.button>
          {/* Takes the slack so the label centres and wraps instead of
              colliding with the arrows on a narrow screen */}
          <div style={{ flex: 1, minWidth: 0, textAlign: 'center', fontWeight: 600 }}>{dateLabel} · {attemptsLeft} guesses left</div>
          <motion.button {...pressable} onClick={() => navigate(1)} disabled={offset >= 0} style={{ ...navBtnStyle, marginRight: -8 }}>Next ›</motion.button>
        </div>

        {/* Subtitle */}
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginBottom: SECTION_GAP, lineHeight: 1.4 }}>
          Guess the data structure or algorithm.<br />A new clue unlocks with every guess.
        </div>

        {/* Error and cold-start notice share one slot so they can't stack. No Retry
            while waking: a second request arrives no sooner, and the timeout in
            lib/api.ts is what ends this state. */}
        {(error || (loading && slowLoad)) && (
          <div
            aria-live="polite"
            style={{
              textAlign: 'center', fontSize: 13, lineHeight: 1.4, borderRadius: 3,
              padding: '12px clamp(12px, 4vw, 16px)', marginBottom: SECTION_GAP,
              color: error ? 'var(--accent-lost)' : 'var(--text-muted)',
              border: `2px solid ${error ? 'var(--accent-lost)' : 'var(--border)'}`,
            }}
          >
            {error ?? `${offset === 0 ? "Grabbing today's DSAdle" : "Grabbing that day's DSAdle"}\u2026 it naps when nobody's playing, so this can take up to a minute.`}
            {error && (
              <motion.button
                {...pressable}
                onClick={() => setRetryTick((t) => t + 1)}
                style={{ display: 'block', margin: '10px auto 0', fontSize: 12, fontWeight: 700, color: 'var(--on-accent)', background: 'var(--accent-lost)', border: 'none', borderRadius: 3, padding: '7px 14px', cursor: 'pointer' }}
              >Retry</motion.button>
            )}
          </div>
        )}

        {/* No puzzle for this day: neutral, not an error, and no Retry since
            asking again won't schedule one. Points at the archive instead. */}
        {noPuzzle && !error && (
          <div
            aria-live="polite"
            style={{
              textAlign: 'center', fontSize: 13, lineHeight: 1.4, borderRadius: 3,
              padding: '14px clamp(12px, 4vw, 16px)', marginBottom: SECTION_GAP,
              color: 'var(--text-muted)', border: '2px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              {offset === 0 ? "There's no DSAdle today" : "There's no DSAdle for this day"}
            </div>
            New puzzles are on the way. In the meantime, catch up on past days in the archive.
            <motion.button
              {...pressable}
              onClick={() => { setSideOpen(true); setSideView('archive'); }}
              style={{ display: 'block', margin: '12px auto 0', fontSize: 13, fontWeight: 700, color: 'var(--btn-fg)', background: 'var(--btn-bg)', border: 'none', borderRadius: 3, padding: '9px 16px', cursor: 'pointer' }}
            >Play the archive</motion.button>
          </div>
        )}

        {/* Clue cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(6px, 2vw, 8px)', marginBottom: SECTION_GAP }}>
          {clues.map((c, i) => (
            // Ref sits on the perspective wrapper, not the trigger inside it —
            // measuring within the 3D subtree would pick up the card's rotation
            <div key={i} ref={c.isCode ? cardTriggerRef : undefined} style={{ flex: 1, position: 'relative', perspective: 600 }}>
              {/* Flip container — 0deg shows the clue, 180deg shows the lid */}
              <motion.div
                initial={false}
                animate={{ rotateX: c.open ? 0 : 180 }}
                transition={reduceMotion ? INSTANT : FLIP}
                style={{ position: 'relative', transformStyle: 'preserve-3d' }}
              >
                {/* Front face — in normal flow, so it defines the card height */}
                <div style={{ position: 'relative', minHeight: 'clamp(46px, 13vw, 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '10px clamp(10px, 3vw, 16px)', background: 'var(--surface)', border: '2px solid var(--border-strong)', color: 'var(--text)', fontWeight: 700, fontSize: 'clamp(13px, 3.6vw, 15px)', borderRadius: 2, lineHeight: 1.3, backfaceVisibility: 'hidden' }}>
                  {!c.isCode && <span>{c.value}</span>}
                  {c.isCode && (
                    <motion.div
                      {...pressable}
                      onClick={() => openModal('card')}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', cursor: 'pointer' }}
                    >
                      <span>View implementation</span>
                      <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--text-muted)' }}>⟨ ⟩</span>
                    </motion.div>
                  )}
                </div>
                {/* Back face — the lid, pre-rotated so it reads upright at 180deg */}
                <div style={{ position: 'absolute', inset: 0, border: '2px solid var(--border)', background: 'var(--surface-alt)', borderRadius: 2, backfaceVisibility: 'hidden', transform: 'rotateX(180deg)', pointerEvents: c.open ? 'none' : 'auto' }} />
              </motion.div>
            </div>
          ))}
        </div>

        {/* Wrong guesses */}
        {wrong.length > 0 && (
          <div style={{ marginBottom: SECTION_GAP }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', marginBottom: 8 }}>Wrong guesses</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <AnimatePresence initial={false}>
                {wrong.map((name) => (
                  <motion.span
                    key={name}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={reduceMotion ? INSTANT : SPRING}
                    style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-accent)', background: 'var(--accent-lost)', borderRadius: 2, padding: '7px 12px' }}
                  >
                    ✕ {name}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Game over */}
        {isOver && reveal && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? INSTANT : EASE_OUT}
            style={{ position: 'relative', textAlign: 'center', padding: '20px clamp(12px, 4vw, 16px)', border: '2px solid var(--border)', borderRadius: 3, marginBottom: SECTION_GAP }}
          >
            {/* Second way back into the results popup, beside the header icon */}
            <motion.button
              {...pressable}
              onClick={() => setEndOpen(true)}
              title="Results"
              aria-label="Show results"
              style={{ position: 'absolute', top: 2, right: 2, width: 40, height: 40, border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg viewBox="0 0 16 16" width={16} height={16} style={{ display: 'block' }}>
                <path d="M3 13.5 L3 9 M8 13.5 L8 3 M13 13.5 L13 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
            </motion.button>
            {/* Side padding clears the icon so a long name can't run under it */}
            <div style={{ fontSize: 'clamp(20px, 5.5vw, 24px)', fontWeight: 800, color: 'var(--text)', paddingInline: 32 }}>{reveal.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-soft)', marginTop: 8, lineHeight: 1.5 }}>{reveal.description}</div>
            <motion.button
              {...pressable}
              ref={overTriggerRef}
              onClick={() => openModal('over')}
              style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: 'var(--btn-fg)', background: 'var(--btn-bg)', border: 'none', borderRadius: 3, padding: '10px 18px', cursor: 'pointer' }}
            >⟨ ⟩ View implementation</motion.button>
          </motion.div>
        )}

        {/* Guess input */}
        {!isOver && (
          <div style={{ display: 'flex', gap: 'clamp(6px, 2vw, 8px)', alignItems: 'stretch' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setDropdownOpen(true); setHi(0); }}
                onKeyDown={onKeyDown}
                disabled={loading || !daily}
                placeholder={loading ? (slowLoad ? 'Still grabbing…' : 'Loading…') : 'Type a structure or algorithm'}
                /* 16px keeps iOS from zooming the page on focus */
                style={{ width: '100%', minHeight: 46, padding: '13px clamp(11px, 3.5vw, 14px)', border: '2px solid var(--border-strong)', borderRadius: 3, fontSize: 16, fontFamily: FONT, background: 'var(--surface)', color: 'var(--text)' }}
              />
              <AnimatePresence>
                {dropdownOpen && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={reduceMotion ? INSTANT : { duration: 0.15 }}
                    ref={suggestRef}
                    style={{ position: 'absolute', bottom: 'calc(100% + 5px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 3, boxShadow: 'var(--shadow-drop)', zIndex: 5, maxHeight: SUGGEST_MAX_H, overflowY: 'auto', overscrollBehavior: 'contain' }}
                  >
                    {suggestions.map((s) => (
                      <motion.div
                        key={s.name}
                        {...pressableRow}
                        onClick={() => fill(s.name)}
                        className="dsadle-hover-bg"
                        style={{ padding: '12px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', borderTop: '1px solid var(--divider-soft)', background: s.bg }}
                      >{s.name}</motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <motion.button
              {...pressable}
              /* Motion's inline opacity outranks globals.css's `button:disabled`
                 rule, so the disabled state has to live in the animated value. */
              animate={{ opacity: submitting || loading || !daily ? 0.35 : 1 }}
              onClick={submitGuess}
              disabled={submitting || loading || !daily}
              style={{ flexShrink: 0, minHeight: 46, padding: '0 clamp(14px, 5vw, 22px)', background: 'var(--btn-bg)', color: 'var(--btn-fg)', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', cursor: 'pointer' }}
            >{submitting ? '…' : 'Guess'}</motion.button>
          </div>
        )}
      </div>

      {/* ── Results popup ── */}
      {/* z-index 45: over the sidebar (40), under the code window (50). */}
      <AnimatePresence>
        {endOpen && isOver && reveal && endInfo && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? INSTANT : EASE_OUT}
            onClick={closeEnd}
            style={{ position: 'fixed', inset: 0, background: 'var(--scrim-modal)', zIndex: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 4vw, 32px)' }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="dsadle-results-title"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={reduceMotion ? INSTANT : SPRING}
              onClick={(e) => e.stopPropagation()}
              // Scrolls without a visible bar: a bar down one side knocks the
              // centred layout off balance. Spacing below is kept tight so most
              // screens don't need to scroll at all.
              className="dsadle-no-scrollbar"
              style={{ position: 'relative', width: 'min(400px, 100%)', maxHeight: '92dvh', overflowY: 'auto', overscrollBehavior: 'contain', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text)', borderRadius: 10, boxShadow: '0 24px 70px rgba(0,0,0,.35)', padding: '18px clamp(16px, 5vw, 24px) 18px' }}
            >
              <motion.button
                {...pressable}
                onClick={closeEnd}
                aria-label="Close"
                style={{ position: 'absolute', top: 6, right: 6, width: 44, height: 44, border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg viewBox="0 0 16 16" width={16} height={16} style={{ display: 'block' }}>
                  <path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                </svg>
              </motion.button>

              {/* Headline and guess squares */}
              <div style={{ textAlign: 'center', paddingTop: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  {dateLabel}{offset !== 0 ? ' · Archive' : ''}
                </div>
                <div id="dsadle-results-title" style={{ fontSize: 30, fontWeight: 800, marginTop: 6, color: won ? 'var(--accent-won)' : 'var(--accent-lost)' }}>
                  {won ? `Guessed in ${solvedIn}` : 'Out of guesses'}
                </div>
                <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
                  {endTiles.map((t, i) => (
                    <div
                      key={i}
                      style={{
                        width: 24, height: 24, borderRadius: 3, boxSizing: 'border-box',
                        background: t === 'right' ? 'var(--accent-won)' : t === 'wrong' ? 'var(--accent-lost)' : 'transparent',
                        border: `2px solid ${t === 'right' ? 'var(--accent-won)' : t === 'wrong' ? 'var(--accent-lost)' : 'var(--border)'}`,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* The answer */}
              <div style={{ marginTop: 14, border: '2px solid var(--border)', borderRadius: 3, padding: '14px 16px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  {won ? 'The answer' : 'The answer was'}
                </div>
                <div style={{ fontSize: 23, fontWeight: 800, marginTop: 6 }}>{reveal.name}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-soft)', marginTop: 8 }}>{reveal.description}</div>
                <motion.button
                  {...pressable}
                  // Hands off to the code window, which warps from the inline
                  // "View implementation" button left on the page behind this.
                  onClick={() => { closeEnd(); openModal('over'); }}
                  style={{ marginTop: 14, minHeight: 40, fontSize: 13, fontWeight: 700, fontFamily: FONT, color: 'var(--btn-fg)', background: 'var(--btn-bg)', border: 'none', borderRadius: 3, padding: '0 16px', cursor: 'pointer' }}
                >⟨ ⟩ View implementation</motion.button>
              </div>

              {/* Statistics */}
              <div style={{ marginTop: 16, fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', textAlign: 'center' }}>Statistics</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4, marginTop: 8, textAlign: 'center' }}>
                {[
                  { value: endInfo.stats.played, label: 'Played' },
                  { value: endInfo.stats.winPct, label: 'Win %' },
                  { value: endInfo.stats.current, label: 'Current streak' },
                  { value: endInfo.stats.max, label: 'Max streak' },
                ].map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: 30, fontWeight: 400, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                    <div style={{ fontSize: 11, lineHeight: 1.25, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Guess distribution */}
              <div style={{ marginTop: 16, fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', textAlign: 'center' }}>Guess distribution</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {distRows.map((r) => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 12, fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{r.label}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: `${(r.count / distMax) * 100}%`, minWidth: 26, boxSizing: 'border-box',
                        background: r.hit ? (won ? 'var(--accent-won)' : 'var(--accent-lost)') : 'var(--bar)',
                        color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, textAlign: 'right',
                        padding: '3px 8px', borderRadius: 2,
                      }}>{r.count}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '16px 0 14px' }} />

              {/* Footer: what to do next */}
              {offset !== 0 ? (
                endInfo.nextUnplayed !== null ? (
                  <motion.button
                    {...pressableRow}
                    onClick={() => goToDay(endInfo.nextUnplayed as number)}
                    style={{ width: '100%', minHeight: 48, fontSize: 14, fontWeight: 700, fontFamily: FONT, color: 'var(--btn-fg)', background: 'var(--btn-bg)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  >Next unplayed day ›</motion.button>
                ) : (
                  <motion.button
                    {...pressableRow}
                    onClick={goHome}
                    style={{ width: '100%', minHeight: 48, fontSize: 14, fontWeight: 700, fontFamily: FONT, color: 'var(--btn-fg)', background: 'var(--btn-bg)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  >Back to today</motion.button>
                )
              ) : hasNext ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Next DSAdle</div>
                  <div style={{ fontSize: 28, fontWeight: 400, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCountdown((todayIdx + 1) * 86400000 - now)}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Next DSAdle</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>Not scheduled yet</div>
                  <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--text-muted)', marginTop: 4 }}>New puzzles are on the way. Catch up on past days while you wait.</div>
                  <motion.button
                    {...pressableRow}
                    onClick={() => { closeEnd(); setSideOpen(true); setSideView('archive'); }}
                    style={{ width: '100%', minHeight: 48, marginTop: 12, fontSize: 14, fontWeight: 700, fontFamily: FONT, color: 'var(--btn-fg)', background: 'var(--btn-bg)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  >Play the archive</motion.button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Code modal ── */}
      <AnimatePresence custom={exitMode}>
        {modalOpen && (
          <motion.div
            key="code-modal"
            custom={exitMode}
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => closeModal('instant')}
            style={{ position: 'fixed', inset: 0, background: 'var(--scrim-modal)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 4vw, 32px)' }}
          >
            {/* No enter/exit animation of its own: the warping copy is the
                transition in both directions, and a competing fade here stalls. */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <motion.div ref={boxRef} layout transition={reduceMotion ? INSTANT : { duration: 0.3, ease: 'easeInOut' }} style={modalBoxStyle}>
                <motion.div layout="position" style={MODAL_HEADER_STYLE}>
                  <div
                    onMouseEnter={() => setLightsHover(true)}
                    onMouseLeave={() => setLightsHover(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
                  >
                    <TrafficLight color="#ff5f57" glyphColor="#4d0000" hoverClass="dsadle-hover-red" title="Close" visible={lightsHover} onClick={() => closeModal('instant')}>
                      <path d="M3.9 3.9 L8.1 8.1 M8.1 3.9 L3.9 8.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                    </TrafficLight>
                    <TrafficLight color="#febc2e" glyphColor="#995700" hoverClass="dsadle-hover-yellow" title="Minimize" visible={lightsHover} onClick={minimizeModal}>
                      <path d="M3.4 6 L8.6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                    </TrafficLight>
                    <TrafficLight color="#28c840" glyphColor="#006500" hoverClass="dsadle-hover-green" title={modalExpanded ? 'Restore' : 'Expand'} visible={lightsHover} onClick={() => setModalExpanded((v) => !v)}>
                      {modalExpanded ? (
                        /* Restore — right angles meet at the centre, tips pointing inward */
                        <path d="M5.4 5.4 L5.4 3.1 L3.1 5.4 Z M6.6 6.6 L6.6 8.9 L8.9 6.6 Z" fill="currentColor" />
                      ) : (
                        /* Expand — right angles at the outer corners, tips pointing outward */
                        <path d="M3.4 3.4 L8.0 3.4 L3.4 8.0 Z M8.6 8.6 L4.0 8.6 L8.6 4.0 Z" fill="currentColor" />
                      )}
                    </TrafficLight>
                    <span style={MODAL_FILENAME_STYLE}>example_implementation.py</span>
                  </div>
                </motion.div>
                <motion.pre layout="position" style={MODAL_PRE_STYLE}>{codeSnippet}</motion.pre>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Minimize / restore ── */}
      {genie && <Genie state={genie} onDone={() => setGenie(null)} />}

      {/* ── Sidebar ── */}
      <AnimatePresence>
        {sideOpen && (
          <motion.div key="sidebar" style={{ position: 'fixed', inset: 0, zIndex: 40 }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? INSTANT : EASE_OUT}
              onClick={() => setSideOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'var(--scrim)' }}
            />
            {/* Percentage offsets, not pixels — the panel narrows with the
                viewport and the slide has to travel exactly its own width */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={reduceMotion ? INSTANT : EASE_OUT}
              onClick={(e) => e.stopPropagation()}
              style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 'min(280px, 82vw)', background: 'var(--surface)', boxShadow: 'var(--shadow-side)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >

              {/* Sidebar header */}
              <div style={{ padding: `14px ${SIDE_PAD}`, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text)' }}>DSAdle</div>
                <motion.button {...pressable} onClick={() => setSideOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: '1' }}>×</motion.button>
              </div>

              {/* Panes */}
              <AnimatePresence mode="wait" initial={false}>
                {sideView === 'main' ? (
                  <motion.div
                    key="main"
                    initial={{ x: '-100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '-100%', opacity: 0 }}
                    transition={reduceMotion ? INSTANT : { duration: 0.2, ease: 'easeOut' }}
                    style={{ flex: 1, overflowY: 'auto' }}
                  >
                    <motion.div {...pressableRow} onClick={goHome} className="dsadle-hover-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `16px ${SIDE_PAD}`, cursor: 'pointer', borderBottom: '1px solid var(--divider)', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                      <span>Today&apos;s Puzzle</span>
                      <span style={{ color: 'var(--text-muted)' }}>›</span>
                    </motion.div>
                    <motion.div {...pressableRow} onClick={() => setSideView('archive')} className="dsadle-hover-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `16px ${SIDE_PAD}`, cursor: 'pointer', borderBottom: '1px solid var(--divider)', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                      <span>Archive</span>
                      <span style={{ color: 'var(--text-muted)' }}>›</span>
                    </motion.div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="archive"
                    initial={{ x: '100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '100%', opacity: 0 }}
                    transition={reduceMotion ? INSTANT : { duration: 0.2, ease: 'easeOut' }}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
                  >
                    {/* Two controls, not one: keeps the calendar icon's click from
                        bubbling into the back navigation. */}
                    <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'stretch' }}>
                      <motion.div
                        {...pressableRow}
                        onClick={() => setSideView('main')}
                        className="dsadle-hover-bg"
                        style={{ flex: 1, padding: `12px ${SIDE_PAD}`, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>‹</span>
                        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>Archive</span>
                      </motion.div>
                      <motion.button
                        {...pressable}
                        onClick={() => setCalOpen((v) => !v)}
                        title="Jump to date"
                        aria-label="Jump to date"
                        animate={{ opacity: calOpen ? 1 : 0.75 }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: `0 ${SIDE_PAD}`, display: 'flex', alignItems: 'center', color: calOpen ? 'var(--text)' : 'var(--text-muted)' }}
                      >
                        <svg viewBox="0 0 16 16" width={15} height={15} style={{ display: 'block' }}>
                          {/* Calendar: same 16-unit grid, 1.6 stroke and round caps as the app's other glyphs */}
                          <rect x="2" y="3.2" width="12" height="10.8" rx="1.8" stroke="currentColor" strokeWidth="1.6" fill="none" />
                          <path d="M2 6.8 L14 6.8 M5.3 1.6 L5.3 4.4 M10.7 1.6 L10.7 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                          <rect x="9.4" y="9.2" width="2.4" height="2.4" rx=".5" fill="currentColor" />
                        </svg>
                      </motion.button>
                    </div>

                    {/* Month grid */}
                    <AnimatePresence initial={false}>
                      {calOpen && calendar && (
                        <motion.div
                          key="calendar"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={reduceMotion ? INSTANT : EASE_OUT}
                          style={{ flexShrink: 0, overflow: 'hidden', borderBottom: '1px solid var(--border)' }}
                        >
                          <div style={{ padding: `10px ${SIDE_PAD} 14px` }}>
                            {/* Month nav */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <motion.button {...pressable} onClick={() => shiftMonth(-1)} disabled={calendar.atLaunchMonth} style={calNavStyle}>‹</motion.button>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{calendar.label}</div>
                              <motion.button {...pressable} onClick={() => shiftMonth(1)} disabled={calendar.atCurrentMonth} style={calNavStyle}>›</motion.button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                              {WEEKDAYS.map((w, i) => (
                                <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', paddingBottom: 4 }}>{w}</div>
                              ))}
                            </div>

                            <AnimatePresence mode="wait" initial={false}>
                              <motion.div
                                key={calendar.label}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={reduceMotion ? INSTANT : { duration: 0.15 }}
                                style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}
                              >
                                {calendar.cells.map((cell, i) => {
                                  if (!cell) return <div key={i} />;
                                  const selected = cell.dayIdx === dayIdx;
                                  return (
                                    <motion.button
                                      key={i}
                                      {...(cell.locked ? {} : pressable)}
                                      className="dsadle-cal-day"
                                      /* Absent, not empty, on unplayed days — that's what
                                         :not([data-status]) keys the tint off */
                                      data-status={cell.status ?? undefined}
                                      onClick={() => goToDay(cell.dayIdx)}
                                      disabled={cell.locked}
                                      title={labelForDay(cell.dayIdx)}
                                      style={{
                                        aspectRatio: '1', border: selected ? '2px solid var(--text)' : cell.isToday ? '1px solid var(--border-strong)' : '1px solid transparent',
                                        borderRadius: 3, fontSize: 11, fontWeight: 700, fontFamily: FONT, padding: 0,
                                        cursor: cell.locked ? 'default' : 'pointer',
                                        background: cell.status === 'won' ? 'var(--accent-won)' : cell.status === 'lost' ? 'var(--accent-lost)' : 'transparent',
                                        color: cell.status ? 'var(--on-accent)' : 'var(--text)',
                                      }}
                                    >{cell.date}</motion.button>
                                  );
                                })}
                              </motion.div>
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      {archiveDays.map((day) => (
                        <motion.div key={day.dayIdx} {...pressableRow} onClick={() => goToDay(day.dayIdx)} className="dsadle-hover-bg" style={{ padding: `13px ${SIDE_PAD}`, borderBottom: '1px solid var(--divider)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{day.label}</div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: day.dotColor }}>{day.dot}</span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Outside the pane swap, so it stays put in both views */}
              <div style={{
                flexShrink: 0, borderTop: '1px solid var(--border)', padding: `14px ${SIDE_PAD}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Dark mode</span>
                <Switch
                  checked={theme === 'dark'}
                  onChange={(next) => applyTheme(next ? 'dark' : 'light')}
                  label="Dark mode"
                  reduceMotion={!!reduceMotion}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
