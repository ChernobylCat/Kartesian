import { describe, expect, it } from 'vitest';
import {
  LEGACY_ONBOARDING_KEY,
  ONBOARDING_KEY,
  ONBOARDING_VERSION,
  pendingTour,
  seenOnboardingVersion,
} from '@/features/onboarding/onboarding';
import { TOURS, TOUR_TARGETS, tourHtml } from '@/features/onboarding/steps';
import { id } from '@/i18n/messages/id';
import { en } from '@/i18n/messages/en';
import { translate } from '@/i18n/core';
// The Playwright helper that lets tests and scripts start without a tour.
import { ONBOARDING_SEEN } from '../support/onboarding.cjs';

const storage = (values: Record<string, string>) => (key: string) => values[key] ?? null;

describe('onboarding version', () => {
  it('starts the full tour on a first visit', () => {
    expect(seenOnboardingVersion(storage({}))).toBe(0);
    expect(pendingTour(storage({}))).toBe('full');
  });

  it("shows what's new to visitors of the first tour", () => {
    expect(seenOnboardingVersion(storage({ [LEGACY_ONBOARDING_KEY]: 'true' }))).toBe(1);
    expect(pendingTour(storage({ [LEGACY_ONBOARDING_KEY]: 'true' }))).toBe('whatsNew');
    expect(pendingTour(storage({ [ONBOARDING_KEY]: '1' }))).toBe('whatsNew');
  });

  it('shows nothing once the current version, or a newer one, has been seen', () => {
    expect(pendingTour(storage({ [ONBOARDING_KEY]: String(ONBOARDING_VERSION) }))).toBeNull();
    // A rollback to this build after a newer one does not repeat a tour.
    expect(pendingTour(storage({ [ONBOARDING_KEY]: String(ONBOARDING_VERSION + 1) }))).toBeNull();
  });

  it('ignores a malformed stored version', () => {
    expect(pendingTour(storage({ [ONBOARDING_KEY]: 'abc' }))).toBe('full');
    expect(pendingTour(storage({ [ONBOARDING_KEY]: '-3', [LEGACY_ONBOARDING_KEY]: 'true' }))).toBe(
      'whatsNew',
    );
  });

  it('matches the helper that tests and capture scripts use to skip the tour', () => {
    expect(ONBOARDING_SEEN).toEqual({ key: ONBOARDING_KEY, value: String(ONBOARDING_VERSION) });
  });
});

describe('tour steps', () => {
  it.each(Object.entries(TOURS))('%s opens centred and then points at the editor', (_, steps) => {
    expect(steps.length).toBeGreaterThan(2);
    expect(steps.length).toBeLessThanOrEqual(7);
    expect(steps[0]!.target).toBeUndefined();
    for (const step of steps.slice(1)) expect(Object.keys(TOUR_TARGETS)).toContain(step.target);
  });

  it('has text for every step in both languages', () => {
    for (const steps of Object.values(TOURS))
      for (const { title, body } of steps)
        for (const key of [title, body]) {
          expect(id[key].trim()).not.toBe('');
          expect(en[key].trim()).not.toBe('');
        }
  });

  it('keeps the progress text in the format driver.js fills in', () => {
    const params = { current: '{{current}}', total: '{{total}}' };
    expect(translate('id', 'tour.progress', params)).toBe('{{current}} dari {{total}}');
    expect(translate('en', 'tour.progress', params)).toBe('{{current}} of {{total}}');
  });
});

describe('tourHtml', () => {
  it('escapes markup and sets placeholders as code', () => {
    expect(tourHtml('<b>"A" & \'B\'</b>')).toBe(
      '&#60;b&#62;&#34;A&#34; &#38; &#39;B&#39;&#60;/b&#62;',
    );
    expect(tourHtml('Isi {{nama}} dan {{nominal|rupiah}}.')).toBe(
      'Isi <code>{{nama}}</code> dan <code>{{nominal|rupiah}}</code>.',
    );
  });
});
