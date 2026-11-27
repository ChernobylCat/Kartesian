'use client';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';
import type { Item, Page } from '@/domain/document/model';
import { clamp, dimensions, move, position, resize, snap } from '@/domain/document/geometry';
import type { Patch } from '@/domain/document/commands';
import { paperOf } from '@/domain/document/paper';
import {
  measurementBounds,
  type Bounds,
  type ItemSizes,
  type PageGuides,
  type Point,
} from '@/domain/document/measurement';
import { useCommand, useEditor } from '../context';
import { measureItem } from '../measure-items';

type Gesture = {
  pointerId: number;
  capture: HTMLElement;
  x: number;
  y: number;
  items: Item[];
  direction: string;
  initialSelection: string[];
  additive: boolean;
  toggle: boolean;
  moved: boolean;
  patches: Record<string, Patch>;
  elements: Map<string, HTMLElement>;
  sizes: ItemSizes;
  frame: number;
  latest: { x: number; y: number; shift: boolean; alt: boolean };
};
const previewKeys = ['--gesture-x', '--gesture-y', '--gesture-width', '--gesture-height'];
const SNAP_THRESHOLD_MM = 1.5;
/** Pointer travel (mm) before a press counts as a drag instead of a click. */
const DRAG_THRESHOLD_MM = 0.3;
/** Stops the frame loop and removes CSS preview variables owned by the gesture. */
function clearPreview(gesture: Gesture) {
  cancelAnimationFrame(gesture.frame);
  gesture.elements.forEach((element) =>
    previewKeys.forEach((key) => element.style.removeProperty(key)),
  );
}
export function useCanvasPointer(
  page: Page,
  root: RefObject<HTMLDivElement | null>,
  measurement: {
    guides?: PageGuides;
    onPreview?: (bounds: Bounds | null, point: Point) => void;
    onEnd?: () => void;
  } = {},
) {
  const { store } = useEditor();
  /** Current sheet size; read per gesture so a paper change applies immediately. */
  const paper = () => paperOf(store.getState().workspace.document);
  const command = useCommand();
  const gesture = useRef<Gesture | null>(null);
  const onEnd = useRef(measurement.onEnd);
  useLayoutEffect(() => {
    onEnd.current = measurement.onEnd;
  }, [measurement.onEnd]);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    crossing: boolean;
  } | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  function clean() {
    const current = gesture.current;
    if (!current) return;
    clearPreview(current);
    if (current.capture.hasPointerCapture(current.pointerId))
      current.capture.releasePointerCapture(current.pointerId);
    gesture.current = null;
    setMarquee(null);
    setGuides({});
    onEnd.current?.();
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const initial = gesture.current?.initialSelection;
        clean();
        if (initial) store.getState().select(initial);
      }
    };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      if (gesture.current) clearPreview(gesture.current);
      gesture.current = null;
    };
    // The gesture owns DOM preview variables, while React owns the committed styles.
  }, [store]);
  function paint() {
    const current = gesture.current;
    const element = root.current;
    if (!current || !element) return;
    const rect = element.getBoundingClientRect();
    const point = position(current.latest.x, current.latest.y, rect, paper());
    let dx = point.x - current.x,
      dy = point.y - current.y;
    current.moved ||= Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_MM;
    if (!current.moved) {
      measurement.onPreview?.(measurementBounds(current.items, current.sizes), point);
      return;
    }
    if (!current.items.length) {
      const box = {
        x: Math.min(current.x, point.x),
        y: Math.min(current.y, point.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
        crossing: dx < 0,
      };
      setMarquee(box);
      measurement.onPreview?.(box, point);
      return;
    }
    current.patches = {};
    if (current.direction) {
      const item = current.items[0]!;
      current.patches[item.id] = resize(
        item,
        paper(),
        current.direction,
        dx,
        dy,
        current.latest.shift,
        current.latest.alt,
        current.sizes.get(item.id),
      );
    } else {
      if (store.getState().workspace.settings.snap) {
        const ids = new Set(current.items.map((item) => item.id));
        const snapped = snap(
          current.items[0]!,
          paper(),
          dx,
          dy,
          page.items.filter((item) => !ids.has(item.id)),
          SNAP_THRESHOLD_MM,
          measurement.guides,
          current.sizes,
          store.getState().grid,
        );
        dx = snapped.dx;
        dy = snapped.dy;
        setGuides({ x: snapped.guideX, y: snapped.guideY });
      }
      const sheet = paper();
      dx = clamp(
        dx,
        Math.max(...current.items.map((item) => -item.x)),
        Math.min(
          ...current.items.map(
            (item) => sheet.width - item.x - (item.width ? dimensions(item).width : 0),
          ),
        ),
      );
      dy = clamp(
        dy,
        Math.max(...current.items.map((item) => -item.y)),
        Math.min(
          ...current.items.map(
            (item) => sheet.height - item.y - (item.height ? dimensions(item).height : 0),
          ),
        ),
      );
      current.items.forEach((item) => {
        current.patches[item.id] = move(item, dx, dy, sheet);
      });
    }
    measurement.onPreview?.(
      measurementBounds(
        current.items.map((item) => ({ ...item, ...current.patches[item.id] })),
        current.sizes,
      ),
      point,
    );
    current.items.forEach((item) => {
      const node = current.elements.get(item.id),
        patch = current.patches[item.id];
      if (!node || !patch) return;
      node.style.setProperty('--gesture-x', `${(patch.x ?? item.x) - item.x}mm`);
      node.style.setProperty('--gesture-y', `${(patch.y ?? item.y) - item.y}mm`);
      if (patch.width) node.style.setProperty('--gesture-width', `${patch.width}mm`);
      if (patch.height) node.style.setProperty('--gesture-height', `${patch.height}mm`);
    });
  }
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      gesture.current ||
      (event.target as HTMLElement).closest('button,[contenteditable="true"]')
    )
      return;
    const state = store.getState();
    if (state.readonly || state.frozen || state.error || !root.current) return;
    event.preventDefault();
    const rect = root.current.getBoundingClientRect();
    const point = position(event.clientX, event.clientY, rect, paper());
    const itemNode = (event.target as HTMLElement).closest<HTMLElement>('[data-item-id]');
    const item = page.items.find((item) => item.id === itemNode?.dataset.itemId);
    const direction =
      (event.target as HTMLElement).closest<HTMLElement>('[data-resize]')?.dataset.resize ?? '';
    const initialSelection = [...state.selected];
    // Pointer capture prevents native focus. Return keyboard control to the
    // paper/item after using the ruler, before applying modifier selection.
    (itemNode ?? root.current).focus({ preventScroll: true });
    let selected = initialSelection;
    if (item) {
      const modifier = event.ctrlKey || event.metaKey || event.shiftKey;
      if (modifier && selected.includes(item.id)) {
        // Deselecting one member of a group deselects the whole group.
        const group = page.items
          .filter(
            (entry) => entry.id === item.id || (item.group_id && entry.group_id === item.group_id),
          )
          .map((entry) => entry.id);
        selected = selected.filter((id) => !group.includes(id));
      } else if (!selected.includes(item.id))
        selected = modifier ? [...selected, item.id] : [item.id];
      state.select(selected);
      // Selection expands to whole groups, so the gesture moves every member.
      selected = store.getState().selected;
    } else if (!event.shiftKey && !event.ctrlKey && !event.metaKey) state.select([]);
    const items = item
      ? page.items.filter(
          (entry) =>
            selected.includes(entry.id) && !entry.locked && (!direction || entry.id === item.id),
        )
      : [];
    if (item && !items.length) return;
    const elements = new Map<string, HTMLElement>();
    root.current
      .querySelectorAll<HTMLElement>('[data-item-id]')
      .forEach((node) => elements.set(node.dataset.itemId!, node));
    const capture = itemNode ?? root.current;
    const sizes: ItemSizes = new Map();
    for (const entry of page.items) {
      const node = elements.get(entry.id);
      if (!node) continue;
      sizes.set(entry.id, measureItem(node));
    }
    gesture.current = {
      pointerId: event.pointerId,
      capture,
      ...point,
      items,
      direction,
      initialSelection,
      additive: event.shiftKey,
      toggle: event.ctrlKey || event.metaKey,
      moved: false,
      patches: {},
      elements,
      sizes,
      frame: 0,
      latest: { x: event.clientX, y: event.clientY, shift: event.shiftKey, alt: event.altKey },
    };
    capture.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return false;
    current.latest = {
      x: event.clientX,
      y: event.clientY,
      shift: event.shiftKey,
      alt: event.altKey,
    };
    cancelAnimationFrame(current.frame);
    current.frame = requestAnimationFrame(paint);
    return true;
  }
  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || !root.current) return;
    cancelAnimationFrame(current.frame);
    current.latest = {
      x: event.clientX,
      y: event.clientY,
      shift: event.shiftKey,
      alt: event.altKey,
    };
    paint();
    if (current.moved && current.items.length)
      flushSync(() => command({ type: 'patchMany', patches: current.patches }));
    if (current.moved && !current.items.length) {
      const rect = root.current.getBoundingClientRect();
      const point = position(event.clientX, event.clientY, rect, paper());
      const left = Math.min(point.x, current.x),
        top = Math.min(point.y, current.y),
        right = Math.max(point.x, current.x),
        bottom = Math.max(point.y, current.y);
      const hit = page.items
        .filter((item) => {
          const node = current.elements.get(item.id);
          if (!node) return false;
          const bounds = node.getBoundingClientRect();
          const a = position(bounds.left, bounds.top, rect, paper()),
            b = position(bounds.right, bounds.bottom, rect, paper());
          return point.x < current.x
            ? b.x >= left && a.x <= right && b.y >= top && a.y <= bottom
            : a.x >= left && b.x <= right && a.y >= top && b.y <= bottom;
        })
        .map((item) => item.id);
      const selected = current.toggle
        ? [
            ...current.initialSelection.filter((id) => !hit.includes(id)),
            ...hit.filter((id) => !current.initialSelection.includes(id)),
          ]
        : current.additive
          ? [...new Set([...current.initialSelection, ...hit])]
          : hit;
      store.getState().select(selected);
    }
    clean();
  }
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: clean,
    onLostPointerCapture: clean,
    marquee,
    guides,
  };
}
