'use client';

import dynamic from 'next/dynamic';

const DSAdle = dynamic(() => import('@/components/DSAdle'), { ssr: false });

export default function Home() {
  return <DSAdle />;
}
