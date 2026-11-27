'use client';
import { useEffect } from 'react';
import type { Locale } from '@/i18n/core';

/** The shared root layout is static and says "id"; correct it on the English page. */
export default function HtmlLang({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
