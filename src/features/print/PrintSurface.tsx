'use client';
import { forwardRef, useMemo } from 'react';
import { outputPages } from '@/infrastructure/export/html';
import { useEditorState } from '../editor/context';

const PrintSurface = forwardRef<HTMLDivElement>(function PrintSurface(_, ref) {
  const workspace = useEditorState((state) => state.workspace);
  const error = useEditorState((state) => state.error);
  const html = useMemo(
    () => (error ? '<p>Perbaiki JSON sebelum mencetak.</p>' : outputPages(workspace)),
    [workspace, error],
  );
  return (
    <div
      ref={ref}
      className="print-surface"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
export default PrintSurface;
