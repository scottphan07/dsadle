'use client';

import { useEffect, useState } from 'react';

/**
 * Route-level error boundary.
 *
 * Without this, an uncaught render error shows Next.js's stock "Application
 * error: a client-side exception has occurred" — no context, and no way out
 * when the cause is a value sitting in localStorage, because every reload
 * re-reads it and crashes again. The reset button covers a transient fault;
 * the clear button covers a poisoned save.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    // Shows up in the browser console and in Vercel's client-error reporting.
    console.error('DSAdle crashed:', error);
  }, [error]);

  function clearSavedData() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('dsadle-'))
        .forEach((k) => localStorage.removeItem(k));
      setCleared(true);
    } catch {
      // Storage is blocked entirely, so there is nothing to clear.
      setCleared(true);
    }
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 'clamp(16px, 5vw, 32px)',
        textAlign: 'center',
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 'clamp(20px, 5vw, 26px)', fontWeight: 700 }}>
        Something went wrong
      </h1>

      <p style={{ margin: 0, maxWidth: 420, lineHeight: 1.6, color: 'var(--text-muted)' }}>
        {cleared
          ? 'Saved games cleared. Reload to start fresh.'
          : 'DSAdle hit an unexpected error. Trying again usually fixes it. If the page keeps crashing, clearing your saved games will reset it.'}
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={reset}
          style={{
            padding: '10px 18px',
            fontSize: 15,
            fontWeight: 600,
            fontFamily: 'inherit',
            color: 'var(--btn-fg)',
            background: 'var(--btn-bg)',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>

        {!cleared && (
          <button
            onClick={clearSavedData}
            style={{
              padding: '10px 18px',
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'inherit',
              color: 'var(--text)',
              background: 'var(--surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Clear saved games
          </button>
        )}
      </div>

      {error.digest && (
        <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>ref: {error.digest}</code>
      )}
    </main>
  );
}
