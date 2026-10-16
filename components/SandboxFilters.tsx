'use client';

import { CSSProperties } from 'react';
import { motion } from 'motion/react';
import type { Difficulty, Facets, SandboxFilter } from '@/lib/api';
import { DIFFICULTIES, MAX_SESSION_ROUNDS, matchesFilter, sessionLength } from '@/lib/sandbox';

const pressable = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.96 },
  transition: { type: 'spring', stiffness: 500, damping: 30 },
} as const;

const sectionLabel: CSSProperties = {
  margin: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '.06em', color: 'var(--text-muted)',
};

function chipStyle(on: boolean, empty: boolean): CSSProperties {
  return {
    minHeight: 44, borderRadius: 3, cursor: 'pointer', fontWeight: 700,
    border: `2px solid ${on ? 'var(--btn-bg)' : 'var(--border-strong)'}`,
    background: on ? 'var(--btn-bg)' : 'var(--surface)',
    color: on ? 'var(--btn-fg)' : 'var(--text)',
    // Dimmed rather than disabled: picking it may still make sense alongside
    // another chip, and a disabled control can't be reached by keyboard.
    opacity: empty && !on ? 0.45 : 1,
  };
}

export default function SandboxFilters({ facets, filter, onChange, onStart, starting }: {
  facets: Facets | null;
  filter: SandboxFilter;
  onChange: (next: SandboxFilter) => void;
  onStart: () => void;
  starting: boolean;
}) {
  const items = facets?.items ?? [];
  const tagLabels = Object.fromEntries((facets?.tags ?? []).map((t) => [t.slug, t.label]));

  // Each dimension's counts assume the other dimension's current selection, so a
  // chip shows what you'd get by adding it.
  const diffCount = (d: Difficulty) =>
    items.filter((it) => it.difficulty === d && matchesFilter(it, { ...filter, difficulties: [] })).length;
  const tagCount = (slug: string) =>
    items.filter((it) => it.tags.includes(slug) && matchesFilter(it, { ...filter, tags: [] })).length;
  const matches = items.filter((it) => matchesFilter(it, filter)).length;
  const rounds = sessionLength(matches);

  function toggle<K extends keyof SandboxFilter>(key: K, value: SandboxFilter[K][number]) {
    const cur = filter[key] as string[];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    onChange({ ...filter, [key]: next });
  }

  const guessScope = filter.tags.length
    ? `every name tagged ${filter.tags.map((t) => tagLabels[t] ?? t).join(' or ')}, at any difficulty`
    : 'the full name bank';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ ...sectionLabel }}>Sandbox</div>
        <h1 style={{ margin: '6px 0 0', fontSize: 'clamp(22px, 6vw, 26px)', fontWeight: 800, color: 'var(--text)' }}>Practice by type</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--text-muted)' }}>
          Play DSAdle by category using past puzzles,<br />up to {MAX_SESSION_ROUNDS} per session.
        </p>
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <h2 style={sectionLabel}>Difficulty</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>None picked = all</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {DIFFICULTIES.map((d) => {
            const on = filter.difficulties.includes(d);
            const n = diffCount(d);
            return (
              <motion.button
                key={d}
                type="button"
                {...pressable}
                aria-pressed={on}
                onClick={() => toggle('difficulties', d)}
                style={{ ...chipStyle(on, n === 0), minHeight: 58, padding: '8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2, textAlign: 'left' }}
              >
                <span style={{ fontSize: 'clamp(12px, 3.4vw, 14px)' }}>{d}</span>
                <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.75 }}>{facets ? `${n} puzzle${n === 1 ? '' : 's'}` : '…'}</span>
              </motion.button>
            );
          })}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <h2 style={sectionLabel}>Family</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>A puzzle can have several</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(facets?.tags ?? []).map((t) => {
            const on = filter.tags.includes(t.slug);
            const n = tagCount(t.slug);
            return (
              <motion.button
                key={t.slug}
                type="button"
                {...pressable}
                aria-pressed={on}
                onClick={() => toggle('tags', t.slug)}
                style={{ ...chipStyle(on, n === 0), padding: '0 12px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {t.label}
                <span style={{ fontWeight: 600, opacity: 0.7 }}>{n}</span>
              </motion.button>
            );
          })}
          {!facets && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading families…</span>}
        </div>
      </section>

      <section aria-live="polite" style={{ border: '2px solid var(--border)', borderRadius: 3, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          {!facets ? 'Counting puzzles…'
            : matches === 0 ? 'No puzzles match'
            : `${rounds}-round session`}
        </div>
        {facets && matches > 0 && (
          <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--text-muted)' }}>
            {matches > MAX_SESSION_ROUNDS
              ? `${matches} puzzles match, so you'll get ${MAX_SESSION_ROUNDS} of them picked at random.`
              : `${matches === 1 ? 'One puzzle matches' : `${matches} puzzles match`}, so you'll play ${matches === 1 ? 'it' : 'all of them'}.`}
          </div>
        )}
        <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--text-muted)' }}>Your guess list: {guessScope}.</div>
      </section>

      <motion.button
        type="button"
        {...pressable}
        whileHover={matches ? pressable.whileHover : undefined}
        animate={{ opacity: !facets || matches === 0 || starting ? 0.35 : 1 }}
        onClick={onStart}
        disabled={!facets || matches === 0 || starting}
        style={{ minHeight: 50, borderRadius: 3, border: 'none', cursor: 'pointer', background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}
      >{starting ? 'Starting…' : 'Start session'}</motion.button>
    </div>
  );
}
