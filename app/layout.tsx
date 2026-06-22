import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DSAdle',
  description: 'Guess the data structure or algorithm. A new clue unlocks with every guess.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
