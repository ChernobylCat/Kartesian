import { APP_CONFIG } from '../config.mjs';

const FORMAT_PROPERTIES = new Set([
    'bold',
    'italic',
    'underline',
    'font_family',
    'color',
    'bg_color'
]);
const ELEMENT_PROPERTIES = new Set([
    'x', 'y', 'width', 'height', 'font_family', 'font_size', 'color',
    'bg_color', 'bold', 'italic', 'underline', 'rotation', 'z_index', 'locked'
]);

function copyDocument(data) {
    return structuredClone(data);
}

function getPage(data, dbIdx, pageIdx, { create = false } = {}) {
    const debtor = data[dbIdx];
    if (!debtor) throw new RangeError('Debitur tujuan tidak ditemukan.');
    if (!Array.isArray(debtor.pages)) debtor.pages = [];

    if (create) {
        while (debtor.pages.length <= pageIdx) {
            debtor.pages.push({
                page_number: debtor.pages.length + 1,
                items: []
            });
        }
    }

    const page = debtor.pages[pageIdx];
    if (!page) throw new RangeError('Halaman tujuan tidak ditemukan.');
    if (!Array.isArray(page.items)) page.items = [];
    return page;
}

export function addTextItem(data, {
    dbIdx = 0,
    pageIdx = 0,
    x = 20,
    y = 20
} = {}) {
    const nextData = copyDocument(data);
    const page = getPage(nextData, dbIdx, pageIdx, { create: true });
    const itemIdx = page.items.length;
    page.items.push({
        text: 'Teks Baru',
        x,
        y,
        font_family: 'Arial, sans-serif',
        bold: false
    });
    return { data: nextData, dbIdx, pageIdx, itemIdx };
}

export function addImageItem(data, {
    dbIdx = 0,
    pageIdx = 0,
    src,
    x = 20,
    y = 20,
    width = 30,
    height = 15
}) {
    if (typeof src !== 'string' || !src) throw new TypeError('Sumber gambar wajib diisi.');
    const nextData = copyDocument(data);
    const page = getPage(nextData, dbIdx, pageIdx, { create: true });
    const itemIdx = page.items.length;
    page.items.push({ type: 'image', text: src, x, y, width, height });
    return { data: nextData, dbIdx, pageIdx, itemIdx };
}

export function cloneCanvasItem(data, { dbIdx, pageIdx, itemIdx }) {
    const nextData = copyDocument(data);
    const page = getPage(nextData, dbIdx, pageIdx);
    const source = page.items[itemIdx];
    if (!source) throw new RangeError('Elemen yang akan diduplikasi tidak ditemukan.');

    const item = copyDocument(source);
    const estimatedWidth = item.type === 'image' ? Number(item.width) : 10;
    const estimatedHeight = item.type === 'image' ? Number(item.height) : 5;
    item.x = Number.parseFloat(Math.max(0, Math.min(
        APP_CONFIG.PAPER_WIDTH_MM - estimatedWidth,
        Number(item.x) + 5
    )).toFixed(1));
    item.y = Number.parseFloat(Math.max(0, Math.min(
        APP_CONFIG.PAPER_HEIGHT_MM - estimatedHeight,
        Number(item.y) + 5
    )).toFixed(1));
    page.items.push(item);
    return { data: nextData, dbIdx, pageIdx, itemIdx: page.items.length - 1 };
}

export function deleteCanvasItem(data, { dbIdx, pageIdx, itemIdx }) {
    const nextData = copyDocument(data);
    const page = getPage(nextData, dbIdx, pageIdx);
    if (!page.items[itemIdx]) throw new RangeError('Elemen yang akan dihapus tidak ditemukan.');
    const [removedItem] = page.items.splice(itemIdx, 1);
    return { data: nextData, removedItem };
}

export function updateCanvasItems(data, { selections, patch }) {
    if (!Array.isArray(selections) || selections.length === 0) throw new TypeError('Pilih minimal satu elemen.');
    const properties = Object.keys(patch || {});
    if (!properties.length || properties.some(property => !ELEMENT_PROPERTIES.has(property))) {
        throw new TypeError('Properti elemen tidak didukung.');
    }
    const nextData = copyDocument(data);
    selections.forEach(({ dbIdx, pageIdx, itemIdx }) => {
        const item = getPage(nextData, dbIdx, pageIdx).items[itemIdx];
        if (!item) throw new RangeError('Elemen terpilih tidak ditemukan.');
        properties.forEach(property => {
            if ((property === 'font_family' || property === 'font_size' || property === 'color') && item.type === 'image') return;
            if (property === 'bg_color' && patch[property] === '') delete item[property];
            else item[property] = patch[property];
        });
    });
    return { data: nextData };
}

export function deleteCanvasItems(data, { selections }) {
    const nextData = copyDocument(data);
    const grouped = new Map();
    selections.forEach(selection => {
        const key = `${selection.dbIdx}:${selection.pageIdx}`;
        if (!grouped.has(key)) grouped.set(key, { ...selection, indices: [] });
        grouped.get(key).indices.push(selection.itemIdx);
    });
    grouped.forEach(({ dbIdx, pageIdx, indices }) => {
        const page = getPage(nextData, dbIdx, pageIdx);
        [...new Set(indices)].sort((a, b) => b - a).forEach(itemIdx => page.items.splice(itemIdx, 1));
    });
    return { data: nextData };
}

export function cloneCanvasItems(data, { selections }) {
    let nextData = copyDocument(data);
    const created = [];
    selections.forEach(selection => {
        const result = cloneCanvasItem(nextData, selection);
        nextData = result.data;
        created.push({ dbIdx: result.dbIdx, pageIdx: result.pageIdx, itemIdx: result.itemIdx });
    });
    return { data: nextData, created };
}

export function alignCanvasItems(data, { selections, action }) {
    if (!Array.isArray(selections) || selections.length < 2) throw new TypeError('Alignment memerlukan minimal dua elemen.');
    const first = selections[0];
    if (selections.some(item => item.dbIdx !== first.dbIdx || item.pageIdx !== first.pageIdx)) {
        throw new TypeError('Alignment hanya dapat dilakukan pada elemen di halaman yang sama.');
    }
    const nextData = copyDocument(data);
    const items = selections.map(selection => ({
        selection,
        item: getPage(nextData, selection.dbIdx, selection.pageIdx).items[selection.itemIdx],
        width: Number(selection.width) || 0,
        height: Number(selection.height) || 0
    }));
    const minX = Math.min(...items.map(entry => Number(entry.item.x)));
    const minY = Math.min(...items.map(entry => Number(entry.item.y)));
    const maxX = Math.max(...items.map(entry => Number(entry.item.x) + entry.width));
    const maxY = Math.max(...items.map(entry => Number(entry.item.y) + entry.height));
    const round = value => Number.parseFloat(value.toFixed(1));

    items.forEach(entry => {
        const { item, width, height } = entry;
        if (action === 'left') item.x = minX;
        else if (action === 'hcenter') item.x = round((minX + maxX - width) / 2);
        else if (action === 'right') item.x = round(maxX - width);
        else if (action === 'top') item.y = minY;
        else if (action === 'vcenter') item.y = round((minY + maxY - height) / 2);
        else if (action === 'bottom') item.y = round(maxY - height);
    });
    if (action === 'distribute-h' || action === 'distribute-v') {
        const horizontal = action === 'distribute-h';
        const sorted = [...items].sort((a, b) => Number(horizontal ? a.item.x : a.item.y) - Number(horizontal ? b.item.x : b.item.y));
        const start = Number(horizontal ? sorted[0].item.x : sorted[0].item.y);
        const endEntry = sorted.at(-1);
        const end = Number(horizontal ? endEntry.item.x : endEntry.item.y) + (horizontal ? endEntry.width : endEntry.height);
        const occupied = sorted.reduce((sum, entry) => sum + (horizontal ? entry.width : entry.height), 0);
        const gap = (end - start - occupied) / (sorted.length - 1);
        let cursor = start;
        sorted.forEach(entry => {
            if (horizontal) entry.item.x = round(cursor);
            else entry.item.y = round(cursor);
            cursor += (horizontal ? entry.width : entry.height) + gap;
        });
    }
    return { data: nextData };
}

export function formatCanvasItem(data, { dbIdx, pageIdx, itemIdx, property, value }) {
    if (!FORMAT_PROPERTIES.has(property)) {
        throw new TypeError(`Properti format tidak didukung: ${property}`);
    }

    const nextData = copyDocument(data);
    const page = getPage(nextData, dbIdx, pageIdx);
    const item = page.items[itemIdx];
    if (!item || item.type === 'image') throw new RangeError('Elemen teks tidak ditemukan.');

    if (property === 'bold') item.bold = typeof value === 'boolean' ? value : item.bold === false;
    else if (property === 'italic' || property === 'underline') {
        item[property] = typeof value === 'boolean' ? value : !item[property];
    }
    else if (property === 'bg_color' && value === '') delete item.bg_color;
    else item[property] = value;

    return { data: nextData, item };
}

export function createCanvasCommandController({
    getData,
    pushUndo,
    updateData
}) {
    function execute(command, options, updateOptions = { silent: true }) {
        const result = command(getData(), options);
        pushUndo();
        updateData(result.data, updateOptions);
        return result;
    }

    return {
        addImage: options => execute(addImageItem, options),
        addText: options => execute(addTextItem, options),
        clone: options => execute(cloneCanvasItem, options),
        cloneMany: options => execute(cloneCanvasItems, options),
        delete: options => execute(deleteCanvasItem, options),
        deleteMany: options => execute(deleteCanvasItems, options),
        align: options => execute(alignCanvasItems, options),
        update: (options, updateOptions) => execute(updateCanvasItems, options, updateOptions),
        format: options => execute(formatCanvasItem, options)
    };
}
