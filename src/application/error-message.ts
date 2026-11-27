import { t } from '@/i18n/core';
/** User-facing text for a caught value; avoids the "Error: …" prefix of `String(error)`. */
export function errorMessage(error: unknown, fallback = t('error.generic')) {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'string' && error) return error;
  return fallback;
}
