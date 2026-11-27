import { afterEach, expect, it, vi } from 'vitest';
import { decodeLegacy, defaultSettings } from '@/domain/document/model';
import { execute } from '@/domain/document/commands';
import { assertWorkspace, loadOrMigrate } from '@/infrastructure/storage/workspace';
import { emptyPdf } from '@/application/ports';
import { SessionLease } from '@/infrastructure/storage/session-lease';

const setup = () => decodeLegacy([{ title: 'Example', pages: [{ page_number: 1, items: [] }] }]);
afterEach(() => vi.unstubAllGlobals());
it('never overwrites a workspace when reading storage fails', async () => {
  const save = vi.fn();
  await expect(
    loadOrMigrate({
      load: async () => {
        throw new Error('Read failed');
      },
      save,
      close() {},
    }),
  ).rejects.toThrow('Read failed');
  expect(save).not.toHaveBeenCalled();
});

it('rejects stale command targets and invalid page numbers before creating pages', () => {
  const { document, assets } = setup();
  const documentId = document.documents[0]!.id;
  for (const pageNumber of [0, -1, 1.5, 101, Infinity])
    expect(() =>
      execute(
        document,
        { type: 'add', documentId, pageNumber, item: { text: 'New', x: 10, y: 10 } },
        assets,
      ),
    ).toThrow();
  expect(() => execute(document, { type: 'addPage', documentId: 'missing' }, assets)).toThrow();
  expect(() =>
    execute(
      document,
      { type: 'add', documentId, pageId: 'deleted', item: { text: 'New', x: 10, y: 10 } },
      assets,
    ),
  ).toThrow();
  expect(document.documents[0]!.pages).toHaveLength(1);
});

it('normalizes a legacy workspace without modifying caller-owned snapshots', () => {
  const decoded = setup();
  const raw = {
    schemaVersion: 2 as const,
    ...decoded,
    settings: { ...defaultSettings },
    pdf: emptyPdf(),
    revision: 0,
  };
  const before = JSON.stringify(raw);
  Object.freeze(raw.document.documents[0]);
  Object.freeze(raw.document);
  const result = assertWorkspace(raw);
  expect(JSON.stringify(raw)).toBe(before);
  expect(Object.keys(result.document)).toEqual(['id', 'documents']);
});

it('validates entries stored under the old document-list key before reading their pages', () => {
  const raw = {
    schemaVersion: 2,
    ...setup(),
    settings: { ...defaultSettings },
    pdf: emptyPdf(),
    revision: 0,
  };
  const malformed = {
    ...raw,
    document: { id: 'test', debtors: [{ id: 'entry', title: 'Invalid', extra: {}, pages: null }] },
  };
  expect(() =>
    assertWorkspace(malformed as unknown as Parameters<typeof assertWorkspace>[0]),
  ).toThrow();
});

class Channel {
  static current: Channel;
  onmessage: ((event: { data: string }) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor() {
    Channel.current = this;
  }
}
it('rejects refused handover immediately and cancels pending requests on close', async () => {
  vi.stubGlobal('BroadcastChannel', Channel);
  const lease = new SessionLease(async () => {});
  const pending = lease.requestRelease();
  Channel.current.onmessage?.({ data: 'release-rejected' });
  await expect(pending).rejects.toThrow('menolak');
  const waiting = lease.requestRelease();
  lease.close();
  await expect(waiting).rejects.toThrow('ditutup');
  await expect(lease.requestRelease()).rejects.toThrow('ditutup');
});
it('does not retain a lock delivered after the session was closed', async () => {
  vi.stubGlobal('BroadcastChannel', Channel);
  let deliver!: (lock: object) => Promise<void>;
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn((_name, _options, callback) => {
        deliver = callback;
        return Promise.resolve();
      }),
    },
  });
  const lease = new SessionLease(async () => {});
  const acquired = lease.acquire();
  lease.close();
  await deliver({});
  await expect(acquired).resolves.toBe(false);
});
