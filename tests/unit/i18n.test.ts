import { afterEach, describe, expect, it } from 'vitest';
import { id } from '@/i18n/messages/id';
import { en } from '@/i18n/messages/en';
import { formatFixed, getLocale, setLocale, t, translate } from '@/i18n/core';
import { decodeLegacy } from '@/domain/document/model';
import { execute } from '@/domain/document/commands';
import { paperLabel, presetPaper } from '@/domain/document/paper';
import { LANDING } from '@/features/landing/content';

/** Message parameters; `{{key}}` is literal example text for merge templates, not a parameter. */
const placeholders = (text: string) =>
  [...text.replace(/\{\{[^{}]*\}\}/g, '').matchAll(/\{(\w+)[^}]*\}/g)]
    .map((match) => match[1])
    .sort();

afterEach(() => setLocale('id'));

describe('dictionaries', () => {
  it('translate every key into English with the same parameters', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(id).sort());
    for (const key of Object.keys(id) as (keyof typeof id)[]) {
      expect(en[key].trim(), key).not.toBe('');
      expect([...new Set(placeholders(en[key]))], key).toEqual([...new Set(placeholders(id[key]))]);
    }
  });

  it('give the landing page the same structure in both languages', () => {
    const shape = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(shape)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, shape(entry)]))
          : typeof value;
    expect(shape(LANDING.en)).toEqual(shape(LANDING.id));
  });
});

describe('translate', () => {
  it('fills parameters, formats numbers, and picks English plurals', () => {
    expect(translate('id', 'count.elements', { count: 1 })).toBe('1 elemen');
    expect(translate('en', 'count.elements', { count: 1 })).toBe('1 element');
    expect(translate('en', 'count.elements', { count: 5000 })).toBe('5,000 elements');
    expect(translate('id', 'count.elements', { count: 5000 })).toBe('5.000 elemen');
    expect(formatFixed(20, 1, 'id')).toBe('20,0');
    expect(formatFixed(20, 1, 'en')).toBe('20.0');
  });

  it('defaults to Indonesian and switches globally', () => {
    expect(getLocale()).toBe('id');
    expect(t('save.saved')).toBe('Tersimpan di perangkat');
    setLocale('en');
    expect(t('save.saved')).toBe('Saved on this device');
  });
});

describe('domain messages follow the active language', () => {
  it('words errors, defaults and paper names in English', () => {
    setLocale('en');
    const { document, assets } = decodeLegacy([
      { pages: [{ page_number: 1, items: [{ text: 'A', x: 10, y: 310 }] }] },
    ]);
    expect(document.documents[0]!.title).toBe('Document 1');
    expect(() =>
      execute(document, { type: 'setPaper', paper: presetPaper('a4', false) }, assets),
    ).toThrow('1 element would fall outside the 210 × 297 mm paper. Move or shrink it first.');
    expect(paperLabel({ width: 215.9, height: 279.4 })).toBe('Letter · 215.9 × 279.4 mm');
    expect(paperLabel(presetPaper('a4', true))).toBe('A4 landscape · 297 × 210 mm');
    expect(() =>
      decodeLegacy([
        { title: 'X', pages: [{ page_number: 1, items: [{ text: 'A', x: 999, y: 1 }] }] },
      ]),
    ).toThrow('The X position is outside the paper.');
  });
});
