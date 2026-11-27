import { describe, expect, it } from 'vitest';
import { copyEntry, snapshotEntry } from '@/application/workspace-library';
import { decodeLegacy, defaultSettings } from '@/domain/document/model';
import { execute } from '@/domain/document/commands';
import { presetPaper } from '@/domain/document/paper';
import { emptyPdf, type Workspace } from '@/application/ports';
import { restoreWorkspace } from '@/infrastructure/storage/workspace';

const workspace = (): Workspace => {
  const { document, assets } = decodeLegacy([
    { title: 'A', pages: [{ page_number: 1, items: [{ text: '{{nama}}', x: 10, y: 10 }] }] },
    { title: 'B', pages: [] },
  ]);
  return {
    schemaVersion: 2,
    document: execute(document, { type: 'setPaper', paper: presetPaper('a4', false) }, assets),
    assets,
    settings: { ...defaultSettings, offsetX: 1.5 },
    pdf: emptyPdf(),
    revision: 7,
  };
};

describe('workspace library', () => {
  it('stores a complete, restorable snapshot with a summary', async () => {
    const entry = await snapshotEntry(workspace(), { id: 'w1', name: 'Formulir' }, 'template');
    expect(entry).toMatchObject({
      id: 'w1',
      kind: 'template',
      name: 'Formulir',
      documents: 2,
      paper: { width: 210, height: 297 },
    });
    const restored = await restoreWorkspace(entry.payload);
    expect(restored.document.paper).toEqual({ width: 210, height: 297 });
    expect(restored.document.documents.map((doc) => doc.title)).toEqual(['A', 'B']);
    expect(restored.settings.offsetX).toBe(1.5);
  });

  it('copies an entry under a new id and name', async () => {
    const entry = await snapshotEntry(workspace(), { id: 'w1', name: 'Formulir' });
    const copy = copyEntry(entry, 'Formulir (salinan)');
    expect(copy.id).not.toBe('w1');
    expect(copy.name).toBe('Formulir (salinan)');
    expect(copy.payload).toBe(entry.payload);
  });
});
