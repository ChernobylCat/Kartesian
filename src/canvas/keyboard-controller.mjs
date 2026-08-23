import { APP_CONFIG } from '../config.mjs';
import { pxToMmX, pxToMmY } from './interactions.mjs';

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const ALIGNMENT_SHORTCUTS = new Map([
    ['a', 'left'],
    ['h', 'hcenter'],
    ['d', 'right'],
    ['w', 'top'],
    ['v', 'vcenter'],
    ['s', 'bottom']
]);

export function getAlignmentShortcut(event) {
    if (!event.altKey || event.ctrlKey || event.metaKey) return null;
    const key = event.key.toLowerCase();
    if (event.shiftKey) {
        if (key === 'h') return 'distribute-h';
        if (key === 'v') return 'distribute-v';
        return null;
    }
    return ALIGNMENT_SHORTCUTS.get(key) || null;
}

export function calculateNudgedPosition({
    x,
    y,
    width,
    height,
    key,
    step = 0.1,
    paperWidth = APP_CONFIG.PAPER_WIDTH_MM,
    paperHeight = APP_CONFIG.PAPER_HEIGHT_MM
}) {
    const maxX = Math.max(0, paperWidth - width);
    const maxY = Math.max(0, paperHeight - height);
    let nextX = Number(x);
    let nextY = Number(y);

    if (key === 'ArrowUp') nextY = Math.max(0, nextY - step);
    if (key === 'ArrowDown') nextY = Math.min(maxY, nextY + step);
    if (key === 'ArrowLeft') nextX = Math.max(0, nextX - step);
    if (key === 'ArrowRight') nextX = Math.min(maxX, nextX + step);

    return {
        x: Number.parseFloat(nextX.toFixed(1)),
        y: Number.parseFloat(nextY.toFixed(1))
    };
}

export function isEditableTarget(element) {
    if (!element) return false;
    return element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA' ||
        element.contentEditable === 'true' ||
        Boolean(element.closest?.('#jsonInputEditor'));
}

export function createCanvasKeyboardController({
    windowRef = window,
    documentRef = document,
    navigatorRef = navigator,
    undo = () => {},
    redo = () => {},
    getSelection = () => null,
    clearSelection = () => {},
    getItem,
    pushUndo,
    updateData,
    save = () => {},
    deleteSelection = () => {},
    duplicateSelection = () => {},
    selectAll = () => {},
    toggleLock = () => {},
    alignSelection = () => {},
    showFormatToolbar = () => {},
    isFormatToolbarVisible = () => false
}) {
    let lifecycle = null;

    function handleKeyDown(event) {
        const isMac = navigatorRef.platform?.toUpperCase().includes('MAC');
        const isCommand = isMac ? event.metaKey : event.ctrlKey;

        if (isCommand && !event.altKey) {
            if (event.key.toLowerCase() === 'z') {
                event.preventDefault();
                if (event.shiftKey) redo();
                else undo();
                return;
            }
            if (event.key.toLowerCase() === 'y') {
                event.preventDefault();
                redo();
                return;
            }
            if (!isEditableTarget(documentRef.activeElement) && event.key.toLowerCase() === 'a') {
                event.preventDefault(); selectAll(); return;
            }
            if (!isEditableTarget(documentRef.activeElement) && event.key.toLowerCase() === 'd') {
                event.preventDefault(); duplicateSelection(); return;
            }
        }

        if (event.altKey && !event.ctrlKey && !event.metaKey && !isEditableTarget(documentRef.activeElement) && event.key.toLowerCase() === 'l') {
            event.preventDefault(); toggleLock(); return;
        }

        if (isEditableTarget(documentRef.activeElement)) return;
        const alignmentAction = getAlignmentShortcut(event);
        if (alignmentAction) {
            event.preventDefault();
            const selections = Array.isArray(getSelection()) ? getSelection() : [getSelection()].filter(Boolean);
            if (selections.length < 2) return;
            alignSelection(selections.map(selection => {
                const pageElement = selection.element.closest('.print-page');
                return {
                    ...selection,
                    width: pxToMmX(selection.element.offsetWidth, pageElement),
                    height: pxToMmY(selection.element.offsetHeight, pageElement)
                };
            }), alignmentAction);
            return;
        }
        if (event.key === 'Escape') { clearSelection(); return; }
        if (event.key === 'Delete' || event.key === 'Backspace') {
            if ((getSelection() || []).length) { event.preventDefault(); deleteSelection(); }
            return;
        }

        const selected = Array.isArray(getSelection()) ? getSelection() : [getSelection()].filter(Boolean);
        if (!selected.length || !ARROW_KEYS.has(event.key)) return;
        event.preventDefault();

        if (selected.some(selection => !selection.element.isConnected)) {
            clearSelection();
            return;
        }

        let sharedData = null;
        let changed = false;
        selected.forEach(({ element, dbIdx, pageIdx, itemIdx }) => {
            const result = getItem(dbIdx, pageIdx, itemIdx);
            const pageElement = element.closest('.print-page');
            if (!result || !pageElement || result.item.locked) return;
            sharedData ||= result.data;
            const previousX = Number(result.item.x);
            const previousY = Number(result.item.y);
            const next = calculateNudgedPosition({
                x: previousX, y: previousY,
                width: pxToMmX(element.offsetWidth, pageElement),
                height: pxToMmY(element.offsetHeight, pageElement),
                key: event.key, step: event.shiftKey ? 1 : 0.1
            });
            if (next.x === previousX && next.y === previousY) return;
            result.item.x = next.x; result.item.y = next.y;
            element.style.left = `${next.x}mm`; element.style.top = `${next.y}mm`;
            changed = true;
        });
        if (!changed) return;
        pushUndo();
        updateData(sharedData, { silent: true, rerender: false });
        save();

        if (selected.length === 1 && isFormatToolbarVisible()) {
            const { element, dbIdx, pageIdx, itemIdx } = selected[0];
            showFormatToolbar(element, dbIdx, pageIdx, itemIdx);
        }
    }

    function init() {
        lifecycle?.abort();
        lifecycle = new AbortController();
        windowRef.addEventListener('keydown', handleKeyDown, { signal: lifecycle.signal });
    }

    function destroy() {
        lifecycle?.abort();
        lifecycle = null;
    }

    return { destroy, init };
}
