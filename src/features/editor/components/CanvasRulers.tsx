'use client';
import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Crosshair, Eraser } from 'lucide-react';
import type { Page } from '@/domain/document/model';
import { clamp, position, round } from '@/domain/document/geometry';
import { paperOf } from '@/domain/document/paper';
import {
  unionBounds,
  type Bounds,
  type PageGuides,
  type Point,
} from '@/domain/document/measurement';
import { useEditor, useEditorState } from '../context';
import { rulerTicks } from './ruler-ticks';
import { formatFixed } from '@/i18n/core';
import { toUnit, UNIT_DECIMALS, type Unit } from '@/domain/document/units';
import { useLocale, useT } from '@/i18n/react';

export type RulerHandle = {
  track: (x: number, y: number) => void;
  leave: () => void;
  preview: (bounds: Bounds | null, point: Point) => void;
  refresh: () => void;
};
/** One decimal in the active language, e.g. "20,0" or "20.0". */
/** One decimal in mm (three in inches) in the active language, e.g. "20,0" or "20.0". */
const formatIn = (mm: number, unit: Unit) => formatFixed(toUnit(mm, unit), UNIT_DECIMALS[unit]);

const Scale = memo(function Scale({
  axis,
  length,
  zoom,
  unit,
}: {
  axis: 'x' | 'y';
  length: number;
  zoom: number;
  unit: Unit;
}) {
  const { scale, ticks, labels, labelText } = rulerTicks(length, zoom, unit);
  const horizontal = axis === 'x';
  return (
    <svg
      className="ruler-scale"
      aria-hidden="true"
      preserveAspectRatio="none"
      viewBox={horizontal ? `0 0 ${length * scale} 26` : `0 0 26 ${length * scale}`}
    >
      <path
        d={ticks
          .map((tick) =>
            horizontal
              ? `M${tick.position},26v-${tick.size}`
              : `M26,${tick.position}h-${tick.size}`,
          )
          .join(' ')}
      />
      {labels.map((value) => (
        <text
          key={value}
          x={horizontal ? value * scale + (value === 0 ? 3 : value === length ? -3 : 0) : 10}
          y={horizontal ? 12 : value * scale + (value === 0 ? 4 : value === length ? -4 : 0)}
          textAnchor={
            value === 0
              ? horizontal
                ? 'start'
                : 'end'
              : value === length
                ? horizontal
                  ? 'end'
                  : 'start'
                : 'middle'
          }
          transform={
            horizontal
              ? undefined
              : `rotate(-90 10 ${value * scale + (value === 0 ? 4 : value === length ? -4 : 0)})`
          }
        >
          {labelText(value)}
        </text>
      ))}
    </svg>
  );
});

const CanvasRulers = forwardRef<
  RulerHandle,
  {
    page: Page;
    guideId: string;
    number: number;
    zoom: number;
    root: RefObject<HTMLDivElement | null>;
    guides: PageGuides;
    onGuidesChange: (pageId: string, guides: PageGuides) => void;
    crosshair: boolean;
    onCrosshairChange: (value: boolean) => void;
    children: ReactNode;
  }
>(function CanvasRulers(
  {
    page,
    guideId,
    number,
    zoom,
    root,
    guides,
    onGuidesChange,
    crosshair,
    onCrosshairChange,
    children,
  },
  ref,
) {
  const frame = useRef<HTMLDivElement>(null);
  const pointerValue = useRef<HTMLOutputElement>(null);
  const sizeValue = useRef<HTMLOutputElement>(null);
  const cursorLabel = useRef<HTMLSpanElement>(null);
  const cursorSize = useRef<HTMLSpanElement>(null);
  const animation = useRef(0);
  const dragging = useRef(false);
  const t = useT();
  const locale = useLocale();
  const selected = useEditorState((state) => state.selected);
  const paper = useEditorState((state) => paperOf(state.workspace.document));
  const unit = useEditorState((state) => state.unit);
  const format = (mm: number) => formatIn(mm, unit);
  const { store } = useEditor();

  function paintCursor(point: Point | null) {
    const element = frame.current;
    if (!element || !pointerValue.current) return;
    element.dataset.cursor = point ? 'on' : 'off';
    if (point) {
      const x = round(clamp(point.x, 0, paper.width)),
        y = round(clamp(point.y, 0, paper.height));
      element.style.setProperty('--ruler-x', `${(x / paper.width) * 100}%`);
      element.style.setProperty('--ruler-y', `${(y / paper.height) * 100}%`);
      pointerValue.current.textContent = `X ${format(x)} · Y ${format(y)} ${unit}`;
      pointerValue.current.dataset.x = String(x);
      pointerValue.current.dataset.y = String(y);
      if (cursorLabel.current)
        cursorLabel.current.textContent = `X ${format(x)} · Y ${format(y)} ${unit}`;
      const pixelsPerMm = (96 / 25.4) * zoom;
      const paperWidth = paper.width * pixelsPerMm,
        paperHeight = paper.height * pixelsPerMm;
      const selectedText =
        element.dataset.selection === 'on' ? (cursorSize.current?.textContent ?? '') : '';
      const labelWidth =
        Math.max(pointerValue.current.textContent.length, selectedText.length) * 6.2 + 18;
      const labelHeight = selectedText ? 44 : 29;
      const left =
        x * pixelsPerMm + 12 + labelWidth > paperWidth - 8
          ? x * pixelsPerMm - labelWidth - 12
          : x * pixelsPerMm + 12;
      const top =
        y * pixelsPerMm + 12 + labelHeight > paperHeight - 8
          ? y * pixelsPerMm - labelHeight - 12
          : y * pixelsPerMm + 12;
      element.style.setProperty(
        '--ruler-label-left',
        `${clamp(left, 8, Math.max(8, paperWidth - labelWidth - 8))}px`,
      );
      element.style.setProperty(
        '--ruler-label-top',
        `${clamp(top, 8, paperHeight - labelHeight - 8)}px`,
      );
    } else {
      pointerValue.current.textContent = 'X — · Y — mm';
      delete pointerValue.current.dataset.x;
      delete pointerValue.current.dataset.y;
    }
  }
  function paintSelection(bounds: Bounds | null) {
    const element = frame.current;
    if (!element || !sizeValue.current) return;
    element.dataset.selection = bounds ? 'on' : 'off';
    if (bounds) {
      const left = clamp(bounds.x, 0, paper.width),
        top = clamp(bounds.y, 0, paper.height);
      element.style.setProperty('--selection-x', `${(left / paper.width) * 100}%`);
      element.style.setProperty('--selection-y', `${(top / paper.height) * 100}%`);
      element.style.setProperty(
        '--selection-width',
        `${(Math.max(0, clamp(bounds.x + bounds.width, 0, paper.width) - left) / paper.width) * 100}%`,
      );
      element.style.setProperty(
        '--selection-height',
        `${(Math.max(0, clamp(bounds.y + bounds.height, 0, paper.height) - top) / paper.height) * 100}%`,
      );
      sizeValue.current.textContent = `${format(bounds.width)} × ${format(bounds.height)} ${unit}`;
      if (cursorSize.current)
        cursorSize.current.textContent = t('ruler.selectionSize', {
          unit,
          width: format(bounds.width),
          height: format(bounds.height),
        });
      sizeValue.current.title = t('ruler.selectionBounds', {
        unit,
        x: format(bounds.x),
        y: format(bounds.y),
      });
      sizeValue.current.dataset.x = String(bounds.x);
      sizeValue.current.dataset.y = String(bounds.y);
      sizeValue.current.dataset.width = String(bounds.width);
      sizeValue.current.dataset.height = String(bounds.height);
    } else {
      sizeValue.current.textContent = t('ruler.selectPrompt');
      sizeValue.current.title = t('ruler.selectHint');
      for (const key of ['x', 'y', 'width', 'height']) delete sizeValue.current.dataset[key];
    }
  }
  function refresh() {
    dragging.current = false;
    if (!root.current) return;
    const sheet = root.current.getBoundingClientRect();
    const boxes: Bounds[] = [];
    root.current.querySelectorAll<HTMLElement>('[data-item-id]').forEach((node) => {
      if (!selected.includes(node.dataset.itemId!)) return;
      const box = node.getBoundingClientRect();
      boxes.push({
        x: ((box.left - sheet.left) / sheet.width) * paper.width,
        y: ((box.top - sheet.top) / sheet.height) * paper.height,
        width: (box.width / sheet.width) * paper.width,
        height: (box.height / sheet.height) * paper.height,
      });
    });
    paintSelection(unionBounds(boxes));
  }
  useImperativeHandle(ref, () => ({
    track(x, y) {
      cancelAnimationFrame(animation.current);
      animation.current = requestAnimationFrame(() => {
        if (root.current) paintCursor(position(x, y, root.current.getBoundingClientRect(), paper));
      });
    },
    leave() {
      cancelAnimationFrame(animation.current);
      paintCursor(null);
    },
    preview(bounds, point) {
      dragging.current = true;
      cancelAnimationFrame(animation.current);
      paintSelection(bounds);
      paintCursor(point);
    },
    refresh,
  }));
  useLayoutEffect(() => {
    refresh();
    const observer = new ResizeObserver(() => {
      if (!dragging.current) refresh();
    });
    root.current?.querySelectorAll<HTMLElement>('[data-item-id]').forEach((node) => {
      if (selected.includes(node.dataset.itemId!)) observer.observe(node);
    });
    let active = true;
    void document.fonts.ready.then(() => {
      if (active && !dragging.current) refresh();
    });
    return () => {
      active = false;
      observer.disconnect();
    };
    // Measurements follow committed items, selected nodes, zoom and loaded fonts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.items, selected, zoom, root, paper, locale, unit]);
  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  function setGuide(axis: 'x' | 'y', value: number | undefined) {
    onGuidesChange(guideId, {
      ...guides,
      [axis]:
        value === undefined
          ? undefined
          : round(clamp(value, 0, axis === 'x' ? paper.width : paper.height)),
    });
  }
  function pointerGuide(event: PointerEvent<HTMLDivElement>, axis: 'x' | 'y') {
    const box = event.currentTarget.getBoundingClientRect();
    setGuide(
      axis,
      axis === 'x'
        ? ((event.clientX - box.left) / box.width) * paper.width
        : ((event.clientY - box.top) / box.height) * paper.height,
    );
  }
  function keyboardGuide(event: KeyboardEvent<HTMLDivElement>, axis: 'x' | 'y') {
    const maximum = axis === 'x' ? paper.width : paper.height;
    const value = guides[axis] ?? maximum / 2;
    const step = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    const delta = ['ArrowRight', 'ArrowDown'].includes(event.key)
      ? step
      : ['ArrowLeft', 'ArrowUp'].includes(event.key)
        ? -step
        : 0;
    if (
      delta ||
      ['Home', 'End', 'Delete', 'Backspace', 'Escape', 'Enter', ' '].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      setGuide(
        axis,
        ['Delete', 'Backspace', 'Escape'].includes(event.key)
          ? undefined
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? maximum
              : value + delta,
      );
    }
  }
  return (
    <>
      <div
        ref={frame}
        className="canvas-frame"
        data-cursor="off"
        data-selection="off"
        data-crosshair={crosshair}
      >
        <div className="ruler-origin" title={t('ruler.unit', { unit: t(`unit.${unit}`) })}>
          {unit}
        </div>
        {(['x', 'y'] as const).map((axis) => (
          <div
            key={axis}
            className={`page-ruler ruler-${axis}`}
            role="slider"
            tabIndex={0}
            onFocus={() => store.setState({ activePage: page.id })}
            aria-label={t(axis === 'x' ? 'ruler.guideVertical' : 'ruler.guideHorizontal', {
              number,
            })}
            aria-orientation={axis === 'x' ? 'horizontal' : 'vertical'}
            aria-valuemin={0}
            aria-valuemax={axis === 'x' ? paper.width : paper.height}
            aria-valuenow={guides[axis] ?? (axis === 'x' ? paper.width : paper.height) / 2}
            aria-valuetext={t(axis === 'x' ? 'ruler.fromLeft' : 'ruler.fromTop', {
              unit,
              value: format(guides[axis] ?? (axis === 'x' ? paper.width : paper.height) / 2),
            })}
            title={t('ruler.guideHelp')}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              pointerGuide(event, axis);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) pointerGuide(event, axis);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onDoubleClick={() => setGuide(axis, undefined)}
            onKeyDown={(event) => keyboardGuide(event, axis)}
          >
            <Scale
              axis={axis}
              length={axis === 'x' ? paper.width : paper.height}
              zoom={zoom}
              unit={unit}
            />
            <span className="ruler-selection-range" aria-hidden="true" />
            <span className="ruler-cursor-marker" aria-hidden="true" />
            {guides[axis] !== undefined && (
              <span
                className="ruler-pin-marker"
                aria-hidden="true"
                style={
                  axis === 'x'
                    ? { left: `${(guides.x! / paper.width) * 100}%` }
                    : { top: `${(guides.y! / paper.height) * 100}%` }
                }
              />
            )}
          </div>
        ))}
        <div className="canvas-sheet-offset">
          {children}
          <div className="ruler-paper-overlay" aria-hidden="true">
            <span className="ruler-crosshair ruler-crosshair-x" />
            <span className="ruler-crosshair ruler-crosshair-y" />
            <div className="ruler-cursor-label">
              <span ref={cursorLabel} />
              <span ref={cursorSize} className="ruler-cursor-size" />
            </div>
            {guides.x !== undefined && (
              <span
                className="ruler-pin-line ruler-pin-x"
                style={{ left: `${(guides.x / paper.width) * 100}%` }}
              />
            )}
            {guides.y !== undefined && (
              <span
                className="ruler-pin-line ruler-pin-y"
                style={{ top: `${(guides.y / paper.height) * 100}%` }}
              />
            )}
          </div>
        </div>
      </div>
      <div className="canvas-measurements">
        <output
          ref={pointerValue}
          className="ruler-position"
          aria-label={t('ruler.cursorPosition', { number })}
          aria-live="off"
        >
          X — · Y — mm
        </output>
        <output
          ref={sizeValue}
          className="ruler-size"
          aria-label={t('ruler.selectionLabel', { number })}
          aria-live="off"
        >
          {t('ruler.selectPrompt')}
        </output>
        <div className="ruler-actions">
          <button
            type="button"
            aria-label={t('ruler.crosshair', { number })}
            aria-pressed={crosshair}
            title={t('ruler.crosshairHint')}
            onClick={() => onCrosshairChange(!crosshair)}
          >
            <Crosshair size={13} />
          </button>
          <button
            type="button"
            aria-label={t('ruler.clearGuides', { number })}
            title={t('ruler.clearGuidesHint')}
            disabled={guides.x === undefined && guides.y === undefined}
            onClick={() => onGuidesChange(guideId, {})}
          >
            <Eraser size={13} />
          </button>
        </div>
      </div>
    </>
  );
});
export default CanvasRulers;
