'use client';

import { ReactNode, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { filterLabel, SandboxStats, SessionSummary } from '@/lib/sandbox';

const SPRING = { type: 'spring', stiffness: 300, damping: 28 } as const;
const EASE_OUT = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;
const INSTANT = { duration: 0 } as const;

const pressable = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.94 },
  transition: { type: 'spring', stiffness: 500, damping: 30 },
} as const;

const pressableRow = {
  whileTap: { scale: 0.98 },
  transition: { type: 'spring', stiffness: 500, damping: 30 },
} as const;

/** Daily + archive totals; the same shape DSAdle's computeStats returns. */
export type DailyStats = {
  played: number;
  winPct: number;
  current: number;
  max: number;
  dist: number[];
  losses: number;
};

const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)',
};

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function sessionDate(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? 'Today' : dateFmt.format(d);
}

// ─── Shell ───────────────────────────────────────────────────────────────────

// Same look as the post-game popup in DSAdle.tsx, plus Escape to close.
function Modal({ open, onClose, labelledBy, children }: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="stats-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion ? INSTANT : EASE_OUT}
          onClick={onClose}
          // z-index 45: same layer as the results popup, under the code window.
          style={{ position: 'fixed', inset: 0, background: 'var(--scrim-modal)', zIndex: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 4vw, 32px)' }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={reduceMotion ? INSTANT : SPRING}
            onClick={(e) => e.stopPropagation()}
            className="dsadle-no-scrollbar"
            style={{ position: 'relative', width: 'min(420px, 100%)', maxHeight: '92dvh', overflowY: 'auto', overscrollBehavior: 'contain', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text)', borderRadius: 10, boxShadow: '0 24px 70px rgba(0,0,0,.35)', padding: '18px clamp(16px, 5vw, 24px)' }}
          >
            <motion.button
              {...pressable}
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ position: 'absolute', top: 6, right: 6, width: 44, height: 44, border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" style={{ display: 'block' }}>
                <path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
              </svg>
            </motion.button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StatRow({ stats }: { stats: { value: ReactNode; label: string; strong?: boolean }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, gap: 4, textAlign: 'center' }}>
      {stats.map((s) => (
        <div key={s.label}>
          <div style={{ fontSize: 28, fontWeight: s.strong ? 800 : 400, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
          <div style={{ fontSize: 11, lineHeight: 1.25, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span style={{
      width: 30, height: 30, flexShrink: 0, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 800,
      background: rank === 1 ? 'var(--btn-bg)' : 'var(--bar)',
      color: rank === 1 ? 'var(--btn-fg)' : 'var(--on-accent)',
    }}>{rank}</span>
  );
}

// ─── Global stats (header icon) ──────────────────────────────────────────────

export function GlobalStatsModal({ open, onClose, daily, sandbox, tagLabels }: {
  open: boolean;
  onClose: () => void;
  daily: DailyStats | null;
  sandbox: SandboxStats;
  tagLabels: Record<string, string>;
}) {
  const distRows = daily
    ? [...daily.dist.map((count, i) => ({ label: String(i + 1), count, lost: false })),
       { label: '✕', count: daily.losses, lost: true }]
    : [];
  const distMax = Math.max(1, ...distRows.map((r) => r.count));
  const sandboxAcc = sandbox.rounds ? Math.round((sandbox.solved / sandbox.rounds) * 100) : 0;

  return (
    <Modal open={open} onClose={onClose} labelledBy="dsadle-stats-title">
      <div id="dsadle-stats-title" style={{ textAlign: 'center', paddingTop: 6, fontSize: 14, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Statistics</div>

      {/* Daily & archive */}
      <section style={{ marginTop: 16 }}>
        <h3 style={{ ...label, margin: '0 0 10px' }}>Daily &amp; archive</h3>
        {daily && (
          <>
            <StatRow stats={[
              { value: daily.played, label: 'Played' },
              { value: daily.winPct, label: 'Win %' },
              { value: daily.current, label: 'Current streak' },
              { value: daily.max, label: 'Max streak' },
            ]} />
            <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.4, color: 'var(--text-muted)', textAlign: 'center' }}>
              Streaks count daily puzzles solved on their own day. Archive games count toward Played and Win %.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
              {distRows.map((r) => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 12, fontSize: 13, fontWeight: 700, textAlign: 'right' }} aria-label={r.lost ? 'Lost' : `${r.label} guesses`}>{r.label}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: `${(r.count / distMax) * 100}%`, minWidth: 26, boxSizing: 'border-box',
                      background: r.lost ? 'var(--accent-lost)' : 'var(--bar)', color: 'var(--on-accent)',
                      fontSize: 12, fontWeight: 700, textAlign: 'right', padding: '3px 8px', borderRadius: 2,
                    }}>{r.count}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <div style={{ height: 1, background: 'var(--border)', margin: '18px 0 16px' }} />

      {/* Sandbox */}
      <section>
        <h3 style={{ ...label, margin: '0 0 10px' }}>Sandbox</h3>
        <StatRow stats={[
          { value: sandbox.sessions, label: 'Sessions' },
          { value: sandbox.rounds, label: 'Rounds' },
          { value: sandboxAcc, label: 'Accuracy %' },
        ]} />
        <h4 style={{ ...label, margin: '16px 0 8px' }}>Best sessions</h4>
        {sandbox.best.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--text-muted)' }}>
            Finish a sandbox session to get on the board. Harder filters and higher accuracy score more.
          </p>
        ) : (
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sandbox.best.map((s, i) => (
              <li key={s.endedAt} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '2px solid var(--border)', borderRadius: 3 }}>
                <RankBadge rank={i + 1} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filterLabel(s.filter, tagLabels)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.rounds} round{s.rounds === 1 ? '' : 's'} · {s.accuracy}% · {sessionDate(s.endedAt)}</span>
                </span>
                <span style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{s.score}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Modal>
  );
}

// ─── Session complete ────────────────────────────────────────────────────────

export function SessionEndModal({ summary, rank, rounds, tagLabels, onClose, onPlayAgain, onChangeFilters }: {
  summary: SessionSummary | null;
  rank: number | null;
  /** Won/lost per round, in order, for the squares. */
  rounds: boolean[];
  tagLabels: Record<string, string>;
  onClose: () => void;
  onPlayAgain: () => void;
  onChangeFilters: () => void;
}) {
  const btn: React.CSSProperties = {
    width: '100%', minHeight: 48, fontSize: 14, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
  };
  return (
    <Modal open={summary !== null} onClose={onClose} labelledBy="dsadle-session-title">
      {summary && (
        <>
          <div style={{ textAlign: 'center', paddingTop: 6 }}>
            <div style={{ ...label, paddingInline: 36 }}>Sandbox · {filterLabel(summary.filter, tagLabels)}</div>
            <div id="dsadle-session-title" style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>Session complete</div>
            <div role="img" aria-label={`${summary.solved} of ${summary.rounds} rounds solved`} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 12 }}>
              {rounds.map((won, i) => (
                <span key={i} style={{ width: 22, height: 22, borderRadius: 3, background: won ? 'var(--accent-won)' : 'var(--accent-lost)' }} />
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <StatRow stats={[
              { value: summary.rounds, label: 'Rounds' },
              { value: summary.accuracy, label: 'Accuracy %' },
              { value: summary.difficulty.toFixed(1), label: 'Difficulty' },
              { value: summary.score, label: 'Score', strong: true },
            ]} />
          </div>

          <div style={{ marginTop: 16, border: '2px solid var(--border)', borderRadius: 3, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            {rank !== null && <RankBadge rank={rank} />}
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                {rank === 1 ? 'New best session' : rank !== null ? `#${rank} of your best sessions` : 'Not in your top 3 this time'}
              </span>
              <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-muted)' }}>
                {summary.accuracy}% accuracy × difficulty {summary.difficulty.toFixed(1)}
                {summary.rounds < 5 ? ` × ${summary.rounds}/5 rounds (play 5+ for full credit)` : ''}
              </span>
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
            <motion.button type="button" {...pressableRow} onClick={onPlayAgain}
              style={{ ...btn, border: 'none', background: 'var(--btn-bg)', color: 'var(--btn-fg)' }}
            >Play again with this filter</motion.button>
            <motion.button type="button" {...pressableRow} onClick={onChangeFilters}
              style={{ ...btn, border: '2px solid var(--border-strong)', background: 'transparent', color: 'var(--text)' }}
            >Change filters</motion.button>
          </div>
        </>
      )}
    </Modal>
  );
}
