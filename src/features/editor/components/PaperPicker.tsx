'use client';
import { useState } from 'react';
import { RectangleHorizontal, RectangleVertical } from 'lucide-react';
import {
  PAPER_PRESETS,
  PAPER_RANGE,
  type Paper,
  type PaperPresetId,
  isLandscape,
  paperOf,
  paperPreset,
  paperSize,
  presetPaper,
  rotatePaper,
} from '@/domain/document/paper';
import { round } from '@/domain/document/geometry';
import { useCommand, useEditorState } from '../context';
import { useT } from '@/i18n/react';

const CUSTOM = 'custom';

/**
 * Sheet size for the whole workspace. Changing it keeps every coordinate, so the
 * command is refused (with a message) while elements would fall outside the new sheet.
 */
export default function PaperPicker() {
  const t = useT();
  const command = useCommand();
  const paper = useEditorState((state) => paperOf(state.workspace.document));
  const disabled = useEditorState((state) => state.readonly || state.frozen || !!state.error);
  const preset = paperPreset(paper);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ width: String(paper.width), height: String(paper.height) });
  const custom = editing || !preset;

  const apply = (next: Paper) => command({ type: 'setPaper', paper: next });
  function openCustom() {
    setDraft({ width: String(paper.width), height: String(paper.height) });
    setEditing(true);
  }
  function applyCustom() {
    const width = round(Number(draft.width.replace(',', '.')));
    const height = round(Number(draft.height.replace(',', '.')));
    if (apply({ width, height })) setEditing(false);
  }
  const sideInput = (side: 'width' | 'height', label: string) => (
    <label className="paper-side">
      <input
        type="number"
        inputMode="decimal"
        min={PAPER_RANGE.min}
        max={PAPER_RANGE.max}
        step={0.1}
        value={draft[side]}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => setDraft({ ...draft, [side]: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') applyCustom();
          if (event.key === 'Escape') setEditing(false);
        }}
      />
    </label>
  );

  return (
    <div className="paper-picker" data-tour="paper">
      <label className="sr-only" htmlFor="paperSize">
        {t('paper.size')}
      </label>
      <select
        id="paperSize"
        className="paper-select"
        value={custom ? CUSTOM : preset!.id}
        disabled={disabled}
        onChange={(event) => {
          const value = event.target.value;
          if (value === CUSTOM) return openCustom();
          setEditing(false);
          apply(presetPaper(value as PaperPresetId, isLandscape(paper)));
        }}
      >
        {PAPER_PRESETS.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label} · {paperSize(isLandscape(paper) ? rotatePaper(entry) : entry)}
          </option>
        ))}
        <option value={CUSTOM}>{t('paper.customOption')}</option>
      </select>
      {custom && (
        <>
          {sideInput('width', t('paper.widthLabel'))}
          <span aria-hidden="true">×</span>
          {sideInput('height', t('paper.heightLabel'))}
          <button disabled={disabled} onClick={applyCustom}>
            {t('action.apply')}
          </button>
        </>
      )}
      <button
        className="icon-button"
        disabled={disabled || paper.width === paper.height}
        aria-label={isLandscape(paper) ? t('paper.toPortrait') : t('paper.toLandscape')}
        title={isLandscape(paper) ? t('paper.landscapeHint') : t('paper.portraitHint')}
        onClick={() => {
          const rotated = rotatePaper(paper);
          if (apply(rotated))
            setDraft({ width: String(rotated.width), height: String(rotated.height) });
        }}
      >
        {isLandscape(paper) ? <RectangleHorizontal size={15} /> : <RectangleVertical size={15} />}
      </button>
    </div>
  );
}
