'use client';
import { LOCALES, setLocale } from '@/i18n/core';
import { useLocale, useT } from '@/i18n/react';

/** ID / EN toggle. The choice is remembered on this device. */
export default function LanguageSwitch() {
  const locale = useLocale();
  const t = useT();
  return (
    <div className="language-switch" role="group" aria-label={t('language.label')}>
      {LOCALES.map((value) => (
        <button
          key={value}
          lang={value}
          aria-pressed={locale === value}
          className={locale === value ? 'active' : ''}
          title={value === 'id' ? 'Bahasa Indonesia' : 'English'}
          onClick={() => setLocale(value)}
        >
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
