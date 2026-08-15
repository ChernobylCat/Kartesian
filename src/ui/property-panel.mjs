import { APP_CONFIG, ALLOWED_FONT_FAMILIES } from '../config.mjs';
import { isValidHexColor } from '../core/document-schema.mjs';
import { pxToMmX, pxToMmY } from '../canvas/interactions.mjs';

const NUMERIC_FIELDS = new Set(['x', 'y', 'width', 'height', 'font_size', 'rotation', 'z_index']);

export function normalizePropertyValue(property, value) {
    if (property === 'locked') return Boolean(value);
    if (property === 'color') {
        if (!isValidHexColor(value)) throw new TypeError('Warna harus berupa kode hex enam digit.');
        return value;
    }
    if (property === 'font_family') {
        if (!ALLOWED_FONT_FAMILIES.has(value)) throw new TypeError('Font tidak didukung.');
        return value;
    }
    if (!NUMERIC_FIELDS.has(property)) throw new TypeError('Properti tidak didukung.');
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError('Nilai harus berupa angka.');
    if ((property === 'width' || property === 'height') && number <= 0) throw new RangeError('Ukuran harus lebih dari nol.');
    if (property === 'x' && (number < 0 || number > APP_CONFIG.PAPER_WIDTH_MM)) throw new RangeError('Posisi X di luar kertas.');
    if (property === 'y' && (number < 0 || number > APP_CONFIG.PAPER_HEIGHT_MM)) throw new RangeError('Posisi Y di luar kertas.');
    if (property === 'font_size' && (number < APP_CONFIG.MIN_FONT_SIZE_PT || number > APP_CONFIG.MAX_FONT_SIZE_PT)) throw new RangeError('Ukuran font di luar batas.');
    if (property === 'rotation' && (number < -360 || number > 360)) throw new RangeError('Rotasi di luar batas.');
    if (property === 'z_index' && (!Number.isInteger(number) || number < -1000 || number > 1000)) throw new RangeError('Layer harus bilangan bulat -1000 sampai 1000.');
    return Number.parseFloat(number.toFixed(1));
}

export function measureSelection(selection) {
    const page = selection.element?.closest('.print-page');
    if (!page) return { width: 0, height: 0 };
    return {
        width: Number.parseFloat(pxToMmX(selection.element.offsetWidth, page).toFixed(1)),
        height: Number.parseFloat(pxToMmY(selection.element.offsetHeight, page).toFixed(1))
    };
}

export function createPropertyPanelController({
    documentRef = document,
    getItem,
    previewProperties,
    beginProperties = () => {},
    flushProperties = () => false,
    align,
    clearSelection,
    showToast = () => {}
}) {
    let lifecycle = null;
    let selections = [];
    const panel = documentRef.getElementById('propertyPanel');
    const summary = documentRef.getElementById('propertySelectionSummary');
    const fieldElements = [...panel.querySelectorAll('[data-property]')];

    function setField(field, value, mixed = false) {
        if (field.type === 'checkbox') field.checked = mixed ? false : Boolean(value);
        else field.value = mixed || value === undefined || value === null ? '' : String(value);
        field.dataset.mixed = String(mixed);
    }

    function setSelection(nextSelections, { preserveActive = false } = {}) {
        selections = Array.isArray(nextSelections) ? nextSelections : [];
        beginProperties(selections);
        panel.hidden = selections.length === 0;
        if (!selections.length) return;
        summary.textContent = selections.length === 1 ? '1 elemen dipilih' : `${selections.length} elemen dipilih`;
        const models = selections.map(selection => {
            const result = getItem(selection.dbIdx, selection.pageIdx, selection.itemIdx);
            return result ? { ...result.item, ...measureSelection(selection) } : null;
        }).filter(Boolean);
        fieldElements.forEach(field => {
            if (preserveActive && field === documentRef.activeElement) return;
            const property = field.dataset.property;
            const values = models.map(item => {
                if (property === 'rotation') return item.rotation ?? 0;
                if (property === 'z_index') return item.z_index ?? 1;
                if (property === 'locked') return item.locked ?? false;
                if (property === 'font_size') return item.font_size ?? APP_CONFIG.DEFAULT_FONT_SIZE_PT;
                if (property === 'color') return item.color ?? '#000000';
                return item[property];
            });
            const mixed = values.some(value => value !== values[0]);
            setField(field, values[0], mixed);
            const textOnlyProperty = ['font_family', 'font_size', 'color'].includes(property);
            field.disabled = textOnlyProperty && models.every(item => item.type === 'image');
        });
        const samePage = selections.every(selection => selection.dbIdx === selections[0].dbIdx && selection.pageIdx === selections[0].pageIdx);
        panel.querySelectorAll('[data-align-action]').forEach(button => button.disabled = selections.length < 2 || !samePage);
    }

    function init() {
        lifecycle?.abort(); lifecycle = new AbortController();
        function applyField(field, immediate) {
            try {
                const property = field.dataset.property;
                if (!immediate && field.value === '') return;
                const value = normalizePropertyValue(property, field.type === 'checkbox' ? field.checked : field.value);
                previewProperties({ [property]: value }, { immediate });
            } catch (error) {
                if (immediate) {
                    showToast(error.message, 'error');
                    setSelection(selections);
                }
            }
        }
        fieldElements.forEach(field => {
            const livePreview = field.type === 'number' || field.type === 'color';
            if (livePreview) field.addEventListener('input', () => applyField(field, false), { signal: lifecycle.signal });
            field.addEventListener('change', () => applyField(field, true), { signal: lifecycle.signal });
        });
        panel.querySelectorAll('[data-align-action]').forEach(button => button.addEventListener('click', () => {
            flushProperties();
            align(selections.map(selection => ({ ...selection, ...measureSelection(selection) })), button.dataset.alignAction);
        }, { signal: lifecycle.signal }));
        documentRef.getElementById('btnCloseProperties').addEventListener('click', clearSelection, { signal: lifecycle.signal });
    }

    function destroy() { lifecycle?.abort(); lifecycle = null; }
    return { destroy, init, setSelection };
}
