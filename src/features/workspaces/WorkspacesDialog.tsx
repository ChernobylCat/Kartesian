'use client';
import { useCallback, useEffect, useState } from 'react';
import { Copy, FilePlus2, FolderOpen, LayoutTemplate, Pencil, Trash2 } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { useEditor, useEditorState } from '../editor/context';
import { finishEditing } from '../editor/finish-editing';
import { useT } from '@/i18n/react';
import { errorMessage } from '@/application/error-message';
import { freezeAndFlush } from '@/application/workspace-transfer';
import { activateWorkspace, copyEntry, snapshotEntry } from '@/application/workspace-library';
import {
  deleteEntry,
  getEntry,
  listEntries,
  NAME_MAX,
  putEntry,
  renameEntry,
  setCurrent,
  type CurrentWorkspace,
  type LibraryEntry,
  type LibrarySummary,
} from '@/infrastructure/storage/library';
import { freshWorkspace, restoreWorkspace } from '@/infrastructure/storage/workspace';
import { uid } from '@/domain/document/model';
import { paperLabel, paperOf } from '@/domain/document/paper';
import { formatDateTime } from '@/i18n/core';
import type { Workspace } from '@/application/ports';

/** Asks for a name; returns undefined when cancelled or blank. */
function askName(message: string, initial: string) {
  const value = prompt(message, initial)?.trim();
  return value ? value.slice(0, NAME_MAX) : undefined;
}

/**
 * Lists saved workspaces and templates and switches between them. Switching saves a
 * snapshot of the open workspace first, then reloads the editor with the other one.
 */
export default function WorkspacesDialog({
  current,
  onCurrentChange,
  onClose,
}: {
  current: CurrentWorkspace;
  onCurrentChange: (current: CurrentWorkspace) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { store, flush } = useEditor();
  const workspace = useEditorState((state) => state.workspace);
  const readonly = useEditorState((state) => state.readonly);
  const [entries, setEntries] = useState<LibrarySummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    listEntries()
      .then(setEntries)
      .catch((failure: unknown) => setError(errorMessage(failure)));
  }, []);
  useEffect(refresh, [refresh]);

  /** Runs an action that needs no switch (rename, copy, delete), then refreshes. */
  async function run(action: () => Promise<unknown>) {
    setError('');
    setBusy(true);
    try {
      await action();
      refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  /** Saves the open workspace to the library, opens `next`, and reloads. */
  async function switchTo(next: () => Promise<Workspace>, identity: CurrentWorkspace) {
    setError('');
    setBusy(true);
    let unfreeze: (() => void) | undefined;
    try {
      unfreeze = await freezeAndFlush(store, flush, finishEditing);
      const target = await next();
      await putEntry(await snapshotEntry(store.getState().workspace, current));
      await activateWorkspace(target);
      await setCurrent(identity);
      location.reload();
    } catch (failure) {
      unfreeze?.();
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  const workspaces = (entries ?? []).filter(
    (entry) => entry.kind === 'workspace' && entry.id !== current.id,
  );
  const templates = (entries ?? []).filter((entry) => entry.kind === 'template');
  const locked = busy || readonly;
  const summary = (entry: Pick<LibrarySummary, 'documents' | 'paper'>) =>
    `${t('count.documents', { count: entry.documents })} · ${paperLabel(entry.paper)}`;
  const payload = async (id: string): Promise<LibraryEntry> => {
    const entry = await getEntry(id);
    if (!entry) throw new Error(t('workspaces.missing'));
    return entry;
  };

  return (
    <Dialog title={t('workspaces.title')} wide onClose={onClose}>
      {readonly && <p className="field-error">{t('workspaces.readonly')}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <ul className="library-list" aria-label={t('workspaces.listLabel')}>
        <li className="current">
          <div>
            <b>{current.name}</b>
            <small>
              {t('workspaces.open')} ·{' '}
              {summary({
                documents: workspace.document.documents.length,
                paper: paperOf(workspace.document),
              })}
            </small>
          </div>
          <div className="row">
            <button
              disabled={locked}
              onClick={() => {
                const name = askName(t('workspaces.renamePrompt'), current.name);
                if (!name) return;
                void run(async () => {
                  const renamed = { ...current, name };
                  await setCurrent(renamed);
                  await renameEntry(current.id, name).catch(() => {});
                  onCurrentChange(renamed);
                });
              }}
            >
              <Pencil size={14} />
              {t('workspaces.rename')}
            </button>
            <button
              disabled={locked}
              onClick={() => {
                const name = askName(
                  t('workspaces.copyPrompt'),
                  t('workspaces.copyName', { name: current.name }),
                );
                if (!name) return;
                void run(async () =>
                  putEntry(await snapshotEntry(store.getState().workspace, { id: uid(), name })),
                );
              }}
            >
              <Copy size={14} />
              {t('workspaces.duplicate')}
            </button>
          </div>
        </li>
        {workspaces.map((entry) => (
          <li key={entry.id}>
            <div>
              <b>{entry.name}</b>
              <small>
                {summary(entry)} ·{' '}
                {t('workspaces.saved', { time: formatDateTime(entry.updatedAt) })}
              </small>
            </div>
            <div className="row">
              <button
                className="primary"
                disabled={locked}
                onClick={() =>
                  void switchTo(async () => restoreWorkspace((await payload(entry.id)).payload), {
                    id: entry.id,
                    name: entry.name,
                  })
                }
              >
                <FolderOpen size={14} />
                {t('workspaces.openAction')}
              </button>
              <button
                disabled={locked}
                onClick={() => {
                  const name = askName(t('workspaces.renamePrompt'), entry.name);
                  if (name) void run(() => renameEntry(entry.id, name));
                }}
              >
                <Pencil size={14} />
                {t('workspaces.rename')}
              </button>
              <button
                disabled={locked}
                onClick={() =>
                  void run(async () =>
                    putEntry(
                      copyEntry(
                        await payload(entry.id),
                        t('workspaces.copyName', { name: entry.name }),
                      ),
                    ),
                  )
                }
              >
                <Copy size={14} />
                {t('workspaces.duplicate')}
              </button>
              <button
                className="danger icon-button"
                disabled={locked}
                aria-label={t('workspaces.delete', { name: entry.name })}
                onClick={() => {
                  if (confirm(t('workspaces.confirmDelete', { name: entry.name })))
                    void run(() => deleteEntry(entry.id));
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button
          disabled={locked}
          onClick={() => {
            const name = askName(t('workspaces.newPrompt'), t('workspaces.newName'));
            if (name) void switchTo(async () => freshWorkspace(), { id: uid(), name });
          }}
        >
          <FilePlus2 size={14} />
          {t('workspaces.new')}
        </button>
        <button
          disabled={locked}
          onClick={() => {
            const name = askName(t('templates.savePrompt'), current.name);
            if (name)
              void run(async () =>
                putEntry(
                  await snapshotEntry(store.getState().workspace, { id: uid(), name }, 'template'),
                ),
              );
          }}
        >
          <LayoutTemplate size={14} />
          {t('templates.save')}
        </button>
      </div>

      <h3 className="library-heading">{t('templates.title')}</h3>
      {!templates.length ? (
        <p className="settings-note">{entries ? t('templates.empty') : t('workspaces.loading')}</p>
      ) : (
        <ul className="library-list" aria-label={t('templates.title')}>
          {templates.map((entry) => (
            <li key={entry.id}>
              <div>
                <b>{entry.name}</b>
                <small>{summary(entry)}</small>
              </div>
              <div className="row">
                <button
                  className="primary"
                  disabled={locked}
                  onClick={() => {
                    const name = askName(t('workspaces.newPrompt'), entry.name);
                    if (name)
                      void switchTo(
                        async () => restoreWorkspace((await payload(entry.id)).payload),
                        { id: uid(), name },
                      );
                  }}
                >
                  <FilePlus2 size={14} />
                  {t('templates.use')}
                </button>
                <button
                  className="danger icon-button"
                  disabled={locked}
                  aria-label={t('workspaces.delete', { name: entry.name })}
                  onClick={() => {
                    if (confirm(t('workspaces.confirmDelete', { name: entry.name })))
                      void run(() => deleteEntry(entry.id));
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="settings-note">{t('workspaces.note')}</p>
    </Dialog>
  );
}
