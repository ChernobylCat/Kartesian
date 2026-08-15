import { APP_CONFIG } from '../config.mjs';

function setItemDataset(element, debtorIndex, pageIndex, itemIndex) {
  element.dataset.dbIdx = String(debtorIndex);
  element.dataset.pageIdx = String(pageIndex);
  if (itemIndex !== undefined) element.dataset.itemIdx = String(itemIndex);
}

function createIcon(documentRef, name, size) {
  const icon = documentRef.createElement('i');
  icon.dataset.lucide = name;
  if (size) {
    icon.style.width = size;
    icon.style.height = size;
  }
  return icon;
}

function createActionButton(documentRef, action, label, debtorIndex, pageIndex, itemIndex) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.dataset.canvasAction = action;
  button.setAttribute('aria-label', label);
  setItemDataset(button, debtorIndex, pageIndex, itemIndex);
  return button;
}

function appendItemControls(documentRef, element, debtorIndex, pageIndex, itemIndex) {
  const cloneButton = createActionButton(documentRef, 'clone', 'Duplikasi elemen', debtorIndex, pageIndex, itemIndex);
  cloneButton.className = 'clone-item-btn no-print';
  cloneButton.appendChild(createIcon(documentRef, 'copy', '10px'));

  const deleteButton = createActionButton(documentRef, 'delete', 'Hapus elemen', debtorIndex, pageIndex, itemIndex);
  deleteButton.className = 'delete-item-btn no-print';
  deleteButton.textContent = '×';

  const resizeHandles = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map(direction => {
    const handle = documentRef.createElement('div');
    handle.className = `resize-handle resize-${direction} no-print`;
    handle.dataset.resizeDirection = direction;
    handle.setAttribute('aria-hidden', 'true');
    return handle;
  });

  element.append(cloneButton, deleteButton, ...resizeHandles);
}

function applyAdvancedItemStyle(element, item) {
  element.style.setProperty('--item-rotation', `${Number(item.rotation) || 0}deg`);
  element.style.zIndex = String(Number.isInteger(item.z_index) ? item.z_index : 1);
  element.dataset.locked = String(item.locked === true);
  element.classList.toggle('locked-item', item.locked === true);
  if (item.locked) element.setAttribute('aria-roledescription', 'elemen terkunci');
}

function createImageItem(documentRef, item, debtorIndex, pageIndex, itemIndex) {
  const element = documentRef.createElement('div');
  element.className = 'print-item data-item image-item draggable';
  element.tabIndex = 0;
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', `Gambar, elemen ${itemIndex + 1}`);
  setItemDataset(element, debtorIndex, pageIndex, itemIndex);
  element.style.left = `${Number(item.x) || 0}mm`;
  element.style.top = `${Number(item.y) || 0}mm`;
  element.style.width = `${Number(item.width)}mm`;
  element.style.height = `${Number(item.height)}mm`;
  applyAdvancedItemStyle(element, item);

  const image = documentRef.createElement('img');
  image.src = item.text;
  image.alt = '';
  image.style.width = '100%';
  image.style.height = '100%';
  image.style.objectFit = 'contain';
  image.style.pointerEvents = 'none';
  element.appendChild(image);
  appendItemControls(documentRef, element, debtorIndex, pageIndex, itemIndex);
  return element;
}

export function getTextItemStyle(item) {
  const style = {
    left: `${Number(item.x) || 0}mm`,
    top: `${Number(item.y) || 0}mm`,
    fontSize: `${item.font_size === undefined ? APP_CONFIG.DEFAULT_FONT_SIZE_PT : Number(item.font_size)}pt`
  };

  if (item.bold !== undefined) style.fontWeight = item.bold ? 'bold' : 'normal';
  if (item.italic !== undefined) style.fontStyle = item.italic ? 'italic' : 'normal';
  if (item.underline !== undefined) style.textDecoration = item.underline ? 'underline' : 'none';
  if (item.font_family) style.fontFamily = item.font_family;
  if (item.color) style.color = item.color;
  if (item.bg_color) style.backgroundColor = item.bg_color;
  if (item.width !== undefined) style.width = `${Number(item.width)}mm`;
  if (item.height !== undefined) style.height = `${Number(item.height)}mm`;
  return style;
}

function createTextItem(documentRef, item, debtorIndex, pageIndex, itemIndex) {
  const element = documentRef.createElement('div');
  element.className = 'print-item data-item text-item draggable';
  element.tabIndex = 0;
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', `Teks: ${String(item.text || '').slice(0, 80)}`);
  setItemDataset(element, debtorIndex, pageIndex, itemIndex);
  Object.assign(element.style, getTextItemStyle(item));
  element.classList.toggle('sized-text-item', item.width !== undefined || item.height !== undefined);
  applyAdvancedItemStyle(element, item);

  const text = documentRef.createElement('span');
  text.className = 'text-content';
  text.textContent = item.text || '';
  element.appendChild(text);
  appendItemControls(documentRef, element, debtorIndex, pageIndex, itemIndex);
  return element;
}

function createPageBadge(documentRef, pageModel) {
  const badge = documentRef.createElement('div');
  badge.className = 'page-badge no-print';

  const title = documentRef.createElement('span');
  title.style.display = 'flex';
  title.style.alignItems = 'center';
  title.style.gap = '4px';
  title.append(createIcon(documentRef, 'file-text', '13px'));
  title.append(documentRef.createTextNode(` Kertas Ke-${pageModel.globalPageIndex} (${pageModel.debtorName} - Hal. ${pageModel.pageNumber})`));

  const actions = documentRef.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  actions.style.alignItems = 'center';

  const textButton = createActionButton(documentRef, 'add-text', 'Tambah teks', pageModel.debtorIndex, pageModel.pageIndex);
  textButton.className = 'btn-badge-text';
  textButton.append(createIcon(documentRef, 'plus'), documentRef.createTextNode(' Teks'));

  const imageButton = createActionButton(documentRef, 'add-image', 'Tambah gambar', pageModel.debtorIndex, pageModel.pageIndex);
  imageButton.className = 'btn-badge-img';
  imageButton.append(createIcon(documentRef, 'image'), documentRef.createTextNode(' Gambar'));

  actions.append(textButton, imageButton);
  badge.append(title, actions);
  return badge;
}

function createCalibrationMark(documentRef, position, middleLine) {
  const mark = documentRef.createElement('div');
  mark.className = `print-item cal-mark cal-${position}`;
  ['┌───────────┐', middleLine, '└───────────┘'].forEach((line, index) => {
    if (index > 0) mark.appendChild(documentRef.createElement('br'));
    mark.appendChild(documentRef.createTextNode(line));
  });
  return mark;
}

export function createCanvasPageModels(dataList, activePdfPageCount = 0) {
  const pages = [];
  const previewPageMap = [];
  let globalPageIndex = 1;

  dataList.forEach((debtor, debtorIndex) => {
    const sourcePages = debtor.pages || [];
    const totalPages = Math.max(sourcePages.length, activePdfPageCount);
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const page = sourcePages[pageIndex] || { page_number: pageIndex + 1, items: [] };
      previewPageMap[globalPageIndex] = { dbIdx: debtorIndex, pageIdx: pageIndex };
      pages.push({
        debtorIndex,
        debtorName: debtor.debitur || `Debitur ${debtorIndex + 1}`,
        globalPageIndex,
        items: page.items || [],
        pageIndex,
        pageNumber: Number.parseInt(page.page_number, 10) || pageIndex + 1
      });
      globalPageIndex++;
    }
  });

  return { pages, previewPageMap };
}

export function renderCanvasPages(dataList, {
  activePdfPageCount = 0,
  container,
  documentRef = document
} = {}) {
  if (!container) throw new Error('Container preview tidak tersedia.');
  const renderModel = createCanvasPageModels(dataList, activePdfPageCount);
  const fragment = documentRef.createDocumentFragment();

  renderModel.pages.forEach(pageModel => {
    const page = documentRef.createElement('div');
    page.className = 'print-page';
    page.setAttribute('role', 'group');
    page.setAttribute('aria-label', `Kertas ke-${pageModel.globalPageIndex}, ${pageModel.debtorName}, halaman ${pageModel.pageNumber}`);
    setItemDataset(page, pageModel.debtorIndex, pageModel.pageIndex);
    page.appendChild(createPageBadge(documentRef, pageModel));

    const overlay = documentRef.createElement('img');
    overlay.className = 'page-overlay-guide';
    overlay.dataset.pdfPage = String(pageModel.pageNumber);
    overlay.alt = '';
    page.appendChild(overlay);

    page.append(
      createCalibrationMark(documentRef, 'tl', '│ [TL] 10mm │'),
      createCalibrationMark(documentRef, 'tr', '│ 10mm [TR] │'),
      createCalibrationMark(documentRef, 'bl', '│ [BL] 10mm │'),
      createCalibrationMark(documentRef, 'br', '│ 10mm [BR] │')
    );

    pageModel.items.forEach((item, itemIndex) => {
      const element = item.type === 'image'
        ? createImageItem(documentRef, item, pageModel.debtorIndex, pageModel.pageIndex, itemIndex)
        : createTextItem(documentRef, item, pageModel.debtorIndex, pageModel.pageIndex, itemIndex);
      page.appendChild(element);
    });

    fragment.appendChild(page);
  });

  container.replaceChildren(fragment);
  return renderModel;
}
