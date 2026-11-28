/**
 * Marks the current onboarding as seen, so a test or a screenshot run starts without
 * a tour. Mirrors ONBOARDING_KEY and ONBOARDING_VERSION in
 * src/features/onboarding/onboarding.ts; tests/unit/onboarding.test.ts fails if they drift.
 */
const ONBOARDING_SEEN = Object.freeze({ key: 'kartesian_onboarding_version', value: '2' });

/** Registers an init script on a Playwright page or browser context. */
function skipOnboarding(target) {
  return target.addInitScript(({ key, value }) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Storage can be unavailable; the page then simply shows the tour. */
    }
  }, ONBOARDING_SEEN);
}

module.exports = { ONBOARDING_SEEN, skipOnboarding };
