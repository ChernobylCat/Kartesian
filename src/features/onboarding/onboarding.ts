/**
 * Which onboarding tour a visitor still needs. A first visit gets the full tour; a
 * visitor who finished or skipped an older tour gets the shorter "what's new" tour.
 * Raise ONBOARDING_VERSION (and update the what's-new steps) when a release adds
 * features worth pointing out to returning users.
 */
export const ONBOARDING_VERSION = 2;
/** localStorage key holding the last onboarding version the visitor finished or skipped. */
export const ONBOARDING_KEY = 'kartesian_onboarding_version';
/**
 * Written by the first editor tour. Still read, never removed, so a visitor of the old
 * tour gets the what's-new tour and a rollback to an older build does not repeat it.
 */
export const LEGACY_ONBOARDING_KEY = 'kartesian_onboarding_complete_v1';

export type TourKind = 'full' | 'whatsNew';

type Read = (key: string) => string | null;

/** The last onboarding version the visitor has seen, or 0 on a first visit. */
export function seenOnboardingVersion(read: Read): number {
  const stored = Number(read(ONBOARDING_KEY));
  if (Number.isInteger(stored) && stored > 0) return stored;
  return read(LEGACY_ONBOARDING_KEY) === 'true' ? 1 : 0;
}

/** The tour to start automatically, or null when the visitor is up to date. */
export function pendingTour(read: Read): TourKind | null {
  const seen = seenOnboardingVersion(read);
  if (seen >= ONBOARDING_VERSION) return null;
  return seen === 0 ? 'full' : 'whatsNew';
}

/** Reads the pending tour from localStorage; no tour when storage is unavailable. */
export function readPendingTour(): TourKind | null {
  try {
    return pendingTour((key) => localStorage.getItem(key));
  } catch {
    return null;
  }
}

/** Records that the visitor has seen the current onboarding. */
export function markOnboardingSeen() {
  try {
    localStorage.setItem(ONBOARDING_KEY, String(ONBOARDING_VERSION));
  } catch {
    /* Storage may be unavailable; the tour then shows again next time. */
  }
}

/**
 * True while a tour is on screen. Editor shortcuts stand down meanwhile: the arrow keys
 * belong to the tour, and nothing behind its overlay should change.
 */
export const isTourActive = () =>
  typeof document !== 'undefined' && document.body.classList.contains('driver-active');
