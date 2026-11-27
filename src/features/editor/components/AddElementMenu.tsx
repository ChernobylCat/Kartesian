'use client';
import { useEffect, useRef, useState } from 'react';
import { Shapes } from 'lucide-react';
import type { AddTarget } from '@/domain/document/commands';
import { uid, type Item } from '@/domain/document/model';
import type { MessageKey } from '@/i18n/core';
import { useT } from '@/i18n/react';
import { useCommand, useEditor } from '../context';

type Preset = Omit<Item, 'id' | 'x' | 'y'>;

/** Ready-made graphic elements, sized for typical form use. */
export const ELEMENT_PRESETS: [MessageKey, Preset][] = [
  ['element.check', { type: 'mark', text: 'check', width: 5, height: 5 }],
  ['element.cross', { type: 'mark', text: 'cross', width: 5, height: 5 }],
  ['element.dot', { type: 'mark', text: 'dot', width: 4, height: 4 }],
  ['element.horizontalLine', { type: 'line', text: 'horizontal', width: 50, height: 2 }],
  ['element.verticalLine', { type: 'line', text: 'vertical', width: 2, height: 30 }],
  ['element.strike', { type: 'line', text: 'diagonal', width: 40, height: 8, stroke_width: 0.4 }],
  ['element.cover', { type: 'rect', text: '', width: 40, height: 8 }],
  [
    'element.barcode',
    { type: 'barcode', text: '123456789012', width: 50, height: 15, barcode_format: 'code128' },
  ],
  ['element.qr', { type: 'qr', text: 'https://example.com', width: 20, height: 20 }],
];

/** "Element" button with a menu of marks, lines, cover boxes and codes. */
export default function AddElementMenu({
  target,
  disabled,
}: {
  target: () => AddTarget;
  disabled: boolean;
}) {
  const t = useT();
  const command = useCommand();
  const { store } = useEditor();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !root.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="menu-anchor" ref={root}>
      <button
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Shapes size={14} />
        {t('element.menu')}
      </button>
      {open && (
        <div role="menu" className="element-menu">
          {ELEMENT_PRESETS.map(([label, preset]) => (
            <button
              key={label}
              role="menuitem"
              onClick={() => {
                // A new element is selected right away so its properties can be edited.
                const item = { ...preset, id: uid(), x: 20, y: 20 } as Item;
                if (command({ type: 'addMany', ...target(), items: [item] }))
                  store.getState().select([item.id]);
                setOpen(false);
              }}
            >
              {t(label)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
