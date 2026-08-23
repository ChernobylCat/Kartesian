import { APP_CONFIG } from '../config.mjs';
import { normalizePropertyValue } from './property-panel.mjs';

export function getFormatToolbarPosition(elementRect, toolbarRect, {
    scrollLeft = 0,
    scrollTop = 0,
    margin = 10,
    viewportWidth,
    viewportHeight
} = {}) {
    const minimumLeft = scrollLeft + margin;
    const centeredLeft = elementRect.left + scrollLeft + (elementRect.width - toolbarRect.width) / 2;
    const maximumLeft = Number.isFinite(viewportWidth)
        ? Math.max(minimumLeft, scrollLeft + viewportWidth - toolbarRect.width - margin)
        : Number.POSITIVE_INFINITY;
    const minimumTop = scrollTop + margin;
    const elementBottom = Number.isFinite(elementRect.bottom)
        ? elementRect.bottom
        : elementRect.top + (Number(elementRect.height) || 0);
    const aboveTop = elementRect.top + scrollTop - toolbarRect.height - margin;
    const belowTop = elementBottom + scrollTop + margin;
    const maximumTop = Number.isFinite(viewportHeight)
        ? Math.max(minimumTop, scrollTop + viewportHeight - toolbarRect.height - margin)
        : Number.POSITIVE_INFINITY;
    const hasRoomAbove = aboveTop >= minimumTop;
    const hasRoomBelow = belowTop <= maximumTop;
    const top = hasRoomAbove
        ? aboveTop
        : hasRoomBelow
            ? belowTop
            : Math.min(maximumTop, Math.max(minimumTop, aboveTop));
    return {
        left: Math.min(maximumLeft, Math.max(minimumLeft, centeredLeft)),
        top
    };
}

export function getQuickPropertyValues(item, element) {
    const page = element?.closest('.print-page');
    const measuredWidth = page?.clientWidth
        ? (element.offsetWidth / page.clientWidth) * APP_CONFIG.PAPER_WIDTH_MM
        : Number(item.width) || 0;
    const measuredHeight = page?.clientHeight
        ? (element.offsetHeight / page.clientHeight) * APP_CONFIG.PAPER_HEIGHT_MM
        : Number(item.height) || 0;
    const round = value => Number.parseFloat(Number(value).toFixed(1));
    return {
        x: round(item.x),
        y: round(item.y),
        width: round(measuredWidth),
        height: round(measuredHeight),
        font_size: round(item.font_size ?? APP_CONFIG.DEFAULT_FONT_SIZE_PT),
        rotation: round(item.rotation ?? 0),
        z_index: Number.isInteger(item.z_index) ? item.z_index : 1,
        locked: item.locked === true
    };
}

export function createFormatToolbarController({
    documentRef = document,
    windowRef = window,
    getItem,
    showToast = () => {},
    setSelection = () => {},
    duplicateSelection = () => {},
    deleteSelection = () => {},
    beginFormat = () => {},
    previewFormat = () => false,
    flushFormat = () => false,
    endFormat = () => false
}) {
    let activeElement = null;
    let lifecycle = null;
    let propertiesExpanded = false;
    let positionFrame = null;

    function toolbar() {
        return documentRef.getElementById('textFormatToolbar');
    }

    function hide() {
        endFormat();
        if (positionFrame !== null) windowRef.cancelAnimationFrame(positionFrame);
        positionFrame = null;
        toolbar()?.classList.remove('show');
        activeElement = null;
    }

    function position() {
        const toolbarElement = toolbar();
        if (!toolbarElement || !activeElement?.element?.isConnected) return;
        const toolbarRect = toolbarElement.getBoundingClientRect();
        const nextPosition = getFormatToolbarPosition(
            activeElement.element.getBoundingClientRect(),
            toolbarRect,
            {
                margin: 18,
                viewportWidth: windowRef.innerWidth,
                viewportHeight: windowRef.innerHeight
            }
        );
        toolbarElement.style.left = `${nextPosition.left}px`;
        toolbarElement.style.top = `${nextPosition.top}px`;
    }

    function schedulePosition() {
        if (positionFrame !== null) return;
        positionFrame = windowRef.requestAnimationFrame(() => {
            positionFrame = null;
            position();
        });
    }

    function setPropertiesExpanded(expanded) {
        propertiesExpanded = Boolean(expanded);
        const controls = documentRef.getElementById('toolbarQuickProperties');
        const button = documentRef.getElementById('btnToggleQuickProperties');
        if (controls) controls.hidden = !propertiesExpanded;
        if (button) {
            button.classList.toggle('active', propertiesExpanded);
            button.setAttribute('aria-expanded', String(propertiesExpanded));
        }
        position();
    }

    function syncQuickProperties(item, element) {
        const values = getQuickPropertyValues(item, element);
        documentRef.querySelectorAll('[data-toolbar-property]').forEach(input => {
            input.value = String(values[input.dataset.toolbarProperty]);
        });
        const lockButton = documentRef.getElementById('btnToolbarLock');
        if (lockButton) {
            lockButton.classList.toggle('active', values.locked);
            lockButton.setAttribute('aria-pressed', String(values.locked));
            lockButton.querySelector('span').textContent = values.locked ? 'Unlock' : 'Lock';
        }
    }

    function show(element, dbIdx, pageIdx, itemIdx) {
        const toolbarElement = toolbar();
        const result = getItem(dbIdx, pageIdx, itemIdx);
        if (!toolbarElement || !result?.item || result.item.type === 'image') return;

        activeElement = { element, dbIdx, pageIdx, itemIdx };
        beginFormat([activeElement]);
        setSelection(activeElement);
        documentRef.querySelectorAll('.data-item.selected-item').forEach(node => {
            node.classList.remove('selected-item');
        });
        element.classList.add('selected-item');

        const item = result.item;
        documentRef.getElementById('btnBold')?.classList.toggle('active', item.bold !== false);
        documentRef.getElementById('btnItalic')?.classList.toggle('active', Boolean(item.italic));
        documentRef.getElementById('btnUnderline')?.classList.toggle('active', Boolean(item.underline));

        const fontSelect = documentRef.getElementById('toolbarFontFamily');
        if (fontSelect) fontSelect.value = item.font_family || 'Courier New, Courier, monospace';
        const textColor = documentRef.getElementById('textColorPicker');
        if (textColor) textColor.value = item.color || '#334155';
        const highlightColor = documentRef.getElementById('highlightColorPicker');
        if (highlightColor) highlightColor.value = item.bg_color || '#ffffff';
        syncQuickProperties(item, element);
        const quickProperties = documentRef.getElementById('toolbarQuickProperties');
        if (quickProperties) quickProperties.hidden = !propertiesExpanded;
        documentRef.getElementById('btnToggleQuickProperties')?.setAttribute('aria-expanded', String(propertiesExpanded));

        toolbarElement.classList.add('show');
        position();
    }

    function applyProperty(property, rawValue) {
        if (!activeElement) return;
        try {
            const value = normalizePropertyValue(property, rawValue);
            const selection = { ...activeElement };
            delete selection.element;
            previewFormat({ [property]: value }, { immediate: true });
            if (activeElement?.element?.isConnected) {
                show(activeElement.element, selection.dbIdx, selection.pageIdx, selection.itemIdx);
            } else hide();
        } catch (error) {
            showToast(error.message, 'error');
            if (activeElement) {
                const result = getItem(activeElement.dbIdx, activeElement.pageIdx, activeElement.itemIdx);
                if (result) syncQuickProperties(result.item, activeElement.element);
            }
        }
    }

    function previewProperty(property, rawValue) {
        if (!activeElement || rawValue === '') return;
        try {
            const value = normalizePropertyValue(property, rawValue);
            previewFormat({ [property]: value }, { immediate: false });
            schedulePosition();
        } catch {
            // Nilai parsial/tidak valid dibiarkan di input hingga change melakukan validasi final.
        }
    }

    function apply(property, value, { immediate = true } = {}) {
        if (!activeElement) return;
        const { dbIdx, pageIdx, itemIdx } = activeElement;
        previewFormat({ [property]: value }, { immediate });
        if (immediate && activeElement?.element?.isConnected) show(activeElement.element, dbIdx, pageIdx, itemIdx);
    }

    function toggle(property) {
        if (!activeElement) return;
        const result = getItem(activeElement.dbIdx, activeElement.pageIdx, activeElement.itemIdx);
        if (!result?.item) {
            hide();
            return;
        }
        const enabled = property === 'bold'
            ? result.item.bold !== false
            : Boolean(result.item[property]);
        apply(property, !enabled);
    }

    function applyColor(property, value) {
        if (!activeElement) return;
        const result = getItem(activeElement.dbIdx, activeElement.pageIdx, activeElement.itemIdx);
        if (!result?.item) {
            hide();
            return;
        }
        const currentValue = String(result.item[property] || '').toLowerCase();
        const nextValue = String(value || '').toLowerCase();
        if (currentValue === nextValue) return;
        apply(property, nextValue, { immediate: false });
    }

    function init() {
        lifecycle?.abort();
        lifecycle = new AbortController();
        const { signal } = lifecycle;

        toolbar()?.addEventListener('click', event => event.stopPropagation(), { signal });
        documentRef.getElementById('toolbarFontFamily')?.addEventListener('input', event => {
            apply('font_family', event.currentTarget.value, { immediate: false });
        }, { signal });
        documentRef.getElementById('toolbarFontFamily')?.addEventListener('change', event => {
            apply('font_family', event.currentTarget.value, { immediate: false });
            flushFormat();
        }, { signal });
        documentRef.getElementById('btnBold')?.addEventListener('click', () => toggle('bold'), { signal });
        documentRef.getElementById('btnItalic')?.addEventListener('click', () => toggle('italic'), { signal });
        documentRef.getElementById('btnUnderline')?.addEventListener('click', () => toggle('underline'), { signal });
        documentRef.getElementById('textColorPicker')?.addEventListener(
            'input', event => applyColor('color', event.currentTarget.value), { signal }
        );
        documentRef.getElementById('highlightColorPicker')?.addEventListener(
            'input', event => applyColor('bg_color', event.currentTarget.value), { signal }
        );
        documentRef.getElementById('textColorPicker')?.addEventListener('change', event => {
            applyColor('color', event.currentTarget.value);
            flushFormat();
        }, { signal });
        documentRef.getElementById('highlightColorPicker')?.addEventListener('change', event => {
            applyColor('bg_color', event.currentTarget.value);
            flushFormat();
        }, { signal });
        documentRef.getElementById('btnClearHighlight')?.addEventListener(
            'click', () => apply('bg_color', ''), { signal }
        );
        documentRef.getElementById('btnToggleQuickProperties')?.addEventListener(
            'click', () => setPropertiesExpanded(!propertiesExpanded), { signal }
        );
        documentRef.querySelectorAll('[data-toolbar-property]').forEach(input => {
            input.addEventListener('input', () => {
                previewProperty(input.dataset.toolbarProperty, input.value);
            }, { signal });
            input.addEventListener('change', () => applyProperty(input.dataset.toolbarProperty, input.value), { signal });
        });
        documentRef.getElementById('btnToolbarLock')?.addEventListener('click', () => {
            if (!activeElement) return;
            const result = getItem(activeElement.dbIdx, activeElement.pageIdx, activeElement.itemIdx);
            applyProperty('locked', !result?.item.locked);
        }, { signal });
        documentRef.getElementById('btnToolbarDuplicate')?.addEventListener('click', () => {
            if (!activeElement) return;
            duplicateSelection();
        }, { signal });
        documentRef.getElementById('btnToolbarDelete')?.addEventListener('click', async () => {
            if (!activeElement) return;
            const deleted = await deleteSelection();
            if (deleted) hide();
        }, { signal });
        documentRef.addEventListener('pointerdown', event => {
            if (!isVisible()) return;
            const item = event.target.closest('.print-item.data-item');
            const clickedOnText = item?.querySelector('.text-content');
            if (!clickedOnText && !event.target.closest('#textFormatToolbar')) hide();
        }, { signal });
        windowRef.addEventListener('resize', schedulePosition, { signal });
        windowRef.addEventListener('scroll', schedulePosition, { signal, passive: true });
    }

    function isVisible() {
        return toolbar()?.classList.contains('show') ?? false;
    }

    function destroy() {
        lifecycle?.abort();
        lifecycle = null;
        hide();
    }

    return { apply, applyProperty, destroy, flush: flushFormat, hide, init, isVisible, setPropertiesExpanded, show };
}
