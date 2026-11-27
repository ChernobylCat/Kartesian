import { describe, expect, it } from 'vitest';
import { DEFAULT_PAPER as F4 } from '@/domain/document/paper';
import { decodeLegacy, encodeLegacy, defaultSettings } from '@/domain/document/model';
import { createEditorStore } from '@/features/editor/store/editor-store';
import { emptyPdf, type Workspace } from '@/application/ports';
import { attachAutosave } from '@/application/editor-session';
import { freezeAndFlush } from '@/application/workspace-transfer';
import { resize, snap } from '@/domain/document/geometry';
import { execute } from '@/domain/document/commands';

function workspace(): Workspace {
  return {
    schemaVersion: 2,
    ...decodeLegacy([
      { name: 'Imported', pages: [{ page_number: 1, items: [{ text: 'Text', x: 20, y: 30 }] }] },
    ]),
    settings: { ...defaultSettings },
    pdf: emptyPdf(),
    revision: 0,
  };
}

describe('audit regressions: codecs and measured geometry', () => {
  it('retains all supported name keys and additional names losslessly', () => {
    for (const names of [
      { name: 'Name' },
      { debitur: 'Alias' },
      { title: 'Title' },
      { title: 'Title', name: 'Name', debitur: 'Alias' },
      { name: 'Name', debitur: 'Alias' },
    ]) {
      const raw = [{ ...names, pages: [] }];
      const result = decodeLegacy(raw);
      expect(result.document.documents[0]!.title).toBe(
        'title' in names ? names.title : 'name' in names ? names.name : names.debitur,
      );
      expect(encodeLegacy(result.document, result.assets)).toEqual(raw);
    }
  });
  it('resizes and snaps auto-sized items from measured dimensions', () => {
    const item = workspace().document.documents[0]!.pages[0]!.items[0]!;
    expect(resize(item, F4, 'e', 2, 0, false, false, { width: 40, height: 5 })).toMatchObject({
      x: 20,
      y: 30,
      width: 42,
      height: 5,
    });
    const sizes = new Map([[item.id, { width: 40, height: 5 }]]);
    expect(snap(item, F4, 44.8, 0, [], 1.5, {}, sizes)).toMatchObject({ dx: 45, guideX: 105 });
  });
  it('aligns natural text using measured widths without persisting explicit sizes', () => {
    const w = workspace();
    const page = w.document.documents[0]!.pages[0]!;
    page.items.push({ ...page.items[0]!, id: 'second', x: 80, text: 'Longer text' });
    const [first, second] = page.items;
    const result = execute(
      w.document,
      {
        type: 'align',
        ids: page.items.map((i) => i.id),
        action: 'hcenter',
        sizes: { [first!.id]: { width: 40, height: 5 }, [second!.id]: { width: 10, height: 5 } },
      },
      w.assets,
    );
    const items = result.documents[0]!.pages[0]!.items;
    expect(items[0]!.x + 20).toBe(items[1]!.x + 5);
    expect(items.every((i) => i.width === undefined)).toBe(true);
  });
});

describe('audit regressions: frozen ownership transfer', () => {
  it('commits focused drafts first, freezes all mutations, and saves before release', async () => {
    const store = createEditorStore(workspace());
    let complete!: () => void;
    const gate = new Promise<void>((resolve) => (complete = resolve));
    const saved: Workspace[] = [];
    const saver = attachAutosave(store, {
      load: async () => null,
      close() {},
      save: async (value) => {
        saved.push(value);
        await gate;
      },
    });
    try {
      const id = store.getState().workspace.document.documents[0]!.pages[0]!.items[0]!.id;
      const prepared = freezeAndFlush(store, saver.flush, () =>
        store.getState().command({ type: 'patch', ids: [id], patch: { text: 'Focused draft' } }),
      );
      expect(store.getState().frozen).toBe(true);
      const before = store.getState().workspace;
      expect(() => store.getState().command({ type: 'duplicate', ids: [id] })).toThrow();
      expect(() => store.getState().replace(before.document, {})).toThrow();
      store.getState().settings({ offsetX: 3 });
      store.getState().pdf(emptyPdf());
      store.getState().undo();
      store.getState().redo();
      store.getState().editJson('{');
      expect(store.getState().workspace).toBe(before);
      expect(store.getState().error).toBeNull();
      complete();
      const unfreeze = await prepared;
      expect(saved.at(-1)!.document.documents[0]!.pages[0]!.items[0]!.text).toBe('Focused draft');
      expect(store.getState().saveStatus).toBe('saved');
      expect(store.getState().frozen).toBe(true);
      store.setState({ readonly: true });
      unfreeze();
      expect(store.getState().frozen).toBe(false);
    } finally {
      saver.destroy();
    }
  });
  it('unfreezes after storage failure and preserves pending edits for retry', async () => {
    const store = createEditorStore(workspace());
    store.getState().settings({ offsetX: 2 });
    const saver = attachAutosave(store, {
      load: async () => null,
      close() {},
      save: async () => {
        throw new Error('Quota');
      },
    });
    try {
      await expect(freezeAndFlush(store, saver.flush)).rejects.toThrow('Quota');
      expect(store.getState().frozen).toBe(false);
      expect(store.getState().readonly).toBe(false);
      expect(store.getState().workspace.settings.offsetX).toBe(2);
    } finally {
      saver.destroy();
    }
  });
  it('vetoes invalid drafts and overlapping transfers without unlocking another transfer', async () => {
    const store = createEditorStore(workspace());
    store.getState().editJson('{');
    await expect(freezeAndFlush(store, async () => {})).rejects.toThrow('JSON');
    expect(store.getState().frozen).toBe(false);
    store.setState({ error: null, frozen: true });
    await expect(freezeAndFlush(store, async () => {})).rejects.toThrow('perpindahan');
    expect(store.getState().frozen).toBe(true);
  });
  it('does not attach image assets when a command is blocked or invalid', () => {
    const store = createEditorStore(workspace());
    const before = store.getState().workspace;
    store.setState({ frozen: true });
    expect(() =>
      store.getState().command({ type: 'addDocument', name: 'Later' }, undefined, {
        orphan: { id: 'orphan', dataUrl: 'invalid' },
      }),
    ).toThrow();
    expect(store.getState().workspace).toBe(before);
  });
});
