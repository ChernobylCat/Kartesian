'use client';
import { useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { FULL_SCOPE, parsePageRange, type OutputScope } from '@/domain/document/output-scope';
import { scopedPageCount } from '@/infrastructure/export/html';
import { useEditor, useEditorState } from '../editor/context';
import { useT } from '@/i18n/react';

/** Chooses which documents and pages Print and Export HTML produce. */
export default function OutputScopeDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { store } = useEditor();
  const workspace = useEditorState((state) => state.workspace);
  const current = useEditorState((state) => state.outputScope);
  const documents = workspace.document.documents;
  const [all, setAll] = useState(current.documentIds === 'all');
  const [chosen, setChosen] = useState<string[]>(
    current.documentIds === 'all' ? documents.map((entry) => entry.id) : current.documentIds,
  );
  const [pages, setPages] = useState(current.pages);
  const range = parsePageRange(pages);
  const draft: OutputScope = { documentIds: all ? 'all' : chosen, pages };
  const count = range === undefined ? 0 : scopedPageCount(workspace, draft);
  const valid = range !== undefined && count > 0;

  return (
    <Dialog title={t('scope.title')} onClose={onClose}>
      <div className="stack">
        <fieldset className="scope-documents">
          <legend>{t('scope.documents')}</legend>
          <label className="check-row">
            <input type="radio" name="scope-all" checked={all} onChange={() => setAll(true)} />
            {t('scope.allDocuments', { count: documents.length })}
          </label>
          <label className="check-row">
            <input type="radio" name="scope-all" checked={!all} onChange={() => setAll(false)} />
            {t('scope.someDocuments')}
          </label>
          {!all && (
            <div className="scope-list">
              {documents.map((entry, index) => (
                <label key={entry.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={chosen.includes(entry.id)}
                    onChange={(event) =>
                      setChosen(
                        event.target.checked
                          ? documents
                              .map((doc) => doc.id)
                              .filter((id) => id === entry.id || chosen.includes(id))
                          : chosen.filter((id) => id !== entry.id),
                      )
                    }
                  />
                  {index + 1}. {entry.title}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <label className="field">
          {t('scope.pages')}
          <input
            type="text"
            value={pages}
            placeholder={t('scope.pagesPlaceholder')}
            onChange={(event) => setPages(event.target.value)}
          />
        </label>
        <p className={valid ? 'settings-note' : 'field-error'} role="status">
          {range === undefined
            ? t('scope.invalidRange')
            : count === 0
              ? t('scope.nothing')
              : t('scope.summary', { count })}
        </p>
      </div>
      <div className="row spread" style={{ marginTop: 18 }}>
        <button
          onClick={() => {
            store.setState({ outputScope: FULL_SCOPE });
            onClose();
          }}
        >
          {t('scope.reset')}
        </button>
        <button
          className="primary"
          disabled={!valid}
          onClick={() => {
            store.setState({ outputScope: draft });
            onClose();
          }}
        >
          {t('action.apply')}
        </button>
      </div>
    </Dialog>
  );
}
