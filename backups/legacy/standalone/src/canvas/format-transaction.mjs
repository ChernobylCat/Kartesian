const STYLE_PROPERTIES = new Set([
  'x',
  'y',
  'width',
  'height',
  'font_family',
  'font_size',
  'color',
  'bg_color',
  'bold',
  'italic',
  'underline',
  'rotation',
  'z_index',
  'locked',
]);

export function applyVisualFormatPatch(element, patch) {
  if (!element || !patch) return;
  Object.entries(patch).forEach(([property, value]) => {
    if (!STYLE_PROPERTIES.has(property)) return;
    if (property === 'x' || property === 'y' || property === 'width' || property === 'height') {
      element.style[property === 'x' ? 'left' : property === 'y' ? 'top' : property] = `${value}mm`;
    } else if (property === 'font_family') element.style.fontFamily = value;
    else if (property === 'font_size') element.style.fontSize = `${value}pt`;
    else if (property === 'color') element.style.color = value;
    else if (property === 'bg_color') element.style.backgroundColor = value || '';
    else if (property === 'bold') element.style.fontWeight = value ? 'bold' : 'normal';
    else if (property === 'italic') element.style.fontStyle = value ? 'italic' : 'normal';
    else if (property === 'underline') element.style.textDecoration = value ? 'underline' : 'none';
    else if (property === 'rotation') element.style.setProperty('--item-rotation', `${value}deg`);
    else if (property === 'z_index') element.style.zIndex = String(value);
    else if (property === 'locked') {
      element.dataset.locked = String(value === true);
      element.classList.toggle('locked-item', value === true);
    }
  });
}

function selectionKey(selections) {
  return selections
    .map(({ dbIdx, pageIdx, itemIdx }) => `${dbIdx}:${pageIdx}:${itemIdx}`)
    .join('|');
}

export function createFormatTransactionController({
  windowRef = window,
  commitPatch,
  debounceMs = 200,
  onPendingChange = () => {},
}) {
  let activeSelections = [];
  let activeKey = '';
  let pendingPatch = {};
  let framePatch = {};
  let commitTimer = null;
  let previewFrame = null;

  function clearTimer() {
    if (commitTimer !== null) windowRef.clearTimeout(commitTimer);
    commitTimer = null;
  }

  function renderPreview() {
    previewFrame = null;
    const patch = framePatch;
    framePatch = {};
    activeSelections.forEach(({ element }) => applyVisualFormatPatch(element, patch));
  }

  function flushPreview() {
    if (previewFrame !== null) windowRef.cancelAnimationFrame(previewFrame);
    if (Object.keys(framePatch).length) renderPreview();
    else previewFrame = null;
  }

  function flush() {
    clearTimer();
    flushPreview();
    const properties = Object.keys(pendingPatch);
    if (!activeSelections.length || !properties.length) return false;
    const selections = activeSelections.map(({ dbIdx, pageIdx, itemIdx }) => ({
      dbIdx,
      pageIdx,
      itemIdx,
    }));
    const patch = { ...pendingPatch };
    pendingPatch = {};
    onPendingChange(false);
    commitPatch(selections, patch);
    return true;
  }

  function begin(selections) {
    const normalized = Array.isArray(selections) ? selections.filter(Boolean) : [];
    const nextKey = selectionKey(normalized);
    if (activeKey && nextKey !== activeKey) flush();
    activeSelections = normalized;
    activeKey = nextKey;
  }

  function preview(patch, { immediate = false } = {}) {
    if (!activeSelections.length || !patch || !Object.keys(patch).length) return false;
    const wasPending = Object.keys(pendingPatch).length > 0;
    Object.assign(pendingPatch, patch);
    Object.assign(framePatch, patch);
    if (!wasPending) onPendingChange(true);
    if (previewFrame === null) previewFrame = windowRef.requestAnimationFrame(renderPreview);
    clearTimer();
    if (immediate) flush();
    else commitTimer = windowRef.setTimeout(flush, debounceMs);
    return true;
  }

  function end() {
    const committed = flush();
    activeSelections = [];
    activeKey = '';
    return committed;
  }

  function destroy() {
    end();
    if (previewFrame !== null) windowRef.cancelAnimationFrame(previewFrame);
    previewFrame = null;
  }

  function hasPendingChanges() {
    return Object.keys(pendingPatch).length > 0;
  }

  return { begin, destroy, end, flush, hasPendingChanges, preview };
}
