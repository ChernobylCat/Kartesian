'use client';
import { useT } from '@/i18n/react';
export default function EditorError({ reset }: { error: Error; reset: () => void }) {
  const t = useT();
  return (
    <main className="loading-screen">
      <h1>{t('appError.title')}</h1>
      <p>{t('appError.body')}</p>
      <button onClick={reset}>{t('action.retry')}</button>
    </main>
  );
}
