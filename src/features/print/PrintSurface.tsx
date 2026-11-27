'use client';
import { forwardRef, useMemo } from 'react';
import { escapeHtml, OUTPUT_ITEM_CSS, outputPages, pageCss } from '@/infrastructure/export/html';
import { paperOf } from '@/domain/document/paper';
import { useEditorState } from '../editor/context';
import { useT } from '@/i18n/react';

const PrintSurface = forwardRef<HTMLDivElement>(function PrintSurface(_, ref) {
  const workspace = useEditorState((state) => state.workspace);
  const t = useT();
  const error = useEditorState((state) => state.error);
  const paper = useEditorState((state) => paperOf(state.workspace.document));
  const scope = useEditorState((state) => state.outputScope);
  const html = useMemo(
    () =>
      error ? `<p>${escapeHtml(t('json.fixBeforePrint'))}</p>` : outputPages(workspace, {}, scope),
    [workspace, error, t, scope],
  );
  return (
    <>
      {/* Overrides the F4 defaults in print.css with the workspace's sheet size. */}
      <style>{`${pageCss(paper)}@media print{${OUTPUT_ITEM_CSS}}`}</style>
      <div
        ref={ref}
        className="print-surface"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
});
export default PrintSurface;
