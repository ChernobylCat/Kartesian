'use client';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { type DocumentEntry, type Item, type Page } from '@/domain/document/model';
import { useEditor, useEditorState, useCommand } from '../context';
import { useCanvasPointer } from '../hooks/useCanvasPointer';
import { usePageVisibility } from '../hooks/usePageVisibility';
import { position } from '@/domain/document/geometry';
import { itemGraphic } from '@/domain/document/graphics';
import {
  combCells,
  isTextItem,
  reactStyle,
  renderedFontSize,
  textStyle,
} from '@/domain/document/presentation';
import { measureText } from '@/infrastructure/export/measure-text';
import { paperLabel, paperOf } from '@/domain/document/paper';
import { overlayPageCount, overlaySource } from '@/infrastructure/pdf/pdf-runtime';
import { pageSlotKey } from '../page-slots';
import { fitBackgroundRect, type ImageSize } from '@/domain/document/background';
import type { PageGuides } from '@/domain/document/measurement';
import CanvasRulers, { type RulerHandle } from './CanvasRulers';
import { t as translateNow } from '@/i18n/core';
import { useT } from '@/i18n/react';

const handles = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const newText = () => ({ text: translateNow('item.newText'), font_size: 10 });
const noGuides: PageGuides = {};
const CanvasItem = memo(function CanvasItem({ item }: { item: Item }) {
  const t = useT();
  const { store } = useEditor();
  const command = useCommand();
  const selected = useEditorState((state) => state.selected.includes(item.id));
  const hidden = useEditorState((state) => state.hidden.includes(item.id));
  const asset = useEditorState((state) =>
    item.assetId ? state.workspace.assets[item.assetId]?.dataUrl : undefined,
  );
  const [editing, setEditing] = useState(false);
  const text = useRef<HTMLSpanElement>(null);
  const cancelling = useRef(false);
  useEffect(() => {
    if (editing && text.current) {
      text.current.focus();
      const range = document.createRange();
      range.selectNodeContents(text.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [editing]);
  function finish(cancel = false) {
    if (!editing) return;
    const value = text.current?.textContent ?? item.text;
    cancelling.current = true;
    setEditing(false);
    if (!cancel && value !== item.text)
      command({ type: 'patch', ids: [item.id], patch: { text: value } });
    if (cancel && text.current) text.current.textContent = item.text;
    requestAnimationFrame(() => {
      cancelling.current = false;
    });
  }
  const cells = combCells(item);
  const graphic = useMemo(() => itemGraphic(item), [item]);
  const textual = isTextItem(item);
  const style: CSSProperties = {
    left: `${item.x}mm`,
    top: `${item.y}mm`,
    width: item.width
      ? `var(--gesture-width,${item.width}mm)`
      : 'var(--gesture-width, max-content)',
    height: item.height ? `var(--gesture-height,${item.height}mm)` : 'var(--gesture-height, auto)',
    ...(textual ? reactStyle(textStyle(item, renderedFontSize(item, measureText))) : {}),
    zIndex: item.z_index ?? 1,
    ...(hidden ? { visibility: 'hidden' as const, pointerEvents: 'none' as const } : {}),
    transform: `translate(var(--gesture-x,0mm),var(--gesture-y,0mm)) rotate(${item.rotation ?? 0}deg)`,
  };
  return (
    <div
      className={`canvas-item data-item ${graphic ? 'graphic-item' : ''} ${selected ? 'selected selected-item' : ''} ${item.locked ? 'locked' : ''}`}
      style={style}
      data-item-id={item.id}
      tabIndex={0}
      role="group"
      aria-label={
        textual
          ? t('item.textLabel', { text: item.text.slice(0, 80) })
          : item.type === 'image'
            ? t('item.imageLabel')
            : t(`item.${item.type ?? 'text'}Label` as 'item.markLabel', { text: item.text })
      }
      onFocus={() => {
        if (!store.getState().selected.includes(item.id)) store.getState().select([item.id]);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (textual && !store.getState().readonly && !store.getState().error) setEditing(true);
      }}
    >
      {item.type === 'image' ? (
        <img src={asset} alt="" draggable={false} />
      ) : graphic ? (
        <div className="graphic" dangerouslySetInnerHTML={{ __html: graphic }} />
      ) : (
        <span
          ref={text}
          className={`text-content${cells && !editing ? ' comb' : ''}`}
          contentEditable={editing}
          suppressContentEditableWarning
          onBlur={() => {
            if (!cancelling.current) finish();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              finish();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              finish(true);
            }
          }}
        >
          {cells && !editing
            ? cells.map((cell, index) => (
                <span key={index} className="comb-cell">
                  {cell}
                </span>
              ))
            : item.text}
        </span>
      )}
      {selected &&
        !item.locked &&
        !editing &&
        handles.map((direction) => (
          <span
            key={direction}
            className={`resize-handle resize-${direction}`}
            data-resize={direction}
            aria-hidden="true"
          />
        ))}
    </div>
  );
});
type CanvasPageProps = {
  page: Page;
  docEntry: DocumentEntry;
  number: number;
  zoom: number;
  addImage: (documentId: string, pageId: string, pageNumber?: number) => void;
  context: (event: MouseEvent, id?: string) => void;
  guides: PageGuides;
  guideId: string;
  onGuidesChange: (pageId: string, guides: PageGuides) => void;
  crosshair: boolean;
  onCrosshairChange: (value: boolean) => void;
};
const CanvasPage = memo(function CanvasPage(props: CanvasPageProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const visible = usePageVisibility(wrapper);
  return (
    <div
      ref={wrapper}
      className="page-wrapper"
      data-page-id={props.page.id}
      style={
        {
          '--canvas-zoom': props.zoom,
          width: `calc(var(--paper-width) * ${props.zoom} + 26px)`,
          height: `calc(var(--paper-height) * ${props.zoom} + 96px)`,
        } as CSSProperties
      }
    >
      {visible ? (
        <CanvasPageContents {...props} />
      ) : (
        <div
          className="page-placeholder"
          style={{ width: '100%', height: `calc(var(--paper-height) * ${props.zoom} + 96px)` }}
        />
      )}
    </div>
  );
});
const CanvasPageContents = memo(function CanvasPageContents({
  page,
  docEntry,
  number,
  zoom,
  addImage,
  context,
  guides,
  guideId,
  onGuidesChange,
  crosshair,
  onCrosshairChange,
}: CanvasPageProps) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const ruler = useRef<RulerHandle>(null);
  const [background, setBackground] = useState<{ source: string; size: ImageSize } | null>(null);
  const { store } = useEditor();
  const command = useCommand();
  const settings = useEditorState((state) => state.workspace.settings);
  const paper = useEditorState((state) => paperOf(state.workspace.document));
  const pdfPages = useEditorState((state) => state.workspace.pdf.pages);
  const candidates = useEditorState((state) => state.workspace.pdf.candidates);
  const pointer = useCanvasPointer(page, root, {
    guides,
    onPreview: (bounds, point) => ruler.current?.preview(bounds, point),
    onEnd: () => ruler.current?.refresh(),
  });
  const source = overlaySource(settings.overlay, number, pdfPages);
  /** Adds a text item to this page; returns false when the command was rejected. */
  const addText = (x: number, y: number) =>
    command({
      type: 'add',
      documentId: docEntry.id,
      pageId: page.id,
      pageNumber: number,
      item: { ...newText(), x, y },
    });
  return (
    <>
      <div className="page-label">
        <span>{t('page.label', { title: docEntry.title, number })}</span>
        <div className="row">
          <button onClick={() => addText(20, 20)}>{t('page.addText')}</button>
          <button onClick={() => addImage(docEntry.id, page.id, number)}>
            {t('page.addImage')}
          </button>
        </div>
      </div>
      <CanvasRulers
        ref={ruler}
        page={page}
        guideId={guideId}
        number={number}
        zoom={zoom}
        root={root}
        guides={guides}
        onGuidesChange={onGuidesChange}
        crosshair={crosshair}
        onCrosshairChange={onCrosshairChange}
      >
        <div
          ref={root}
          className="canvas-page print-page"
          tabIndex={-1}
          style={{ transform: `scale(${zoom})` }}
          onPointerDown={(event) => {
            store.setState({ activePage: page.id });
            pointer.onPointerDown(event);
          }}
          onPointerMove={(event) => {
            if (!pointer.onPointerMove(event)) ruler.current?.track(event.clientX, event.clientY);
          }}
          onPointerLeave={() => ruler.current?.leave()}
          onPointerUp={(event) => {
            pointer.onPointerUp(event);
            const box = event.currentTarget.getBoundingClientRect();
            if (
              event.pointerType === 'touch' ||
              event.clientX < box.left ||
              event.clientX > box.right ||
              event.clientY < box.top ||
              event.clientY > box.bottom
            )
              ruler.current?.leave();
          }}
          onPointerCancel={() => {
            pointer.onPointerCancel();
            ruler.current?.leave();
          }}
          onLostPointerCapture={pointer.onLostPointerCapture}
          onContextMenu={(event) =>
            context(
              event,
              (event.target as HTMLElement).closest<HTMLElement>('[data-item-id]')?.dataset.itemId,
            )
          }
          onDoubleClick={(event) => {
            if ((event.target as HTMLElement).closest('[data-item-id]')) return;
            const point = position(
              event.clientX,
              event.clientY,
              event.currentTarget.getBoundingClientRect(),
              paper,
            );
            // Without this guard a rejected add would open the page's last existing
            // item for editing instead of the new one.
            if (!addText(point.x, point.y)) return;
            const created = store
              .getState()
              .workspace.document.documents.find((entry) => entry.id === docEntry.id)
              ?.pages[number - 1]?.items.at(-1);
            if (created) {
              store.getState().select([created.id]);
              requestAnimationFrame(() =>
                root.current
                  ?.querySelector(`[data-item-id="${created.id}"]`)
                  ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
              );
            }
          }}
        >
          {source && settings.overlayVisible && (
            <img
              className="canvas-overlay"
              src={source}
              alt=""
              style={{ opacity: settings.overlayOpacity / 100 }}
              onLoad={(event) =>
                setBackground({
                  source,
                  size: {
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  },
                })
              }
            />
          )}
          {!settings.hideCalibrationPreview &&
            ['tl', 'tr', 'bl', 'br'].map((corner) => (
              <span key={corner} className={`calibration-mark ${corner}`}>
                │ 10mm │
              </span>
            ))}
          {page.items.map((item) => (
            <CanvasItem key={item.id} item={item} />
          ))}
          {settings.overlayVisible &&
            settings.overlay === 'uploaded_pdf' &&
            background &&
            background.source === source &&
            candidates
              .filter((candidate) => candidate.pageNumber === number)
              .map((candidate) => fitBackgroundRect(candidate, background.size, paper))
              .map((candidate) => (
                <div
                  key={candidate.id}
                  className="field-suggestion"
                  style={{
                    left: `${candidate.x}mm`,
                    top: `${candidate.y}mm`,
                    width: `${candidate.width}mm`,
                    height: `${candidate.height}mm`,
                  }}
                >
                  <span>{candidate.label}</span>
                </div>
              ))}
          {pointer.marquee && (
            <div
              className={`marquee ${pointer.marquee.crossing ? 'crossing' : ''}`}
              style={{
                left: `${pointer.marquee.x}mm`,
                top: `${pointer.marquee.y}mm`,
                width: `${pointer.marquee.width}mm`,
                height: `${pointer.marquee.height}mm`,
              }}
            />
          )}
          {pointer.guides.x !== undefined && (
            <div className="snap-guide vertical" style={{ left: `${pointer.guides.x}mm` }} />
          )}
          {pointer.guides.y !== undefined && (
            <div className="snap-guide horizontal" style={{ top: `${pointer.guides.y}mm` }} />
          )}
        </div>
      </CanvasRulers>
    </>
  );
});
export default function CanvasWorkspace({
  zoom,
  addImage,
  context,
}: {
  zoom: number;
  addImage: (documentId: string, pageId: string, pageNumber?: number) => void;
  context: (event: MouseEvent, id?: string) => void;
}) {
  const t = useT();
  const docEntries = useEditorState((state) => state.workspace.document.documents);
  const paper = useEditorState((state) => paperOf(state.workspace.document));
  const grid = useEditorState((state) => state.grid);
  const overlay = useEditorState((state) => state.workspace.settings.overlay);
  const pdfCount = useEditorState((state) => state.workspace.pdf.pages.length);
  const backgroundPages = overlayPageCount(overlay, pdfCount);
  const pageCount = (entry: DocumentEntry) => Math.max(entry.pages.length, backgroundPages);
  const virtualPages = useRef(new Map<string, Page>());
  const [pageGuides, setPageGuides] = useState<Record<string, PageGuides>>({});
  const [crosshair, setCrosshair] = useState(true);
  const changeGuides = useCallback((pageId: string, guides: PageGuides) => {
    setPageGuides((current) => ({ ...current, [pageId]: guides }));
  }, []);
  const count = docEntries.reduce((sum, docEntry) => sum + pageCount(docEntry), 0);
  return (
    <div
      id="printContainer"
      className={`canvas-workspace${grid ? ' show-grid' : ''}`}
      tabIndex={-1}
      style={
        {
          '--paper-width': `${paper.width}mm`,
          '--paper-height': `${paper.height}mm`,
          '--grid-size': `${grid || 10}mm`,
        } as CSSProperties
      }
    >
      {!count && <div className="empty-state">{t('canvas.empty')}</div>}
      {docEntries.flatMap((docEntry) =>
        Array.from({ length: pageCount(docEntry) }, (_, index) => {
          let page = docEntry.pages[index];
          const key = pageSlotKey(docEntry.id, index);
          if (!page) {
            page = virtualPages.current.get(key);
            if (!page) {
              page = { id: key, page_number: index + 1, extra: {}, items: [] };
              virtualPages.current.set(key, page);
            }
          }
          return (
            <CanvasPage
              key={page.id}
              page={page}
              docEntry={docEntry}
              number={index + 1}
              zoom={zoom}
              addImage={addImage}
              context={context}
              guides={pageGuides[key] ?? noGuides}
              guideId={key}
              onGuidesChange={changeGuides}
              crosshair={crosshair}
              onCrosshairChange={setCrosshair}
            />
          );
        }),
      )}
      <div className="page-footer">
        {paperLabel(paper)} · {t('canvas.footer')}
      </div>
    </div>
  );
}
