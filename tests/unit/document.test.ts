import { describe, it, expect } from 'vitest';
import { DEFAULT_PAPER as F4 } from '@/domain/document/paper';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { decodeLegacy, encodeLegacy, locate, defaultSettings } from '@/domain/document/model';
import { parseLegacy } from '@/domain/document/schema';
import { execute, moveSelection } from '@/domain/document/commands';
import { position, resize, snap } from '@/domain/document/geometry';
import { createEditorStore } from '@/features/editor/store/editor-store';
import { emptyPdf } from '@/application/ports';
import { attachAutosave } from '@/application/editor-session';
import { outputPages, standaloneHtml } from '@/infrastructure/export/html';
import { readLegacySettings, writeLegacySettings } from '@/infrastructure/serialization/settings';
import {
  backupWorkspace,
  restoreWorkspace,
  repairWorkspace,
  resetWorkspace,
} from '@/infrastructure/storage/workspace';
import { performance } from 'node:perf_hooks';

const fixture = JSON.parse(readFileSync('tests/fixtures/valid-text.json', 'utf8')) as unknown;
const setup = () => decodeLegacy(fixture);
const workspace = () => ({
  schemaVersion: 2 as const,
  ...setup(),
  settings: { ...defaultSettings },
  pdf: emptyPdf(),
  revision: 0,
});
describe('document codecs and invariants', () => {
  it('round trips existing text/image fixtures and retains unknown metadata', () => {
    for (const name of ['valid-text', 'valid-image']) {
      const raw = JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8'));
      const result = decodeLegacy(raw);
      expect(encodeLegacy(result.document, result.assets)).toEqual(parseLegacy(raw));
    }
    const raw = parseLegacy(fixture);
    raw[0]!.custom = { note: 'retained' };
    raw[0]!.pages[0]!.items[0]!.custom = 'kept';
    const decoded = decodeLegacy(raw);
    expect(encodeLegacy(decoded.document, decoded.assets)).toEqual(raw);
  });
  it('rejects unsafe sources, bad geometry and aggregate limits', () => {
    expect(() =>
      parseLegacy(readFileSync('tests/fixtures/invalid-out-of-bounds.json', 'utf8')),
    ).toThrow();
    const raw = parseLegacy(fixture);
    raw[0]!.pages[0]!.items[0]!.type = 'image';
    raw[0]!.pages[0]!.items[0]!.text = 'javascript:alert(1)';
    expect(() => decodeLegacy(raw)).toThrow();
    expect(() =>
      decodeLegacy(Array.from({ length: 101 }, () => parseLegacy(fixture)[0])),
    ).toThrow();
  });
  it('preserves unambiguous IDs and clears ambiguous identity', () => {
    const a = setup();
    const b = decodeLegacy(fixture, a.document, a.assets);
    expect(b.document.documents[0]!.pages[0]!.items[0]!.id).toBe(
      a.document.documents[0]!.pages[0]!.items[0]!.id,
    );
    const raw = parseLegacy(fixture);
    raw[0]!.pages[0]!.items.push({ ...raw[0]!.pages[0]!.items[0]! });
    const c = decodeLegacy(raw, a.document, a.assets);
    expect(c.document.documents[0]!.pages[0]!.items[0]!.id).not.toBe(
      a.document.documents[0]!.pages[0]!.items[0]!.id,
    );
  });
  it('uses separate assets instead of data URLs in history documents', () => {
    const a = decodeLegacy(JSON.parse(readFileSync('tests/fixtures/valid-image.json', 'utf8')));
    expect(a.document.documents[0]!.pages[0]!.items[0]!.text).toBe('');
    expect(Object.keys(a.assets)).toHaveLength(1);
  });
  it('validates numeric strings, optional defaults, and bounds according to schema', () => {
    const accepted = (fn: () => unknown) => {
      try {
        fn();
        return true;
      } catch {
        return false;
      }
    };
    const cases: [Record<string, unknown>, boolean][] = [
      [{ x: ' 20 ' }, true],
      [{ x: '2e1' }, true],
      [{ x: null }, false],
      [{ x: 210 }, true],
      [{ x: 211 }, false],
      [{ font_size: 3 }, false],
      [{ font_size: 72 }, true],
      [{ font_size: 73 }, false],
      [{ width: 0 }, false],
      [{ width: 190 }, true],
      [{ width: 191 }, false],
      [{ rotation: -360 }, true],
      [{ rotation: 361 }, false],
      [{ z_index: '2' }, false],
      [{ locked: 'false' }, false],
      [{ color: '#abcdef' }, true],
      [{ color: 'red' }, false],
    ];
    for (const [patch, expected] of cases) {
      const data = JSON.parse(JSON.stringify(fixture));
      Object.assign(data[0].pages[0].items[0], patch);
      expect(
        accepted(() => parseLegacy(data)),
        JSON.stringify(patch),
      ).toBe(expected);
    }
  });
  it('preserves reserved-looking legacy metadata through import and export', () => {
    const raw = JSON.parse(JSON.stringify(fixture));
    Object.assign(raw[0].pages[0].items[0], {
      id: 'user-id',
      assetId: 'custom',
      legacyIdentity: { custom: true },
    });
    const decoded = decodeLegacy(raw);
    expect(encodeLegacy(decoded.document, decoded.assets)).toEqual(raw);
  });
});
describe('D2 scale benchmark', () => {
  it('commits at 5,000 items without copying image payloads into history', () => {
    const data = Array.from({ length: 5 }, (_, di) => ({
      title: `Dokumen ${di + 1}`,
      pages: Array.from({ length: 10 }, (_, pi) => ({
        page_number: pi + 1,
        items: Array.from({ length: 100 }, (_, ii) => ({
          text: `Teks ${ii}`,
          x: 10 + (ii % 10) * 15,
          y: 15 + Math.floor(ii / 10) * 15,
          font_size: 8,
        })),
      })),
    }));
    const decoded = decodeLegacy(data);
    const store = createEditorStore({ ...workspace(), ...decoded });
    const id = store.getState().workspace.document.documents[0]!.pages[0]!.items[0]!.id;
    const times = [];
    for (let index = 0; index < 6; index++) {
      const start = performance.now();
      store.getState().command({ type: 'patch', ids: [id], patch: { x: 10 + index } });
      times.push(performance.now() - start);
    }
    const measured = times.slice(1).sort((a, b) => a - b);
    const result = { samples: measured, p95: measured.at(-1), items: 5000 };
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/next-benchmark.json', JSON.stringify(result, null, 2));
    expect(store.getState().undoStack).toHaveLength(6);
    expect(
      encodeLegacy(store.getState().workspace.document, store.getState().workspace.assets),
    ).toHaveLength(5);
  });
});
describe('commands and geometry', () => {
  it('preserves structural sharing and creates unique duplicate IDs', () => {
    const a = setup(),
      item = a.document.documents[0]!.pages[0]!.items[0]!;
    const b = execute(a.document, { type: 'duplicate', ids: [item.id] }, a.assets);
    expect(b.documents[0]!.pages[0]!.items).toHaveLength(2);
    expect(b.documents[0]!.pages[0]!.items[0]).toBe(item);
    expect(b.documents[0]!.pages[0]!.items[1]!.id).not.toBe(item.id);
    expect(item.x).toBe(20);
  });
  it('blocks moving locked elements but allows unlocking', () => {
    const a = setup(),
      id = a.document.documents[0]!.pages[0]!.items[0]!.id;
    let document = execute(
      a.document,
      { type: 'patch', ids: [id], patch: { locked: true } },
      a.assets,
    );
    document = execute(document, moveSelection(document, [id], 10, 10), a.assets);
    expect(locate(document, id)!.item.x).toBe(20);
    document = execute(document, { type: 'patch', ids: [id], patch: { locked: false } }, a.assets);
    expect(locate(document, id)!.item.locked).toBe(false);
  });
  it('materializes PDF-only pages before adding an item', () => {
    const a = setup();
    const b = execute(
      a.document,
      {
        type: 'add',
        documentId: a.document.documents[0]!.id,
        pageId: 'virtual',
        pageNumber: 5,
        item: { text: 'Field', x: 10, y: 10 },
      },
      a.assets,
    );
    expect(b.documents[0]!.pages).toHaveLength(5);
    expect(b.documents[0]!.pages[4]!.items[0]!.text).toBe('Field');
  });
  it('converts scaled pointer coordinates and constrains resize', () => {
    expect(position(150, 200, { left: 100, top: 100, width: 420, height: 660 }, F4)).toEqual({
      x: 25,
      y: 50,
    });
    const item = { ...setup().document.documents[0]!.pages[0]!.items[0]!, width: 30, height: 10 };
    expect(resize(item, F4, 'se', 30, 10, true)).toMatchObject({ width: 60, height: 20 });
    expect(resize(item, F4, 'w', 10, 0, false, true)).toMatchObject({ x: 30, width: 10 });
    expect(resize(item, F4, 'se', 1000, 1000).width).toBe(190);
    expect(snap(item, F4, 0.4, 0, [{ ...item, id: 'other', x: 20.5 }]).guideX).toBeDefined();
  });
  it('keeps the opposite handle fixed while resizing a rotated item', () => {
    const item = {
      ...setup().document.documents[0]!.pages[0]!.items[0]!,
      width: 30,
      height: 10,
      rotation: 90,
    };
    expect(resize(item, F4, 'e', 0, 10)).toMatchObject({ x: 15, y: 35, width: 40, height: 10 });
    const centered = resize({ ...item, rotation: 30 }, F4, 'se', 10, 10, true, true);
    expect(Math.abs(centered.x + centered.width / 2 - (item.x + 15))).toBeLessThan(0.1);
    expect(Math.abs(centered.y + centered.height / 2 - (item.y + 5))).toBeLessThan(0.1);
    expect(Math.abs(centered.width / centered.height - 3)).toBeLessThan(0.03);
  });
});
describe('editor transactions and persistence scheduling', () => {
  it('keeps last valid model for invalid JSON, then undo/redo recovers atomically', () => {
    const state = createEditorStore(workspace());
    const original = state.getState().workspace.document;
    state.getState().editJson('{');
    expect(state.getState().error).toBeTruthy();
    expect(state.getState().workspace.document).toBe(original);
    state.getState().editJson(JSON.stringify(fixture));
    expect(state.getState().error).toBeNull();
    state.getState().command({
      type: 'duplicate',
      ids: [state.getState().workspace.document.documents[0]!.pages[0]!.items[0]!.id],
    });
    expect(state.getState().workspace.document.documents[0]!.pages[0]!.items).toHaveLength(2);
    state.getState().undo();
    expect(state.getState().workspace.document.documents[0]!.pages[0]!.items).toHaveLength(1);
    state.getState().redo();
    expect(state.getState().workspace.document.documents[0]!.pages[0]!.items).toHaveLength(2);
  });
  it('groups formatting and skips invalid-draft autosave', async () => {
    const store = createEditorStore(workspace());
    const saves: number[] = [];
    const session = attachAutosave(store, {
      load: async () => null,
      close() {},
      save: async (w) => {
        saves.push(w.revision);
      },
    });
    const id = store.getState().workspace.document.documents[0]!.pages[0]!.items[0]!.id;
    store.getState().command({ type: 'patch', ids: [id], patch: { color: '#123456' } }, 'color');
    store.getState().command({ type: 'patch', ids: [id], patch: { color: '#abcdef' } }, 'color');
    expect(store.getState().undoStack).toHaveLength(1);
    await session.flush();
    expect(saves).toEqual([2]);
    store.getState().editJson('{');
    await session.flush();
    expect(saves).toEqual([2]);
    session.destroy();
  });
  it('serializes saves and surfaces repository errors', async () => {
    const store = createEditorStore(workspace());
    const session = attachAutosave(store, {
      load: async () => null,
      close() {},
      save: async () => {
        throw new Error('quota');
      },
    });
    store.getState().settings({ offsetX: 1 });
    await expect(session.flush()).rejects.toThrow('quota');
    expect(store.getState().saveStatus).toBe('error');
    session.destroy();
  });
  it('retains the legacy settings contract', () => {
    const settings = { ...defaultSettings, offsetX: -2, overlayOpacity: 75 };
    expect(
      readLegacySettings(writeLegacySettings(JSON.stringify(fixture), settings)).settings,
    ).toEqual(settings);
    expect(() => readLegacySettings({ schemaVersion: 99 })).toThrow();
  });
});
describe('print and portable output', () => {
  it('backs up only live assets and validates a lossless restore', async () => {
    const image = JSON.parse(readFileSync('tests/fixtures/valid-image.json', 'utf8'));
    const decoded = decodeLegacy(image);
    const w = { ...workspace(), ...decoded };
    const id = Object.keys(w.assets)[0]!;
    w.assets.orphan = { id: 'orphan', dataUrl: w.assets[id]!.dataUrl };
    const restored = await restoreWorkspace(await backupWorkspace(w));
    expect(Object.keys(restored.assets)).toEqual([id]);
    expect(encodeLegacy(restored.document, restored.assets)).toEqual(parseLegacy(image));
  });
  it('escapes user content and renders every page without a DOM viewport', async () => {
    const w = workspace();
    w.document.documents[0]!.pages[0]!.items[0]!.text = '<script>alert(1)</script>';
    w.settings.overlay = 'doc_1';
    expect(outputPages(w).match(/class="output-page"/g)).toHaveLength(1);
    const html = await standaloneHtml({ ...w, settings: { ...w.settings, overlay: 'none' } });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('/_next/');
    expect(html).toContain('size:210mm 330mm');
  });
  it('auto-heals legacy document entries with missing or empty titles', () => {
    const rawNoTitle = [{ pages: [{ page_number: 1, items: [] }] }];
    const decodedNoTitle = decodeLegacy(rawNoTitle);
    expect(decodedNoTitle.document.documents[0]!.title).toBe('Dokumen 1');

    const rawEmptyTitle = [{ title: '   ', pages: [{ page_number: 1, items: [] }] }];
    const decodedEmptyTitle = decodeLegacy(rawEmptyTitle);
    expect(decodedEmptyTitle.document.documents[0]!.title).toBe('Dokumen 1');
  });
  it('repairs workspace without valid title into a working workspace', async () => {
    let saved: unknown = null;
    const fakeRepo = {
      load: async () => null,
      save: async (w: unknown) => {
        saved = w;
      },
      close: () => {},
      loadRaw: async () => ({
        stored: {
          id: 'active',
          schemaVersion: 2,
          storageVersion: 1,
          assetIds: [],
          document: {
            id: 'doc-1',
            documents: [
              {
                id: 'd-1',
                title: '',
                pages: [{ id: 'p-1', page_number: 1, extra: {}, items: [] }],
                extra: {},
              },
            ],
          },
          settings: defaultSettings,
          pdf: emptyPdf(),
          revision: 1,
        },
        assets: {},
      }),
    };
    const repaired = await repairWorkspace(fakeRepo as any);
    expect(repaired.document.documents[0]!.title).toBe('Dokumen 1');
    expect(saved).not.toBeNull();
  });
  it('resets workspace to clean demo workspace and clears legacy settings', async () => {
    let saved: unknown = null;
    const fakeRepo = {
      load: async () => null,
      save: async (w: unknown) => {
        saved = w;
      },
      close: () => {},
    };
    const clean = await resetWorkspace(fakeRepo as any);
    expect(clean.document.documents[0]!.title).toBe('Dokumen Baru');
    expect(saved).not.toBeNull();
  });
});
