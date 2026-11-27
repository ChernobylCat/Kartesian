'use client';
import Link from 'next/link';
import { useT } from '@/i18n/react';

export default function NotFound() {
  const t = useT();
  return (
    <main className="loading-screen">
      <h1>{t('notFound.title')}</h1>
      <Link href="/">{t('notFound.home')}</Link>
    </main>
  );
}
