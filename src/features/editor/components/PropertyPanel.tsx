'use client';
import { useEffect, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Lock,
  Unlock,
  Copy,
  Trash2,
  ArrowUpToLine,
  ArrowDownToLine,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { useCommand, useEditor, useEditorState } from '../context';
import {
  ITEM_DEFAULTS,
  isBold,
  locate,
  type DocumentModel,
  type Item,
} from '@/domain/document/model';
import { type Align, type Patch } from '@/domain/document/commands';
import { FONTS, LINE_DIRECTIONS, MARK_GLYPHS } from '@/domain/document/schema';
import { paperOf } from '@/domain/document/paper';
import { fromUnit, toUnit, UNIT_STEP } from '@/domain/document/units';
import { DEFAULT_LINE_HEIGHT, isTextItem } from '@/domain/document/presentation';
import { useT } from '@/i18n/react';

export function NumericField({
  label,
  value,
  change,
  min,
  max,
  step = 0.1,
}: {
  label: string;
  value: number | undefined;
  change: (value: number) => boolean | void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => {
    setDraft(String(value ?? ''));
  }, [value]);
  return (
    <label className="field">
      {label}
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft.trim() && Number.isFinite(Number(draft))) {
            const next = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, Number(draft)));
            const accepted = change(next);
            setDraft(accepted === false ? String(value ?? '') : String(next));
          } else setDraft(String(value ?? ''));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}
/** Text input that commits on blur or Enter, like NumericField. */
function TextField({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: (value: string) => boolean | void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="field full">
      {label}
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== value && draft.trim() && change(draft) === false) setDraft(value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}
/** Layer values of every item on the pages that hold `items`. */
function pageLayers(document: DocumentModel, items: Item[]) {
  return items.flatMap(
    (item) => locate(document, item.id)?.page.items.map((entry) => entry.z_index ?? 1) ?? [1],
  );
}
export function SelectionActions({ floating = false }: { floating?: boolean }) {
  const t = useT();
  const { store } = useEditor();
  const command = useCommand();
  const ids = useEditorState((state) => state.selected);
  const document = useEditorState((state) => state.workspace.document);
  const items = ids.flatMap((id) => {
    const value = locate(document, id)?.item;
    return value ? [value] : [];
  });
  if (!items.length) return null;
  function patch(patch: Patch) {
    command({ type: 'patch', ids, patch }, 'format');
  }
  const locked = items.every((item) => item.locked);
  const bold = items.every(isBold);
  return (
    <div className={floating ? 'floating-toolbar' : 'row'} aria-label={t('format.label')}>
      <button
        className={`icon-button ${bold ? 'active' : ''}`}
        aria-label={t('format.bold')}
        aria-pressed={bold}
        onClick={() => patch({ bold: !bold })}
      >
        <Bold size={15} />
      </button>
      <button
        className={`icon-button ${items.every((item) => item.italic) ? 'active' : ''}`}
        aria-label={t('format.italic')}
        aria-pressed={items.every((item) => item.italic)}
        onClick={() => patch({ italic: !items.every((item) => item.italic) })}
      >
        <Italic size={15} />
      </button>
      <button
        className={`icon-button ${items.every((item) => item.underline) ? 'active' : ''}`}
        aria-label={t('format.underline')}
        aria-pressed={items.every((item) => item.underline)}
        onClick={() => patch({ underline: !items.every((item) => item.underline) })}
      >
        <Underline size={15} />
      </button>
      <button
        className="icon-button"
        aria-label={locked ? t('format.unlock') : t('format.lock')}
        aria-pressed={locked}
        onClick={() => patch({ locked: !locked })}
      >
        {locked ? <Lock size={15} /> : <Unlock size={15} />}
      </button>
      <button
        className="icon-button"
        aria-label={t('action.duplicate')}
        onClick={() => command({ type: 'duplicate', ids })}
      >
        <Copy size={15} />
      </button>
      <button
        className="icon-button danger"
        aria-label={t('format.delete')}
        onClick={() => {
          if (window.confirm(t('confirm.deleteSelectedCount', { count: ids.length })))
            command({ type: 'delete', ids });
        }}
      >
        <Trash2 size={15} />
      </button>
      {!floating && (
        <>
          <button
            className="icon-button"
            aria-label={t('action.bringToFront')}
            onClick={() => {
              const max = Math.max(...pageLayers(store.getState().workspace.document, items));
              patch({ z_index: Math.min(1000, max + 1) });
            }}
          >
            <ArrowUpToLine size={15} />
          </button>
          <button
            className="icon-button"
            aria-label={t('action.sendToBack')}
            onClick={() => {
              const min = Math.min(...pageLayers(store.getState().workspace.document, items));
              patch({ z_index: Math.max(-1000, min - 1) });
            }}
          >
            <ArrowDownToLine size={15} />
          </button>
        </>
      )}
    </div>
  );
}
export default function PropertyPanel() {
  const t = useT();
  const command = useCommand();
  const ids = useEditorState((state) => state.selected);
  const document = useEditorState((state) => state.workspace.document);
  const paper = paperOf(document);
  const unit = useEditorState((state) => state.unit);
  const items = ids.flatMap((id) => {
    const item = locate(document, id)?.item;
    return item ? [item] : [];
  });
  if (!items.length)
    return (
      <section className="sidebar-section">
        <div className="section-label">{t('properties.title')}</div>
        <p className="settings-note">{t('properties.empty')}</p>
      </section>
    );
  const item = items[0]!;
  /** The graphic kind when every selected item is the same graphic kind. */
  const graphicType =
    item.type &&
    item.type !== 'text' &&
    item.type !== 'image' &&
    items.every((entry) => entry.type === item.type)
      ? item.type
      : undefined;
  const shared = <K extends keyof Item>(key: K): Item[K] | undefined =>
    items.every((entry) => entry[key] === item[key]) ? item[key] : undefined;
  const presentation = <K extends keyof typeof ITEM_DEFAULTS>(key: K) => {
    const value = item[key] ?? ITEM_DEFAULTS[key];
    return items.every((entry) => (entry[key] ?? ITEM_DEFAULTS[key]) === value) ? value : undefined;
  };
  function patch(patch: Patch) {
    return command(
      { type: 'patch', ids, patch },
      `property:${ids.join(',')}:${Object.keys(patch).join(',')}`,
    );
  }
  // Position and size are shown in the display unit; rotation and layer are not lengths.
  const fields = [
    ['x', `X · ${unit}`, 0, paper.width, true],
    ['y', `Y · ${unit}`, 0, paper.height, true],
    ['width', t('properties.width', { unit }), 0.1, paper.width, true],
    ['height', t('properties.height', { unit }), 0.1, paper.height, true],
    ['rotation', t('properties.rotation'), -360, 360, false],
    ['z_index', t('properties.layer'), -1000, 1000, false],
  ] as const;
  const alignment: [Align, string][] = [
    ['left', t('align.left')],
    ['hcenter', t('align.hcenter')],
    ['right', t('align.right')],
    ['top', t('align.top')],
    ['vcenter', t('align.vcenter')],
    ['bottom', t('align.bottom')],
    ['distribute-h', t('align.distributeH')],
    ['distribute-v', t('align.distributeV')],
  ];
  return (
    <section id="propertyPanel" className="sidebar-section">
      <div className="section-label">{t('properties.title')}</div>
      <div className="selection-summary">
        {t('properties.summary', {
          count: items.length,
          kind:
            item.type === 'image'
              ? t('item.imageLabel')
              : graphicType
                ? t(`graphic.kind.${graphicType}`)
                : t('add.text'),
        })}
      </div>
      <div className="field-grid">
        {fields.map(([key, label, min, max, length]) => {
          const value = shared(key);
          return (
            <NumericField
              key={key}
              label={label}
              value={length && value !== undefined ? toUnit(value, unit) : value}
              min={length ? toUnit(min, unit) : min}
              max={length ? toUnit(max, unit) : max}
              step={key === 'z_index' ? 1 : length ? UNIT_STEP[unit] : 0.1}
              change={(next) => patch({ [key]: length ? fromUnit(next, unit) : next })}
            />
          );
        })}
        {items.every(isTextItem) && (
          <>
            <NumericField
              label={t('properties.fontSize')}
              value={presentation('font_size')}
              min={4}
              max={72}
              change={(font_size) => patch({ font_size })}
            />
            <label className="field">
              {t('properties.textColor')}
              {presentation('color') === undefined ? ` · ${t('properties.mixed')}` : ''}
              <input
                type="color"
                aria-label={t('properties.textColor')}
                value={presentation('color') ?? ITEM_DEFAULTS.color}
                onChange={(event) => patch({ color: event.target.value })}
              />
            </label>
            <label className="field full">
              Font
              <select
                aria-label="Font"
                value={presentation('font_family') ?? ''}
                onChange={(event) =>
                  patch({ font_family: event.target.value as Item['font_family'] })
                }
              >
                <option value="" disabled>
                  {t('properties.mixed')}
                </option>
                {FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font.split(',')[0]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('properties.highlight')}
              <input
                type="color"
                value={shared('bg_color') ?? '#ffffff'}
                onChange={(event) => patch({ bg_color: event.target.value })}
              />
            </label>
            <button onClick={() => patch({ bg_color: undefined })}>
              {t('properties.clearHighlight')}
            </button>
            <div className="field full">
              {t('properties.align')}
              <div className="row" role="group" aria-label={t('properties.align')}>
                {(
                  [
                    ['left', AlignLeft, t('properties.alignLeft')],
                    ['center', AlignCenter, t('properties.alignCenter')],
                    ['right', AlignRight, t('properties.alignRight')],
                  ] as const
                ).map(([value, Icon, label]) => {
                  const active = (shared('text_align') ?? 'left') === value;
                  return (
                    <button
                      key={value}
                      className={`icon-button ${active ? 'active' : ''}`}
                      aria-label={label}
                      aria-pressed={active}
                      onClick={() => patch({ text_align: value === 'left' ? undefined : value })}
                    >
                      <Icon size={15} />
                    </button>
                  );
                })}
              </div>
            </div>
            <NumericField
              label={t('properties.letterSpacing')}
              value={shared('letter_spacing') ?? 0}
              min={0}
              max={50}
              change={(value) => patch({ letter_spacing: value || undefined })}
            />
            <NumericField
              label={t('properties.lineHeight')}
              value={shared('line_height') ?? DEFAULT_LINE_HEIGHT}
              min={0.5}
              max={4}
              change={(value) =>
                patch({ line_height: value === DEFAULT_LINE_HEIGHT ? undefined : value })
              }
            />
            <NumericField
              label={t('properties.combCells')}
              value={shared('comb_cells') ?? 0}
              min={0}
              max={100}
              step={1}
              change={(value) => {
                if (value > 0 && items.some((entry) => !entry.width)) {
                  return patch({ comb_cells: Math.round(value), width: 40 });
                }
                return patch({ comb_cells: value > 0 ? Math.round(value) : undefined });
              }}
            />
            <label className="check-row full">
              <input
                type="checkbox"
                checked={items.every((entry) => entry.fit === 'shrink')}
                disabled={items.some((entry) => !entry.width)}
                onChange={(event) => patch({ fit: event.target.checked ? 'shrink' : undefined })}
              />
              {t('properties.shrinkToFit')}
            </label>
            {items.some((entry) => !entry.width) && (
              <p className="settings-note full">{t('properties.needsWidth')}</p>
            )}
          </>
        )}
        {graphicType && (
          <>
            {graphicType === 'mark' && (
              <label className="field full">
                {t('graphic.glyph')}
                <select
                  value={shared('text') ?? ''}
                  onChange={(event) => patch({ text: event.target.value })}
                >
                  {MARK_GLYPHS.map((glyph) => (
                    <option key={glyph} value={glyph}>
                      {t(`graphic.glyph.${glyph}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {graphicType === 'line' && (
              <label className="field full">
                {t('graphic.direction')}
                <select
                  value={shared('text') ?? ''}
                  onChange={(event) => patch({ text: event.target.value })}
                >
                  {LINE_DIRECTIONS.map((direction) => (
                    <option key={direction} value={direction}>
                      {t(`graphic.direction.${direction}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(graphicType === 'barcode' || graphicType === 'qr') && (
              <TextField
                label={t('graphic.value')}
                value={shared('text') ?? ''}
                change={(text) => patch({ text })}
              />
            )}
            {graphicType === 'barcode' && (
              <label className="field full">
                {t('graphic.format')}
                <select
                  value={shared('barcode_format') ?? 'code128'}
                  onChange={(event) =>
                    patch({ barcode_format: event.target.value as Item['barcode_format'] })
                  }
                >
                  <option value="code128">Code 128</option>
                  <option value="ean13">EAN-13</option>
                </select>
              </label>
            )}
            {graphicType === 'rect' && (
              <label className="field">
                {t('graphic.fill')}
                <input
                  type="color"
                  value={shared('bg_color') ?? '#ffffff'}
                  onChange={(event) => patch({ bg_color: event.target.value })}
                />
              </label>
            )}
            <label className="field">
              {graphicType === 'rect' ? t('graphic.borderColor') : t('graphic.color')}
              <input
                type="color"
                value={shared('color') ?? ITEM_DEFAULTS.color}
                onChange={(event) => patch({ color: event.target.value })}
              />
            </label>
            {(graphicType === 'mark' || graphicType === 'line' || graphicType === 'rect') && (
              <NumericField
                label={t('graphic.stroke')}
                value={shared('stroke_width') ?? 0}
                min={0}
                max={20}
                step={0.05}
                change={(value) => patch({ stroke_width: value || undefined })}
              />
            )}
            {(graphicType === 'barcode' || graphicType === 'qr') && (
              <p className="settings-note full">{t('graphic.codeHint')}</p>
            )}
          </>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <SelectionActions />
      </div>
      {items.length >= 2 && (
        <div className="row" style={{ marginTop: 12 }}>
          {alignment.map(([action, label]) => (
            <button key={action} onClick={() => command({ type: 'align', ids, action })}>
              {label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
