'use client';

import { useState, useEffect, KeyboardEvent, CSSProperties } from 'react';
import { ENTRIES, CODE, TOPS, TIME, SPACE, Entry } from '@/lib/gameData';

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// ─── localStorage helpers ──────────────────────────────────────────────────

function todayIndex() {
  return Math.floor(Date.now() / 86400000);
}

function keyFor(offset: number): string {
  return 'dsadle-' + (todayIndex() + offset);
}

function readGuesses(key: string): Entry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return (JSON.parse(raw) as string[])
      .map((name) => ENTRIES.find((e) => e.name === name))
      .filter((e): e is Entry => e !== undefined);
  } catch {
    return [];
  }
}

function saveGuesses(gs: Entry[], offset: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(keyFor(offset), JSON.stringify(gs.map((g) => g.name)));
  } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────

export default function DSAdle() {
  const [guesses, setGuesses] = useState<Entry[]>([]);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalExpanded, setModalExpanded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [sideOpen, setSideOpen] = useState(false);
  const [sideView, setSideView] = useState<'main' | 'archive'>('main');
  const [mounted, setMounted] = useState(false);

  // Load saved guesses on mount
  useEffect(() => {
    setMounted(true);
    setGuesses(readGuesses(keyFor(0)));
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const dayIdx = todayIndex() + offset;
  const n = ENTRIES.length;
  const answer = ENTRIES[((dayIdx % n) + n) % n];
  const won = guesses.some((g) => g.name === answer.name);
  const isOver = guesses.length >= 5 || won;
  const wrong = guesses.filter((g) => g.name !== answer.name);
  const revealed = isOver ? 5 : Math.min(5, 1 + wrong.length);
  const attemptsLeft = Math.max(0, 5 - guesses.length);
  const dateLabel = new Date(dayIdx * 86400000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const codeSnippet = CODE[answer.name] ?? '# implementation coming soon';

  // ── Clues ─────────────────────────────────────────────────────────────────

  const clues = [
    { value: answer.cat === 0 ? 'Data Structure' : 'Algorithm', isCode: false },
    { value: answer.use, isCode: false },
    { value: (TOPS[answer.name] ?? 'Running time') + ': ' + (answer.t === 0 ? 'O(1)' : TIME[answer.t]), isCode: false },
    { value: 'Uses ' + SPACE[answer.s] + ' space', isCode: false },
    { value: '', isCode: true },
  ].map((c, i) => ({
    ...c,
    lidOpacity: i < revealed ? 0 : 1,
    lidPointerEvents: (i < revealed ? 'none' : 'auto') as CSSProperties['pointerEvents'],
  }));

  // ── Suggestions ───────────────────────────────────────────────────────────

  function getSuggestions(): Entry[] {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) return [];
    const used = new Set(guesses.map((g) => g.name));
    return ENTRIES.filter(
      (e) => !used.has(e.name) && e.name.toLowerCase().includes(trimmed)
    ).slice(0, 6);
  }

  const suggList = getSuggestions();
  const hiClamped = Math.min(hi, Math.max(0, suggList.length - 1));
  const suggestions = suggList.map((e, i) => ({
    name: e.name,
    bg: i === hiClamped ? '#eaeaea' : '#ffffff',
  }));

  // ── Actions ───────────────────────────────────────────────────────────────

  function submit(name: string) {
    if (isOver) return;
    const entry = ENTRIES.find((e) => e.name === name);
    if (!entry || guesses.some((g) => g.name === name)) return;
    const next = [...guesses, entry];
    setGuesses(next);
    saveGuesses(next, offset);
  }

  function submitGuess() {
    const trimmed = q.trim();
    if (!trimmed) return;
    const used = new Set(guesses.map((g) => g.name));
    const target =
      ENTRIES.find((e) => e.name.toLowerCase() === trimmed.toLowerCase() && !used.has(e.name)) ??
      ENTRIES.find((e) => !used.has(e.name) && e.name.toLowerCase().includes(trimmed.toLowerCase()));
    if (!target) return;
    submit(target.name);
    setQ('');
    setDropdownOpen(false);
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
        submit(list[hiClamped].name);
        setQ('');
        setDropdownOpen(false);
        setHi(0);
      } else {
        submitGuess();
      }
    }
  }

  function navigate(delta: number) {
    const next = Math.min(0, offset + delta);
    setOffset(next);
    setGuesses(readGuesses(keyFor(next)));
    setQ('');
    setDropdownOpen(false);
  }

  function navigateTo(target: number) {
    const next = Math.min(0, target);
    setOffset(next);
    setGuesses(readGuesses(keyFor(next)));
    setQ('');
    setDropdownOpen(false);
  }

  function goHome() {
    navigateTo(0);
    setSideOpen(false);
  }

  function closeModal() {
    setModalOpen(false);
    setModalExpanded(false);
  }

  // ── Archive days ──────────────────────────────────────────────────────────

  const archiveDays = mounted
    ? Array.from({ length: 30 }, (_, i) => {
        const dayOff = -(i + 1);
        const dayIdx2 = todayIndex() + dayOff;
        const eLen = ENTRIES.length;
        const dayEntry = ENTRIES[((dayIdx2 % eLen) + eLen) % eLen];
        const label = new Date(dayIdx2 * 86400000).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        });
        const saved = readGuesses(keyFor(dayOff));
        const solved = saved.some((g) => g.name === dayEntry.name);
        const attempted = saved.length > 0;
        return {
          label,
          dot: solved ? '✓' : attempted ? '✗' : '',
          dotColor: solved ? '#538d4e' : '#c14b3e',
          onClick: () => { navigateTo(dayOff); setSideOpen(false); },
        };
      })
    : [];

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
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', fontFamily: FONT, color: '#1a1a1b' }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: '1px solid #d3d6da' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px' }}>
          <span
            onClick={() => { setSideOpen(true); setSideView('main'); }}
            style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#787c7e', fontSize: 21, cursor: 'pointer', lineHeight: '1' }}
          >☰</span>
          <div
            onClick={goHome}
            style={{ fontSize: 30, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: '#1a1a1b', cursor: 'pointer' }}
          >DSAdle</div>
          <span style={{ width: 26, height: 26 }} />
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '18px 16px 56px', boxSizing: 'border-box' }}>

        {/* Nav row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#787c7e', marginBottom: 8 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#787c7e', fontSize: 12, fontWeight: 600, padding: 4 }}>‹ Prev</button>
          <div style={{ fontWeight: 600 }}>{dateLabel} · {attemptsLeft} guesses left</div>
          <button onClick={() => navigate(1)} disabled={offset >= 0} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#787c7e', fontSize: 12, fontWeight: 600, padding: 4 }}>Next ›</button>
        </div>

        {/* Subtitle */}
        <div style={{ textAlign: 'center', fontSize: 13, color: '#787c7e', marginBottom: 18, lineHeight: 1.4 }}>
          Guess the data structure or algorithm.<br />A new clue unlocks with every guess.
        </div>

        {/* Clue cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {clues.map((c, i) => (
            <div key={i} style={{ flex: 1, position: 'relative' }}>
              <div style={{ position: 'relative', minHeight: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '10px 16px', background: '#fff', border: '2px solid #878a8c', color: '#1a1a1b', fontWeight: 700, fontSize: 15, borderRadius: 2, lineHeight: 1.3 }}>
                {!c.isCode && <span>{c.value}</span>}
                {c.isCode && (
                  <div onClick={() => setModalOpen(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', cursor: 'pointer' }}>
                    <span>View implementation</span>
                    <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: '#787c7e' }}>⟨ ⟩</span>
                  </div>
                )}
              </div>
              {/* Lid overlay — hides clue until revealed */}
              <div style={{ position: 'absolute', inset: 0, border: '2px solid #d3d6da', background: '#fafafa', borderRadius: 2, opacity: c.lidOpacity, pointerEvents: c.lidPointerEvents }} />
            </div>
          ))}
        </div>

        {/* Wrong guesses */}
        {wrong.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#787c7e', marginBottom: 8 }}>Wrong guesses</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {wrong.map((g) => (
                <span key={g.name} style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#c14b3e', borderRadius: 2, padding: '7px 12px' }}>
                  ✕ {g.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Game over */}
        {isOver && (
          <div style={{ textAlign: 'center', padding: '20px 16px', border: '2px solid #d3d6da', borderRadius: 3, marginBottom: 18 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1b' }}>{answer.name}</div>
            <div style={{ fontSize: 13, color: '#444', marginTop: 8, lineHeight: 1.5 }}>{answer.desc}</div>
            <button
              onClick={() => setModalOpen(true)}
              style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: '#fff', background: '#1a1a1b', border: 'none', borderRadius: 3, padding: '10px 18px', cursor: 'pointer' }}
            >⟨ ⟩ View implementation</button>
          </div>
        )}

        {/* Guess input */}
        {!isOver && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setDropdownOpen(true); setHi(0); }}
                onKeyDown={onKeyDown}
                placeholder="Type a structure or algorithm"
                style={{ width: '100%', padding: '13px 14px', border: '2px solid #878a8c', borderRadius: 3, fontSize: 14, outline: 'none', fontFamily: FONT }}
              />
              {dropdownOpen && suggestions.length > 0 && (
                <div style={{ position: 'absolute', bottom: 'calc(100% + 5px)', left: 0, right: 0, background: '#fff', border: '1px solid #878a8c', borderRadius: 3, boxShadow: '0 -8px 22px rgba(0,0,0,.16)', zIndex: 5, overflow: 'hidden' }}>
                  {suggestions.map((s) => (
                    <div
                      key={s.name}
                      onClick={() => fill(s.name)}
                      className="dsadle-hover-bg"
                      style={{ padding: '12px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', borderTop: '1px solid #eee', background: s.bg }}
                    >{s.name}</div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={submitGuess}
              style={{ flexShrink: 0, padding: '0 22px', background: '#1a1a1b', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', cursor: 'pointer' }}
            >Guess</button>
          </div>
        )}
      </div>

      {/* ── Code modal ── */}
      {modalOpen && (
        <div
          onClick={closeModal}
          style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,24,.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={modalBoxStyle}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '13px 18px', background: '#2a2a30', borderBottom: '1px solid #3a3a42', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span onClick={closeModal} className="dsadle-hover-red" style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f56', display: 'inline-block', cursor: 'pointer' }} title="Close" />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }} />
                <span onClick={() => setModalExpanded((v) => !v)} className="dsadle-hover-green" style={{ width: 11, height: 11, borderRadius: '50%', background: '#27c93f', display: 'inline-block', cursor: 'pointer' }} title="Expand / shrink" />
                <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: '#b8b8c0', marginLeft: 8 }}>example_implementation.py</span>
              </div>
            </div>
            <pre style={{ margin: 0, padding: 22, overflow: 'auto', fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 12.5, lineHeight: 1.65, color: '#e6e6ea', whiteSpace: 'pre' }}>{codeSnippet}</pre>
          </div>
        </div>
      )}

      {/* ── Sidebar ── */}
      {sideOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40 }}>
          <div onClick={() => setSideOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} />
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 280, background: '#fff', boxShadow: '4px 0 24px rgba(0,0,0,.14)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Sidebar header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #d3d6da', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#1a1a1b' }}>DSAdle</div>
              <button onClick={() => setSideOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#787c7e', padding: 0, lineHeight: '1' }}>×</button>
            </div>

            {/* Main nav */}
            {sideView === 'main' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div onClick={goHome} className="dsadle-hover-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 15, fontWeight: 600, color: '#1a1a1b' }}>
                  <span>Today&apos;s Puzzle</span>
                  <span style={{ color: '#787c7e' }}>›</span>
                </div>
                <div onClick={() => setSideView('archive')} className="dsadle-hover-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 15, fontWeight: 600, color: '#1a1a1b' }}>
                  <span>Archive</span>
                  <span style={{ color: '#787c7e' }}>›</span>
                </div>
              </div>
            )}

            {/* Archive */}
            {sideView === 'archive' && (
              <>
                <div onClick={() => setSideView('main')} className="dsadle-hover-bg" style={{ flexShrink: 0, padding: '12px 20px', borderBottom: '1px solid #d3d6da', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <span style={{ color: '#787c7e' }}>‹</span>
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#787c7e' }}>Archive</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {archiveDays.map((day, i) => (
                    <div key={i} onClick={day.onClick} className="dsadle-hover-bg" style={{ padding: '13px 20px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1b' }}>{day.label}</div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: day.dotColor }}>{day.dot}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
