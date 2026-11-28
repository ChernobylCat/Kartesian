'use client';
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { locate, type Item } from '@/domain/document/model';
import { isTextItem } from '@/domain/document/presentation';
import { useCommand, useEditor, useEditorState } from '../context';
import { useT } from '@/i18n/react';

const Z_MIN = -1000;
const Z_MAX = 1000;

/**
 * Items of one page from front to back. Items with the same layer value are drawn in
 * document order, so later items come first here.
 */
export function layerOrder(items: Item[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (b.item.z_index ?? 1) - (a.item.z_index ?? 1) || b.index - a.index)
    .map(({ item }) => item);
}

/** Lists the elements of the active page to select, hide, lock and reorder them. */
export default function LayersPanel() {
  const t = useT();
  const { store } = useEditor();
  const command = useCommand();
  const document = useEditorState((state) => state.workspace.document);
  const selected = useEditorState((state) => state.selected);
  const activePage = useEditorState((state) => state.activePage);
  const hidden = useEditorState((state) => state.hidden);
  const readonly = useEditorState((state) => state.readonly || !!state.error);
  const page =
    (selected[0] && locate(document, selected[0])?.page) ||
    document.documents.flatMap((entry) => entry.pages).find((entry) => entry.id === activePage);
  const items = page ? layerOrder(page.items) : [];

  const label = (item: Item) => {
    if (isTextItem(item)) return item.text.trim().slice(0, 40) || t('layers.emptyText');
    if (item.type === 'image') return t('item.imageLabel');
    return `${t(`graphic.kind.${item.type!}` as 'graphic.kind.mark')}${
      item.type === 'barcode' || item.type === 'qr' ? ` · ${item.text.slice(0, 24)}` : ''
    }`;
  };
  /** Moves an item one step towards the front (-1) or back (+1) of the list. */
  function move(index: number, step: -1 | 1) {
    const item = items[index]!;
    const neighbour = items[index + step];
    if (!neighbour) return;
    const mine = item.z_index ?? 1;
    const theirs = neighbour.z_index ?? 1;
    const clamp = (value: number) => Math.max(Z_MIN, Math.min(Z_MAX, value));
    const patches =
      mine === theirs
        ? { [item.id]: { z_index: clamp(step === -1 ? theirs + 1 : theirs - 1) } }
        : { [item.id]: { z_index: theirs }, [neighbour.id]: { z_index: mine } };
    command({ type: 'patchMany', patches });
  }

  return (
    <section className="sidebar-section" data-tour="layers">
      <details>
        <summary>{t('layers.title', { count: items.length })}</summary>
        {!items.length ? (
          <p className="settings-note">{t('layers.empty')}</p>
        ) : (
          <ul className="layer-list" aria-label={t('layers.title', { count: items.length })}>
            {items.map((item, index) => {
              const isSelected = selected.includes(item.id);
              const isHidden = hidden.includes(item.id);
              return (
                <li key={item.id} className={isSelected ? 'selected' : undefined}>
                  <button
                    className="layer-name"
                    aria-pressed={isSelected}
                    onClick={(event) => {
                      const state = store.getState();
                      const toggle = event.shiftKey || event.ctrlKey || event.metaKey;
                      state.select(
                        toggle
                          ? isSelected
                            ? state.selected.filter((id) => id !== item.id)
                            : [...state.selected, item.id]
                          : [item.id],
                      );
                    }}
                  >
                    {item.group_id && <span className="layer-group" aria-hidden="true" />}
                    {label(item)}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={isHidden ? t('layers.show') : t('layers.hide')}
                    aria-pressed={isHidden}
                    onClick={() =>
                      store.setState({
                        hidden: isHidden
                          ? store.getState().hidden.filter((id) => id !== item.id)
                          : [...store.getState().hidden, item.id],
                      })
                    }
                  >
                    {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button
                    className="icon-button"
                    disabled={readonly}
                    aria-label={item.locked ? t('format.unlock') : t('format.lock')}
                    aria-pressed={!!item.locked}
                    onClick={() =>
                      command({ type: 'patch', ids: [item.id], patch: { locked: !item.locked } })
                    }
                  >
                    {item.locked ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                  <button
                    className="icon-button"
                    disabled={readonly || index === 0}
                    aria-label={t('layers.forward')}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={readonly || index === items.length - 1}
                    aria-label={t('layers.backward')}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="settings-note">{t('layers.note')}</p>
      </details>
    </section>
  );
}
