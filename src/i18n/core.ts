import { id } from './messages/id';
import { en } from './messages/en';

export const LOCALES = ['id', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export type MessageKey = keyof typeof id;
export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

/** Indonesian is the default so existing users see no change until they switch. */
export const DEFAULT_LOCALE: Locale = 'id';
export const LOCALE_STORAGE_KEY = 'kartesian_locale';
const dictionaries: Record<Locale, Record<MessageKey, string>> = { id, en };
const numberLocales: Record<Locale, string> = { id: 'id-ID', en: 'en-US' };

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/** `?lang=` (from the landing page) wins over the saved choice. */
function readInitialLocale(): Locale {
  try {
    const param = new URLSearchParams(location.search).get('lang');
    if (isLocale(param)) {
      localStorage.setItem(LOCALE_STORAGE_KEY, param);
      return param;
    }
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* Storage can be unavailable (private mode); fall back to the default. */
  }
  return DEFAULT_LOCALE;
}

let current: Locale = typeof window === 'undefined' ? DEFAULT_LOCALE : readInitialLocale();
const listeners = new Set<() => void>();

export const getLocale = () => current;
export function setLocale(locale: Locale) {
  if (locale === current) return;
  current = locale;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* The choice then lasts for this page only. */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  listeners.forEach((listener) => listener());
}
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatNumber(value: number, locale: Locale = current, digits = 1) {
  return value.toLocaleString(numberLocales[locale], { maximumFractionDigits: digits });
}

/**
 * Fills `{name}` with a parameter (numbers are formatted for the locale) and
 * `{count|one|other}` with the singular or plural word for `count`.
 */
export function translate(locale: Locale, key: MessageKey, params: Params = {}) {
  const template = dictionaries[locale][key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
  return template.replace(
    /\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g,
    (match, name: string, one, other) => {
      const value = params[name];
      if (value === undefined) return match;
      if (one !== undefined) return value === 1 ? one : other;
      return typeof value === 'number' ? formatNumber(value, locale, 2) : value;
    },
  );
}

/** Translates with the active locale. For code outside React (errors, defaults). */
export const t: Translate = (key, params) => translate(current, key, params);

/** Fixed decimals for measurements, e.g. "20,0" (id) or "20.0" (en). */
export function formatFixed(value: number, digits = 1, locale: Locale = current) {
  return value.toLocaleString(numberLocales[locale], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Date and time for lists such as saved workspaces, e.g. "23 Nov 2026 14.05". */
export function formatDateTime(timestamp: number, locale: Locale = current) {
  return new Date(timestamp).toLocaleString(numberLocales[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
