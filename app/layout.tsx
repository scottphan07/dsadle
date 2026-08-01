import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DSAdle',
  description: 'Guess the data structure or algorithm. A new clue unlocks with every guess.',
};

// Runs before first paint, so the page never flashes the wrong theme. A stored
// choice always wins; the OS preference is only the fallback for a first visit.
// Must be a raw <script> — every next/script strategy runs after hydration.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('dsadle-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
