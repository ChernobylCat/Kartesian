'use client';
import { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { LIMITS } from '@/domain/document/schema';
import { parseCsv, type CsvTable } from '@/domain/merge/csv';
import { mergeCoverage, templateTokens } from '@/domain/merge/merge';
import { FORMATS, fillPlaceholders, normalizeKey } from '@/domain/merge/placeholders';
import { useCommand, useEditorState } from '../editor/context';
import { useLocale, useT } from '@/i18n/react';
import { errorMessage } from '@/application/error-message';

/** Largest CSV accepted; far above what 100 documents need. */
const MAX_CSV_BYTES = 5 * 1024 ** 2;
/** Columns that name each document when present. */
const TITLE_COLUMNS = ['title', 'judul', 'nama', 'name', 'nama_lengkap', 'full_name'];

/**
 * Fills a template document from a CSV file: one document per row, every
 * `{{key}}` replaced by the matching column.
 */
export default function MergeDialog({
  initialDocumentId,
  onClose,
}: {
  initialDocumentId: string;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const command = useCommand();
  const documents = useEditorState((state) => state.workspace.document.documents);
  const [templateId, setTemplateId] = useState(initialDocumentId);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [titleColumn, setTitleColumn] = useState('');
  const [replace, setReplace] = useState(true);
  const [previewRow, setPreviewRow] = useState(0);
  const template = documents.find((entry) => entry.id === templateId) ?? documents[0]!;
  const coverage = useMemo(() => mergeCoverage(template, table?.columns ?? []), [template, table]);
  const tokens = useMemo(() => templateTokens(template), [template]);
  const resultCount = (table?.rows.length ?? 0) + (replace ? 0 : documents.length);
  const tooMany = resultCount > LIMITS.documents;

  async function load(file: File) {
    setError('');
    try {
      if (file.size > MAX_CSV_BYTES) throw new Error(t('merge.fileTooLarge'));
      const parsed = parseCsv(await file.text());
      if (!parsed.columns.length || !parsed.rows.length) throw new Error(t('merge.emptyFile'));
      setTable(parsed);
      setFileName(file.name);
      setPreviewRow(0);
      setTitleColumn(
        parsed.columns.find((column) => TITLE_COLUMNS.includes(normalizeKey(column))) ?? '',
      );
    } catch (failure) {
      setTable(null);
      setError(errorMessage(failure));
    }
  }

  function apply() {
    if (!table) return;
    const applied = command({
      type: 'merge',
      documentId: template.id,
      rows: table.rows,
      titleColumn: titleColumn || undefined,
      replace,
    });
    if (applied) onClose();
  }

  const row = table?.rows[previewRow];
  return (
    <Dialog title={t('merge.title')} wide onClose={onClose}>
      <p className="muted">{t('merge.intro')}</p>
      <div className="stack">
        <label className="field">
          {t('merge.template')}
          <select value={template.id} onChange={(event) => setTemplateId(event.target.value)}>
            {documents.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        </label>
        {coverage.keys.length ? (
          <p className="settings-note">
            {t('merge.keysFound', { count: coverage.keys.length })}{' '}
            {coverage.keys.map((key) => `{{${key}}}`).join(', ')}
          </p>
        ) : (
          <p className="field-error" role="alert">
            {t('merge.noKeys')}
          </p>
        )}
        <label className="file-picker">
          <FileSpreadsheet size={14} />
          {fileName || t('merge.chooseFile')}
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
            aria-label={t('merge.chooseFile')}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void load(file);
            }}
          />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {table && (
          <>
            <p className="settings-note" role="status">
              {t('merge.loaded', {
                rows: table.rows.length,
                columns: table.columns.length,
                delimiter: table.delimiter === '\t' ? 'Tab' : table.delimiter,
              })}
            </p>
            {coverage.missing.length > 0 && (
              <p className="field-error" role="alert">
                {t('merge.missing')} {coverage.missing.map((key) => `{{${key}}}`).join(', ')}
              </p>
            )}
            {coverage.unused.length > 0 && (
              <p className="settings-note">
                {t('merge.unused')} {coverage.unused.join(', ')}
              </p>
            )}
            <label className="field">
              {t('merge.titleColumn')}
              <select value={titleColumn} onChange={(event) => setTitleColumn(event.target.value)}>
                <option value="">{t('merge.titleNumbered', { title: template.title })}</option>
                {table.columns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
            {row && coverage.keys.length > 0 && (
              <div className="merge-preview">
                <label className="field">
                  {t('merge.previewRow')}
                  <select
                    value={previewRow}
                    onChange={(event) => setPreviewRow(Number(event.target.value))}
                  >
                    {table.rows.map((entry, index) => (
                      <option key={index} value={index}>
                        {index + 1} · {(titleColumn && entry[titleColumn]) || ''}
                      </option>
                    ))}
                  </select>
                </label>
                <table className="merge-table">
                  <tbody>
                    {tokens.map((token) => {
                      const filled = fillPlaceholders(token, row, locale);
                      return (
                        <tr key={token}>
                          <th scope="row">{token}</th>
                          <td className={filled.missing.length ? 'danger-text' : undefined}>
                            {filled.missing.length ? t('merge.noColumn') : filled.text || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <label className="check-row">
              <input
                type="checkbox"
                checked={replace}
                onChange={(event) => setReplace(event.target.checked)}
              />
              {t('merge.replace')}
            </label>
            {tooMany && (
              <p className="field-error" role="alert">
                {t('merge.tooMany', { count: resultCount, max: LIMITS.documents })}
              </p>
            )}
          </>
        )}
        <details>
          <summary>{t('merge.formatsTitle')}</summary>
          <p className="settings-note">{t('merge.formatsHelp')}</p>
          <p className="settings-note">
            <code>{FORMATS.map((format) => `|${format}`).join('  ')}</code>
          </p>
        </details>
      </div>
      <div className="row spread" style={{ marginTop: 18 }}>
        <button onClick={onClose}>{t('action.cancel')}</button>
        <button
          className="primary"
          disabled={!table || tooMany || !coverage.keys.length}
          onClick={apply}
        >
          {t('merge.apply', { count: table?.rows.length ?? 0 })}
        </button>
      </div>
    </Dialog>
  );
}
