import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  DEFAULT_LOCALE,
  getLocale,
  subscribe,
  translate,
  type Locale,
  type Translate,
} from './core';

/** Active locale; re-renders on change. The server snapshot keeps hydration stable. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE);
}
/** Translator bound to the rendered locale. */
export function useT(): Translate {
  const locale = useLocale();
  return useCallback((key, params) => translate(locale, key, params), [locale]);
}

/** Keeps `<html lang>` in step with the active locale (the static HTML says "id"). */
export function useDocumentLanguage() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
}
