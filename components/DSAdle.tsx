'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef, KeyboardEvent, CSSProperties, ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { fetchNames, fetchDaily, submitGuesses, DailyClues, Reveal } from '@/lib/api';

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MAX_GUESSES = 5;

// Day indices are UTC epoch-days, so labels must be formatted in UTC too —
// formatting UTC midnight in local time shifts the date back a day west of UTC.
const DATE_FMT: Intl.DateTimeFormatOptions = {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
};

const calNavStyle: CSSProperties = {
  border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
  fontSize: 16, fontWeight: 700, lineHeight: 1, padding: '2px 8px',
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ─── Animation ─────────────────────────────────────────────────────────────

const SPRING = { type: 'spring', stiffness: 300, damping: 28 } as const;
const EASE_OUT = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;
const INSTANT = { duration: 0 } as const;
// Minimize/restore: the window scales toward the button that opened it
const SHRINK = { duration: 0.3 } as const;
// Duration-based spring: `duration`/`bounce` replace stiffness/damping, never mix the two
const FLIP = { type: 'spring', duration: 0.8, bounce: 0.18 } as const;

// Spread onto any clickable control for consistent press feedback
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

function keyFor(offset: number): string {
  return keyForDay(todayIndex() + offset);
}

function readGuesses(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveGuesses(names: string[], offset: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(keyFor(offset), JSON.stringify(names));
  } catch {}
}

// ─── Modal chrome ──────────────────────────────────────────────────────────

// Shared by the real window and by the animating copy, so the two can't drift
// apart visually.
const MODAL_HEADER_STYLE: CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '13px 18px',
  background: '#2a2a30', borderBottom: '1px solid #3a3a42', flexShrink: 0,
};

const MODAL_PRE_STYLE: CSSProperties = {
  margin: 0, padding: 22, overflow: 'auto',
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontSize: 12.5, lineHeight: 1.65, color: '#e6e6ea', whiteSpace: 'pre',
};

const MODAL_FILENAME_STYLE: CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: '#b8b8c0', marginLeft: 8,
};

const LIGHT_COLORS = ['#ff5f57', '#febc2e', '#28c840'];

function readResult(dayIdx: number): 'won' | 'lost' | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('dsadle-result-' + dayIdx);
  return raw === 'won' || raw === 'lost' ? raw : null;
}

function saveResult(dayIdx: number, result: 'won' | 'lost'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('dsadle-result-' + dayIdx, result);
  } catch {}
}

// ─── Theme ─────────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark';

// Reads the DOM attribute rather than localStorage: the inline script in
// layout.tsx has already resolved stored-choice vs. OS preference before first
// paint, so the attribute is the one value that can't disagree with what the
// user is looking at.
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

// 'lost' also covers games left in progress — anything attempted but not won
function dayStatus(dayIdx: number): 'won' | 'lost' | null {
  if (readResult(dayIdx) === 'won') return 'won';
  return readGuesses(keyForDay(dayIdx)).length > 0 ? 'lost' : null;
}

function labelForDay(dayIdx: number): string {
  return new Date(dayIdx * 86400000).toLocaleDateString('en-US', DATE_FMT);
}

// ─── macOS traffic light ───────────────────────────────────────────────────

// Circle plus a glyph that fades in with the group hover, matching how macOS
// reveals all three symbols whenever the pointer is anywhere over the cluster.
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
// Literal, not tokens: Motion can't interpolate a CSS variable, and "on" always
// means dark mode, so this pair never varies by theme.
const TRACK_OFF = '#d3d6da', TRACK_ON = '#34c759';
// The pressable feel, damped a little harder so the knob settles instead of
// overshooting past the end of the track.
const SWITCH_SPRING = { type: 'spring', stiffness: 500, damping: 32 } as const;

// iOS-style toggle. The knob animates `x` rather than `layout` — this lives
// inside the sidebar, which is itself a motion.div translating on x, and layout
// projection inside a transforming ancestor is what makes knobs jitter.
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

// ─── Shrink ────────────────────────────────────────────────────────────────

type Rect = { x: number; y: number; w: number; h: number };
type ShrinkState = { from: Rect; to: Rect; dir: 'in' | 'out' };

// A copy of the window that scales between its own rect and the trigger that
// opened it, fading as it lands. Scale is uniform on purpose — matching the
// button's aspect exactly would visibly squash the code text.
function Shrink({ state, children, onDone }: {
  state: ShrinkState;
  children: ReactNode;
  onDone: () => void;
}) {
  const { from, to, dir } = state;

  const collapsed = {
    x: (to.x + to.w / 2) - (from.x + from.w / 2),
    y: (to.y + to.h / 2) - (from.y + from.h / 2),
    scale: to.w / from.w,
    opacity: 0,
  };
  const expanded = { x: 0, y: 0, scale: 1, opacity: 1 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 51, pointerEvents: 'none' }}>
      <motion.div
        initial={dir === 'out' ? expanded : collapsed}
        animate={dir === 'out' ? collapsed : expanded}
        transition={{ duration: SHRINK.duration, ease: dir === 'out' ? 'easeIn' : 'easeOut' }}
        onAnimationComplete={onDone}
        style={{
          position: 'absolute',
          left: from.x, top: from.y, width: from.w, height: from.h,
          transformOrigin: 'center',
          willChange: 'transform, opacity',
        }}
      >
        {children}
      </motion.div>
    </div>
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
  const [retryTick, setRetryTick] = useState(0);
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
  const [shrink, setShrink] = useState<ShrinkState | null>(null);
  const [pendingShrinkOpen, setPendingShrinkOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  // Set on mount rather than at declaration — todayIndex() is client-only
  const [calMonth, setCalMonth] = useState<{ y: number; m: number } | null>(null);
  // Safe as a lazy initializer with no mount gate: page.tsx loads this
  // component with ssr:false, so the first render already follows the inline
  // theme script.
  const [theme, setTheme] = useState<Theme>(readTheme);

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
      const d = new Date(todayIndex() * 86400000);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setDaily(null);
      setResults([]);
      setReveal(null);
      const dayIdx = todayIndex() + offset;
      const saved = readGuesses(keyFor(offset));
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
          } catch {
            // Saved guesses reference names no longer in the question bank
            if (cancelled) return;
            setGuesses([]);
            saveGuesses([], offset);
          }
        }
      } catch {
        if (!cancelled) setError('Could not reach the DSAdle server. Is the backend running?');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [offset, retryTick]);

  // ── Derived values ────────────────────────────────────────────────────────

  const dayIdx = todayIndex() + offset;
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
    return names.filter(
      (n) => !used.has(n) && n.toLowerCase().includes(trimmed)
    ).slice(0, 6);
  }

  const suggList = getSuggestions();
  const hiClamped = Math.min(hi, Math.max(0, suggList.length - 1));
  const suggestions = suggList.map((name, i) => ({
    name,
    bg: i === hiClamped ? 'var(--surface-hi)' : 'var(--surface)',
  }));

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
      saveGuesses(next, offset);
      if (r.game_over) saveResult(dayIdx, r.won ? 'won' : 'lost');
      setError(null);
      setQ('');
      setDropdownOpen(false);
      setHi(0);
    } catch {
      setError('Guess failed — check that the backend is running, then try again.');
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

  function navigate(delta: number) {
    setOffset((prev) => Math.min(0, prev + delta));
    setQ('');
    setDropdownOpen(false);
  }

  function navigateTo(target: number) {
    setOffset(Math.min(0, target));
    setQ('');
    setDropdownOpen(false);
  }

  function goHome() {
    navigateTo(0);
    setSideOpen(false);
  }

  // Shared by the archive list and the calendar; navigateTo clamps out the future
  function goToDay(target: number) {
    navigateTo(target - todayIndex());
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
    if (!reduceMotion) setPendingShrinkOpen(true);
  }

  function minimizeModal() {
    const from = toRect(boxRef.current);
    // Must measure before closeModal, which resets modalExpanded in the same batch
    if (reduceMotion || !from) { closeModal('instant'); return; }
    setShrink({ from, to: triggerRect(openedFrom), dir: 'out' });
    closeModal('minimize');
  }

  // Measure the real box once it's mounted, then scale a copy up over it.
  // Predicting the rect instead would be wrong for `height: auto`.
  useLayoutEffect(() => {
    if (!pendingShrinkOpen || !modalOpen || !boxRef.current) return;
    const from = toRect(boxRef.current);
    if (from) setShrink({ from, to: triggerRect(openedFrom), dir: 'in' });
    setPendingShrinkOpen(false);
    // triggerRect/toRect read refs only; re-running on identity churn is pointless
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingShrinkOpen, modalOpen, openedFrom]);

  // ── Archive days ──────────────────────────────────────────────────────────

  // Memoised: each entry hits localStorage twice, and this ran on every render
  const archiveDays = useMemo(
    () => (mounted
      ? Array.from({ length: 30 }, (_, i) => {
          const dayOff = -(i + 1);
          const d = todayIndex() + dayOff;
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
    [mounted, guesses],
  );

  // ── Calendar ──────────────────────────────────────────────────────────────

  // All arithmetic is UTC — day indices are UTC epoch-days, and mixing in local
  // accessors is what shifts dates by one either side of midnight.
  const calendar = useMemo(() => {
    if (!mounted || !calMonth) return null;
    const { y, m } = calMonth;
    const today = todayIndex();
    const firstWeekday = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const todayDate = new Date(today * 86400000);
    const isCurrentMonth = todayDate.getUTCFullYear() === y && todayDate.getUTCMonth() === m;

    const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, i) => {
      if (i < firstWeekday) return null;
      const date = i - firstWeekday + 1;
      const d = Date.UTC(y, m, date) / 86400000;
      return { date, dayIdx: d, status: dayStatus(d), future: d > today, isToday: d === today };
    });

    return { cells, label: `${MONTHS[m]} ${y}`, atCurrentMonth: isCurrentMonth };
    // `guesses` is a localStorage cache key, not a value read above — see archiveDays
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, calMonth, guesses]);

  function shiftMonth(delta: number) {
    setCalMonth((prev) => {
      if (!prev) return prev;
      const d = new Date(Date.UTC(prev.y, prev.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  }

  // ── Modal box style ───────────────────────────────────────────────────────

  const modalBoxStyle: CSSProperties = {
    background: '#1e1e22',
    borderRadius: '10px',
    boxShadow: '0 24px 70px rgba(0,0,0,.45)',
    width: modalExpanded ? '96%' : '580px',
    maxWidth: modalExpanded ? '96%' : '100%',
    height: modalExpanded ? '92vh' : 'auto',
    maxHeight: modalExpanded ? '92vh' : '82vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    // Mounted but concealed while the animating copy scales in over the top
    visibility: pendingShrinkOpen || shrink?.dir === 'in' ? 'hidden' : 'visible',
  };

  // ── Modal / traffic-light animation ───────────────────────────────────────

  // Memoised: these are recreated on every render otherwise, and swapping the
  // variants object mid-animation leaves Motion stalled part-way through.
  //
  // Exit is a dynamic variant so AnimatePresence's `custom` prop supplies the
  // mode at removal time — reading it from state would give the stale value.
  const backdropVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: reduceMotion ? INSTANT : EASE_OUT },
    exit: (mode: 'instant' | 'minimize') => ({
      opacity: 0,
      // Hold the scrim for the shrink's travel so it doesn't pop out from under it
      transition: mode === 'minimize' && !reduceMotion ? { duration: SHRINK.duration } : INSTANT,
    }),
  }), [reduceMotion]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: FONT, color: 'var(--text)' }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px' }}>
          <motion.span
            {...pressable}
            onClick={() => { setSideOpen(true); setSideView('main'); }}
            style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 21, cursor: 'pointer', lineHeight: '1' }}
          >☰</motion.span>
          <div
            onClick={goHome}
            style={{ fontSize: 30, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--text)', cursor: 'pointer' }}
          >DSAdle</div>
          <span style={{ width: 26, height: 26 }} />
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '18px 16px 56px', boxSizing: 'border-box' }}>

        {/* Nav row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          <motion.button {...pressable} onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, padding: 4 }}>‹ Prev</motion.button>
          <div style={{ fontWeight: 600 }}>{dateLabel} · {attemptsLeft} guesses left</div>
          <motion.button {...pressable} onClick={() => navigate(1)} disabled={offset >= 0} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, padding: 4 }}>Next ›</motion.button>
        </div>

        {/* Subtitle */}
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.4 }}>
          Guess the data structure or algorithm.<br />A new clue unlocks with every guess.
        </div>

        {/* Backend error */}
        {error && (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--accent-lost)', border: '2px solid var(--accent-lost)', borderRadius: 3, padding: '12px 16px', marginBottom: 18, lineHeight: 1.4 }}>
            {error}
            <motion.button
              {...pressable}
              onClick={() => setRetryTick((t) => t + 1)}
              style={{ display: 'block', margin: '10px auto 0', fontSize: 12, fontWeight: 700, color: 'var(--on-accent)', background: 'var(--accent-lost)', border: 'none', borderRadius: 3, padding: '7px 14px', cursor: 'pointer' }}
            >Retry</motion.button>
          </div>
        )}

        {/* Clue cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
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
                <div style={{ position: 'relative', minHeight: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '10px 16px', background: 'var(--surface)', border: '2px solid var(--border-strong)', color: 'var(--text)', fontWeight: 700, fontSize: 15, borderRadius: 2, lineHeight: 1.3, backfaceVisibility: 'hidden' }}>
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
          <div style={{ marginBottom: 18 }}>
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
            style={{ textAlign: 'center', padding: '20px 16px', border: '2px solid var(--border)', borderRadius: 3, marginBottom: 18 }}
          >
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{reveal.name}</div>
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setDropdownOpen(true); setHi(0); }}
                onKeyDown={onKeyDown}
                disabled={loading || !daily}
                placeholder={loading ? 'Loading…' : 'Type a structure or algorithm'}
                style={{ width: '100%', padding: '13px 14px', border: '2px solid var(--border-strong)', borderRadius: 3, fontSize: 14, fontFamily: FONT, background: 'var(--surface)', color: 'var(--text)' }}
              />
              <AnimatePresence>
                {dropdownOpen && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={reduceMotion ? INSTANT : { duration: 0.15 }}
                    style={{ position: 'absolute', bottom: 'calc(100% + 5px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 3, boxShadow: 'var(--shadow-drop)', zIndex: 5, overflow: 'hidden' }}
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
              animate={{ opacity: submitting ? 0.6 : 1 }}
              onClick={submitGuess}
              disabled={submitting || loading || !daily}
              style={{ flexShrink: 0, padding: '0 22px', background: 'var(--btn-bg)', color: 'var(--btn-fg)', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', cursor: 'pointer' }}
            >{submitting ? '…' : 'Guess'}</motion.button>
          </div>
        )}
      </div>

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
            style={{ position: 'fixed', inset: 0, background: 'var(--scrim-modal)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}
          >
            {/* Centring wrapper. It deliberately has no enter/exit animation of
                its own — the scaling copy is the transition in both directions,
                and a competing fade here stalls part-way when that state churns. */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <motion.div ref={boxRef} layout transition={reduceMotion ? INSTANT : { duration: 0.3, ease: 'easeInOut' }} style={modalBoxStyle}>
                <motion.div layout="position" style={MODAL_HEADER_STYLE}>
                  <div
                    onMouseEnter={() => setLightsHover(true)}
                    onMouseLeave={() => setLightsHover(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
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
      {shrink && (
        <Shrink state={shrink} onDone={() => setShrink(null)}>
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#1e1e22', borderRadius: 10, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,.45)' }}>
            <div style={MODAL_HEADER_STYLE}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {LIGHT_COLORS.map((c) => (
                  <span key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c, flexShrink: 0, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,.15)' }} />
                ))}
                <span style={MODAL_FILENAME_STYLE}>example_implementation.py</span>
              </div>
            </div>
            <pre style={MODAL_PRE_STYLE}>{codeSnippet}</pre>
          </div>
        </Shrink>
      )}

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
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={reduceMotion ? INSTANT : EASE_OUT}
              onClick={(e) => e.stopPropagation()}
              style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 280, background: 'var(--surface)', boxShadow: 'var(--shadow-side)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >

              {/* Sidebar header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text)' }}>DSAdle</div>
                <motion.button {...pressable} onClick={() => setSideOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: '1' }}>×</motion.button>
              </div>

              {/* Panes — main slides left as archive slides in from the right */}
              <AnimatePresence mode="wait" initial={false}>
                {sideView === 'main' ? (
                  <motion.div
                    key="main"
                    initial={{ x: -280, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -280, opacity: 0 }}
                    transition={reduceMotion ? INSTANT : { duration: 0.2, ease: 'easeOut' }}
                    style={{ flex: 1, overflowY: 'auto' }}
                  >
                    <motion.div {...pressableRow} onClick={goHome} className="dsadle-hover-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', borderBottom: '1px solid var(--divider)', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                      <span>Today&apos;s Puzzle</span>
                      <span style={{ color: 'var(--text-muted)' }}>›</span>
                    </motion.div>
                    <motion.div {...pressableRow} onClick={() => setSideView('archive')} className="dsadle-hover-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', borderBottom: '1px solid var(--divider)', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                      <span>Archive</span>
                      <span style={{ color: 'var(--text-muted)' }}>›</span>
                    </motion.div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="archive"
                    initial={{ x: 280, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 280, opacity: 0 }}
                    transition={reduceMotion ? INSTANT : { duration: 0.2, ease: 'easeOut' }}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
                  >
                    {/* Two separate controls in one bar: back on the left,
                        calendar toggle on the right. Splitting them keeps the
                        icon's click from bubbling into the back navigation. */}
                    <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'stretch' }}>
                      <motion.div
                        {...pressableRow}
                        onClick={() => setSideView('main')}
                        className="dsadle-hover-bg"
                        style={{ flex: 1, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
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
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 20px', display: 'flex', alignItems: 'center', color: calOpen ? 'var(--text)' : 'var(--text-muted)' }}
                      >
                        <svg viewBox="0 0 16 16" width={15} height={15} style={{ display: 'block' }}>
                          <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" fill="none" />
                          <path d="M10.5 10.5 L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
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
                          <div style={{ padding: '10px 20px 14px' }}>
                            {/* Month nav */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <motion.button {...pressable} onClick={() => shiftMonth(-1)} style={calNavStyle}>‹</motion.button>
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
                                      {...(cell.future ? {} : pressable)}
                                      onClick={() => goToDay(cell.dayIdx)}
                                      disabled={cell.future}
                                      title={labelForDay(cell.dayIdx)}
                                      style={{
                                        aspectRatio: '1', border: selected ? '2px solid var(--text)' : cell.isToday ? '1px solid var(--border-strong)' : '1px solid transparent',
                                        borderRadius: 3, fontSize: 11, fontWeight: 700, fontFamily: FONT, padding: 0,
                                        cursor: cell.future ? 'default' : 'pointer',
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
                        <motion.div key={day.dayIdx} {...pressableRow} onClick={() => goToDay(day.dayIdx)} className="dsadle-hover-bg" style={{ padding: '13px 20px', borderBottom: '1px solid var(--divider)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{day.label}</div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: day.dotColor }}>{day.dot}</span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Pinned footer — sits outside the pane swap, so it stays put
                  in both the main and archive views */}
              <div style={{
                flexShrink: 0, borderTop: '1px solid var(--border)', padding: '14px 20px',
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
