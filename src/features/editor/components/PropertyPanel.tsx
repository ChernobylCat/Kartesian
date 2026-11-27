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
} from 'lucide-react';
import { useCommand, useEditor, useEditorState } from '../context';
import { locate, type Item } from '@/domain/document/model';
import { type Align, type Patch } from '@/domain/document/commands';
import { FONTS } from '@/domain/document/schema';

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
  change: (value: number) => void;
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
            setDraft(String(next));
            change(next);
          } else setDraft(String(value ?? ''));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function SelectionActions({ floating = false }: { floating?: boolean }) {
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
  return (
    <div className={floating ? 'floating-toolbar' : 'row'} aria-label="Format elemen">
      <button
        className={`icon-button ${items.every((item) => item.bold !== false) ? 'active' : ''}`}
        aria-label="Tebal"
        aria-pressed={items.every((item) => item.bold !== false)}
        onClick={() => patch({ bold: !items.every((item) => item.bold !== false) })}
      >
        <Bold size={15} />
      </button>
      <button
        className={`icon-button ${items.every((item) => item.italic) ? 'active' : ''}`}
        aria-label="Miring"
        aria-pressed={items.every((item) => item.italic)}
        onClick={() => patch({ italic: !items.every((item) => item.italic) })}
      >
        <Italic size={15} />
      </button>
      <button
        className={`icon-button ${items.every((item) => item.underline) ? 'active' : ''}`}
        aria-label="Garis bawah"
        aria-pressed={items.every((item) => item.underline)}
        onClick={() => patch({ underline: !items.every((item) => item.underline) })}
      >
        <Underline size={15} />
      </button>
      <button
        className="icon-button"
        aria-label={locked ? 'Buka kunci' : 'Kunci'}
        aria-pressed={locked}
        onClick={() => patch({ locked: !locked })}
      >
        {locked ? <Lock size={15} /> : <Unlock size={15} />}
      </button>
      <button
        className="icon-button"
        aria-label="Duplikasi"
        onClick={() => command({ type: 'duplicate', ids })}
      >
        <Copy size={15} />
      </button>
      <button
        className="icon-button danger"
        aria-label="Hapus elemen"
        onClick={() => {
          if (window.confirm(`Hapus ${ids.length} elemen terpilih?`))
            command({ type: 'delete', ids });
        }}
      >
        <Trash2 size={15} />
      </button>
      {!floating && (
        <>
          <button
            className="icon-button"
            aria-label="Bawa ke depan"
            onClick={() => {
              const max = Math.max(
                ...items.flatMap(
                  (item) =>
                    locate(store.getState().workspace.document, item.id)?.page.items.map(
                      (entry) => entry.z_index ?? 1,
                    ) ?? [1],
                ),
              );
              patch({ z_index: Math.min(1000, max + 1) });
            }}
          >
            <ArrowUpToLine size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Kirim ke belakang"
            onClick={() => {
              const min = Math.min(
                ...items.flatMap(
                  (item) =>
                    locate(store.getState().workspace.document, item.id)?.page.items.map(
                      (entry) => entry.z_index ?? 1,
                    ) ?? [1],
                ),
              );
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
  const command = useCommand();
  const ids = useEditorState((state) => state.selected);
  const document = useEditorState((state) => state.workspace.document);
  const items = ids.flatMap((id) => {
    const item = locate(document, id)?.item;
    return item ? [item] : [];
  });
  if (!items.length)
    return (
      <section className="sidebar-section">
        <div className="section-label">Properti elemen</div>
        <p className="settings-note">
          Pilih teks atau gambar pada halaman untuk mengatur posisi dan tampilannya.
        </p>
      </section>
    );
  const item = items[0]!;
  const shared = <K extends keyof Item>(key: K): Item[K] | undefined =>
    items.every((entry) => entry[key] === item[key]) ? item[key] : undefined;
  function patch(patch: Patch) {
    command(
      { type: 'patch', ids, patch },
      `property:${ids.join(',')}:${Object.keys(patch).join(',')}`,
    );
  }
  const fields = [
    ['x', 'X · mm', 0, 210],
    ['y', 'Y · mm', 0, 330],
    ['width', 'Lebar · mm', 0.1, 210],
    ['height', 'Tinggi · mm', 0.1, 330],
    ['rotation', 'Rotasi · °', -360, 360],
    ['z_index', 'Layer', -1000, 1000],
  ] as const;
  const alignment: [Align, string][] = [
    ['left', 'Kiri'],
    ['hcenter', 'Tengah H'],
    ['right', 'Kanan'],
    ['top', 'Atas'],
    ['vcenter', 'Tengah V'],
    ['bottom', 'Bawah'],
    ['distribute-h', 'Distribusi H'],
    ['distribute-v', 'Distribusi V'],
  ];
  return (
    <section id="propertyPanel" className="sidebar-section">
      <div className="section-label">Properti elemen</div>
      <div className="selection-summary">
        {items.length} elemen terpilih · {item.type === 'image' ? 'Gambar' : 'Teks'}
      </div>
      <div className="field-grid">
        {fields.map(([key, label, min, max]) => (
          <NumericField
            key={key}
            label={label}
            value={shared(key)}
            min={min}
            max={max}
            step={key === 'z_index' ? 1 : 0.1}
            change={(value) => patch({ [key]: value })}
          />
        ))}
        {items.some((item) => item.type !== 'image') && (
          <>
            <NumericField
              label="Ukuran font · pt"
              value={shared('font_size') ?? 10}
              min={4}
              max={72}
              change={(font_size) => patch({ font_size })}
            />
            <label className="field">
              Warna teks
              <input
                type="color"
                value={shared('color') ?? '#111827'}
                onChange={(event) => patch({ color: event.target.value })}
              />
            </label>
            <label className="field full">
              Font
              <select
                value={shared('font_family') ?? FONTS[0]}
                onChange={(event) =>
                  patch({ font_family: event.target.value as Item['font_family'] })
                }
              >
                {FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font.split(',')[0]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Highlight
              <input
                type="color"
                value={shared('bg_color') ?? '#ffffff'}
                onChange={(event) => patch({ bg_color: event.target.value })}
              />
            </label>
            <button onClick={() => patch({ bg_color: undefined })}>Hapus highlight</button>
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
