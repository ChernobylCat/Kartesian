const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(...segments) {
  return fs.readFileSync(path.join(projectRoot, ...segments), 'utf8');
}

async function run() {
  const html = readProjectFile('index.html');
  const appSource = readProjectFile('src', 'app.mjs');
  const themeBootstrapSource = readProjectFile('src', 'theme-bootstrap.js');
  const workflowSource = readProjectFile('.github', 'workflows', 'quality.yml');
  const serviceWorkerSource = readProjectFile('sw.js');
  const bootstrapSource = readProjectFile('src', 'app', 'bootstrap.mjs');
  const tailwindSource = readProjectFile('src', 'input.css');
  const compiledCss = readProjectFile('assets', 'app.css');
  const documentSchemaSource = readProjectFile('src', 'core', 'document-schema.mjs');
  const canvasCommandsSource = readProjectFile('src', 'canvas', 'commands.mjs');
  const canvasRendererSource = readProjectFile('src', 'canvas', 'renderer.mjs');
  const canvasInteractionsSource = readProjectFile('src', 'canvas', 'interactions.mjs');
  const keyboardControllerSource = readProjectFile('src', 'canvas', 'keyboard-controller.mjs');
  const editorAdapterSource = readProjectFile('src', 'editor', 'adapter.mjs');
  const editorControllerSource = readProjectFile('src', 'editor', 'controller.mjs');
  const htmlExportSource = readProjectFile('src', 'export', 'html-export.mjs');
  const overlayControllerSource = readProjectFile('src', 'overlay', 'controller.mjs');
  const pdfStorageSource = readProjectFile('src', 'storage', 'pdf-storage.mjs');
  const historySource = readProjectFile('src', 'state', 'history.mjs');
  const settingsControllerSource = readProjectFile('src', 'settings', 'controller.mjs');
  const appShellSource = readProjectFile('src', 'ui', 'app-shell.mjs');
  const dialogSource = readProjectFile('src', 'ui', 'dialog.mjs');
  const feedbackSource = readProjectFile('src', 'ui', 'feedback.mjs');
  const formatToolbarSource = readProjectFile('src', 'ui', 'format-toolbar.mjs');
  const settingsSchemaSource = readProjectFile('src', 'core', 'settings-schema.mjs');
  const validTextFixture = JSON.parse(readProjectFile('tests', 'fixtures', 'valid-text.json'));
  const validImageFixture = JSON.parse(readProjectFile('tests', 'fixtures', 'valid-image.json'));
  const invalidBoundsFixture = JSON.parse(readProjectFile('tests', 'fixtures', 'invalid-out-of-bounds.json'));

  const documentSchemaUrl = pathToFileURL(path.join(projectRoot, 'src', 'core', 'document-schema.mjs')).href;
  const bootstrapUrl = pathToFileURL(path.join(projectRoot, 'src', 'app', 'bootstrap.mjs')).href;
  const canvasCommandsUrl = pathToFileURL(path.join(projectRoot, 'src', 'canvas', 'commands.mjs')).href;
  const canvasRendererUrl = pathToFileURL(path.join(projectRoot, 'src', 'canvas', 'renderer.mjs')).href;
  const canvasInteractionsUrl = pathToFileURL(path.join(projectRoot, 'src', 'canvas', 'interactions.mjs')).href;
  const formatTransactionUrl = pathToFileURL(path.join(projectRoot, 'src', 'canvas', 'format-transaction.mjs')).href;
  const keyboardControllerUrl = pathToFileURL(path.join(projectRoot, 'src', 'canvas', 'keyboard-controller.mjs')).href;
  const editorAdapterUrl = pathToFileURL(path.join(projectRoot, 'src', 'editor', 'adapter.mjs')).href;
  const editorControllerUrl = pathToFileURL(path.join(projectRoot, 'src', 'editor', 'controller.mjs')).href;
  const settingsSchemaUrl = pathToFileURL(path.join(projectRoot, 'src', 'core', 'settings-schema.mjs')).href;
  const settingsStorageUrl = pathToFileURL(path.join(projectRoot, 'src', 'storage', 'settings-storage.mjs')).href;
  const utilsUrl = pathToFileURL(path.join(projectRoot, 'src', 'core', 'utils.mjs')).href;
  const htmlExportUrl = pathToFileURL(path.join(projectRoot, 'src', 'export', 'html-export.mjs')).href;
  const overlayControllerUrl = pathToFileURL(path.join(projectRoot, 'src', 'overlay', 'controller.mjs')).href;
  const fieldDetectorUrl = pathToFileURL(path.join(projectRoot, 'src', 'pdf', 'field-detector.mjs')).href;
  const localFieldServiceUrl = pathToFileURL(path.join(projectRoot, 'src', 'pdf', 'local-field-service.mjs')).href;
  const fieldReviewUrl = pathToFileURL(path.join(projectRoot, 'src', 'ui', 'field-review.mjs')).href;
  const pdfStorageUrl = pathToFileURL(path.join(projectRoot, 'src', 'storage', 'pdf-storage.mjs')).href;
  const historyUrl = pathToFileURL(path.join(projectRoot, 'src', 'state', 'history.mjs')).href;
  const settingsControllerUrl = pathToFileURL(path.join(projectRoot, 'src', 'settings', 'controller.mjs')).href;
  const appShellUrl = pathToFileURL(path.join(projectRoot, 'src', 'ui', 'app-shell.mjs')).href;
  const formatToolbarUrl = pathToFileURL(path.join(projectRoot, 'src', 'ui', 'format-toolbar.mjs')).href;
  const propertyPanelUrl = pathToFileURL(path.join(projectRoot, 'src', 'ui', 'property-panel.mjs')).href;
  const { parseDocumentJson, validateDocumentData } = await import(documentSchemaUrl);
  const { createBootstrapController } = await import(bootstrapUrl);
  const {
    addImageItem,
    addTextItem,
    cloneCanvasItem,
    deleteCanvasItem,
    formatCanvasItem,
    updateCanvasItems,
    alignCanvasItems
  } = await import(canvasCommandsUrl);
  const { createCanvasPageModels, getTextItemStyle } = await import(canvasRendererUrl);
  const {
    calculateResizeGeometry,
    createMarqueeRect,
    findSnapPosition,
    isRectSelected,
    pxToMmX,
    pxToMmY
  } = await import(canvasInteractionsUrl);
  const { calculateNudgedPosition, getAlignmentShortcut } = await import(keyboardControllerUrl);
  const { applyVisualFormatPatch, createFormatTransactionController } = await import(formatTransactionUrl);
  const { createTextareaEditorAdapter } = await import(editorAdapterUrl);
  const { analyzeEditorText, getLineAndColumnFromPosition } = await import(editorControllerUrl);
  const { normalizeSettings } = await import(settingsSchemaUrl);
  const { loadSettings, saveSettings } = await import(settingsStorageUrl);
  const { debounce, escapeHtml } = await import(utilsUrl);
  const { buildStandaloneExportHtml, sanitizeExportFileName } = await import(htmlExportUrl);
  const {
    normalizeOverlayOpacity,
    renderPdfPages,
    resolveOverlaySource,
    validatePdfFile
  } = await import(overlayControllerUrl);
  const {
    applyFieldCandidates,
    convertPdfRectToCanvas,
    deduplicateCandidates,
    extractAnnotationCandidates,
    extractTableCandidates,
    extractTextCandidates,
    extractVectorCandidates,
    normalizePlaceholderKey
  } = await import(fieldDetectorUrl);
  const { isCandidateSelectedByDefault } = await import(fieldReviewUrl);
  const {
    getLocalFieldServiceHealth,
    normalizeServiceCandidates,
    scanPdfWithMode,
    scanWithLocalFieldService,
    unresolvedPdfPages
  } = await import(localFieldServiceUrl);
  const { PdfOverlayStorage } = await import(pdfStorageUrl);
  const { createHistoryManager } = await import(historyUrl);
  const { createSettingsSnapshot, getSaveStatusModel, normalizeCalibrationOffset } = await import(settingsControllerUrl);
  const { getStoredTheme, getThemeButtonModel } = await import(appShellUrl);
  const { getFormatToolbarPosition, getQuickPropertyValues } = await import(formatToolbarUrl);
  const { normalizePropertyValue } = await import(propertyPanelUrl);

  const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(script => script.trim());
  assert.equal(inlineScripts.length, 0, 'Application must not contain inline scripts');
  assert.match(html, /<script type="module" src="\.\/src\/app\.mjs"><\/script>/);
  assert.match(html, /<script src="\.\/src\/theme-bootstrap\.js"><\/script>/);
  assert.match(themeBootstrapSource, /theme_preference/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /src="\.\/assets\/vendor\/ace\.js"/);
  assert.match(html, /src="\.\/assets\/vendor\/lucide\.min\.js"/);
  assert.doesNotMatch(html, /cdnjs|unpkg|fonts\.googleapis|integrity=/);
  assert.match(appSource, /assets\/vendor\/pdf\.min\.mjs/);
  assert.match(appSource, /assets\/vendor\/pdf\.worker\.min\.mjs/);
  assert.match(workflowSource, /browser: \[chromium, firefox, webkit\]/);
  assert.match(workflowSource, /workflow_dispatch:/);
  assert.match(workflowSource, /cancel-in-progress: true/);
  assert.match(workflowSource, /name: Build, unit, and security/);
  assert.match(workflowSource, /git diff --exit-code -- assets\/app\.css assets\/vendor/);
  assert.match(workflowSource, /npm run test:unit/);
  assert.match(workflowSource, /npm run audit/);
  assert.match(workflowSource, /needs: quality/);
  assert.match(workflowSource, /npm run test:e2e/);
  assert.match(workflowSource, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(workflowSource, /actions\/setup-node@[a-f0-9]{40}/);
  assert.match(workflowSource, /actions\/upload-artifact@[a-f0-9]{40}/);
  assert.match(serviceWorkerSource, /src\/pdf\/field-detector\.mjs/);
  assert.match(serviceWorkerSource, /src\/pdf\/local-field-service\.mjs/);
  assert.match(serviceWorkerSource, /src\/ui\/field-review\.mjs/);
  assert.match(appSource, /import \{ APP_CONFIG \} from '\.\/config\.mjs'/);
  assert.doesNotMatch(appSource, /from '\.\/src\//);

  const duplicateIds = [...html.matchAll(/\sid=["']([^"']+)["']/g)]
    .map(match => match[1])
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicateIds)], [], 'Static DOM IDs must remain unique');

  const moduleFiles = fs.readdirSync(path.join(projectRoot, 'src'), { recursive: true })
    .filter(file => file.endsWith('.mjs'));
  moduleFiles.forEach(relativeFile => {
    const absoluteFile = path.join(projectRoot, 'src', relativeFile);
    const source = fs.readFileSync(absoluteFile, 'utf8');
    for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const dependency = path.resolve(path.dirname(absoluteFile), match[1]);
      assert.equal(fs.existsSync(dependency), true, `${relativeFile} imports missing module ${match[1]}`);
    }
  });
  assert.equal(getStoredTheme({ getItem: () => 'dark' }), 'dark');
  assert.equal(getStoredTheme({ getItem: () => null }), 'light');
  assert.equal(getStoredTheme({ getItem: () => { throw new Error('Storage diblokir'); } }), 'light');
  assert.deepEqual(getThemeButtonModel(false), { icon: 'moon', label: 'Mode Gelap' });
  assert.deepEqual(getThemeButtonModel(true), { icon: 'sun', label: 'Mode Terang' });

  function documentData(overrides = {}) {
    return [{
      debitur: 'Debitur Test',
      pages: [{
        page_number: 1,
        items: [{ text: 'Aman', x: 10, y: 20, font_size: 10 }]
      }],
      ...overrides
    }];
  }

  assert.doesNotThrow(() => validateDocumentData(documentData()));
  assert.doesNotThrow(() => validateDocumentData(validTextFixture));
  assert.doesNotThrow(() => validateDocumentData(validImageFixture));
  assert.throws(() => validateDocumentData(invalidBoundsFixture), /melewati batas/);
  assert.doesNotThrow(() => validateDocumentData([
    ...documentData(),
    ...documentData({ debitur: 'Debitur Kedua' })
  ]));

  assert.throws(
    () => validateDocumentData(documentData({ pages: [{ page_number: 2, items: [] }] })),
    /berurutan/
  );
  assert.throws(
    () => validateDocumentData(documentData({
      pages: [{ page_number: 1, items: [{ text: 123, x: 1, y: 1 }] }]
    })),
    /berupa string/
  );
  assert.throws(
    () => validateDocumentData(documentData({
      pages: [{ page_number: 1, items: [{ text: 'Koordinat buruk', x: '12abc', y: 1 }] }]
    })),
    /angka yang valid/
  );
  assert.throws(
    () => validateDocumentData(documentData({
      pages: [{ page_number: 1, items: [{
        text: 'Aman', x: 1, y: 1, font_family: 'Arial;" onmouseover="alert(1)'
      }] }]
    })),
    /font yang tidak didukung/
  );
  assert.throws(
    () => validateDocumentData(documentData({
      pages: [{ page_number: 1, items: [{
        type: 'image', text: 'data:image/png" onerror="alert(1)', x: 1, y: 1, width: 10, height: 10
      }] }]
    })),
    /tidak aman/
  );
  assert.throws(
    () => validateDocumentData(documentData({
      pages: [{ page_number: 1, items: [{
        type: 'image', text: 'data:image/png;base64,AAAA', x: 205, y: 1, width: 10, height: 10
      }] }]
    })),
    /melewati batas/
  );
  assert.throws(
    () => validateDocumentData(Array.from({ length: 101 }, (_, index) => ({
      debitur: `Debitur ${index + 1}`,
      pages: []
    }))),
    /batas 100 debitur/
  );
  assert.throws(
    () => validateDocumentData(documentData({
      pages: [{
        page_number: 1,
        items: Array.from({ length: 1001 }, () => ({ text: 'A', x: 1, y: 1 }))
      }]
    })),
    /batas 1000 elemen/
  );

  assert.throws(() => normalizeSettings({ jsonInput: '[]' }), /minimal 1 debitur/);
  const normalized = normalizeSettings({
    overlayOpacity: 999,
    offsetX: -999,
    overlayToggle: true
  });
  assert.equal(normalized.overlayOpacity, '100');
  assert.equal(normalized.offsetX, '-50');
  assert.equal(normalized.overlayToggle, true);

  const memory = new Map();
  const fakeStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value)
  };
  saveSettings({ ...normalized, jsonInput: JSON.stringify(validTextFixture) }, fakeStorage);
  assert.deepEqual(loadSettings(fakeStorage), { ...normalized, jsonInput: JSON.stringify(validTextFixture) });
  assert.equal(escapeHtml('<img src="x" onerror="alert(1)">'), '&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;');
  let pendingTimer = null;
  const debounceCalls = [];
  const debounced = debounce(value => {
    debounceCalls.push(value);
    return value * 2;
  }, 100, {
    setTimer: callback => { pendingTimer = callback; return 1; },
    clearTimer: () => { pendingTimer = null; }
  });
  debounced(1);
  debounced(2);
  assert.equal(debounced.pending(), true);
  assert.equal(debounced.flush(), 4);
  assert.deepEqual(debounceCalls, [2]);
  assert.equal(debounced.pending(), false);
  debounced(3);
  debounced.cancel();
  assert.equal(pendingTimer, null);
  assert.deepEqual(debounceCalls, [2]);

  const canvasModel = createCanvasPageModels(validTextFixture, 3);
  assert.equal(canvasModel.pages.length, 3);
  assert.deepEqual(canvasModel.previewPageMap[1], { dbIdx: 0, pageIdx: 0 });
  assert.deepEqual(canvasModel.previewPageMap[3], { dbIdx: 0, pageIdx: 2 });
  assert.equal(canvasModel.pages[1].items.length, 0);
  assert.deepEqual(getTextItemStyle({
    x: 12,
    y: 14,
    font_size: 11,
    bold: false,
    italic: true,
    underline: true,
    color: '#112233'
  }), {
    left: '12mm',
    top: '14mm',
    fontSize: '11pt',
    fontWeight: 'normal',
    fontStyle: 'italic',
    textDecoration: 'underline',
    color: '#112233'
  });

  assert.equal(pxToMmX(400, { clientWidth: 800 }, 210), 105);
  assert.equal(pxToMmY(600, { clientHeight: 1200 }, 330), 165);
  assert.equal(pxToMmX(10, { clientWidth: 0 }, 210), 0);
  assert.deepEqual(findSnapPosition({
    left: 102,
    top: 52,
    width: 20,
    height: 10,
    siblings: [{ left: 100, top: 50, width: 40, height: 20 }]
  }), {
    left: 100,
    top: 50,
    guideX: 100,
    guideY: 50
  });
  assert.deepEqual(calculateResizeGeometry({
    x: 100, y: 50, width: 80, height: 40,
    deltaX: 20, deltaY: 0, direction: 'e', pageWidth: 500, pageHeight: 500
  }), { x: 100, y: 50, width: 100, height: 40 });
  assert.deepEqual(calculateResizeGeometry({
    x: 100, y: 50, width: 80, height: 40,
    deltaX: -20, deltaY: 0, direction: 'w', pageWidth: 500, pageHeight: 500
  }), { x: 80, y: 50, width: 100, height: 40 });
  assert.deepEqual(calculateResizeGeometry({
    x: 100, y: 50, width: 80, height: 40,
    deltaX: 10, deltaY: 0, direction: 'e', fromCenter: true,
    pageWidth: 500, pageHeight: 500
  }), { x: 90, y: 50, width: 100, height: 40 });
  const proportionalResize = calculateResizeGeometry({
    x: 100, y: 50, width: 80, height: 40,
    deltaX: 20, deltaY: 0, direction: 'e', keepAspectRatio: true,
    pageWidth: 500, pageHeight: 500
  });
  assert.equal(proportionalResize.width / proportionalResize.height, 2);
  assert.deepEqual(calculateResizeGeometry({
    x: 100, y: 100, width: 100, height: 10,
    deltaX: 20, deltaY: 0, direction: 'e', rotation: 90,
    pageWidth: 500, pageHeight: 500
  }), { x: 90, y: 110, width: 120, height: 10 });
  assert.throws(() => calculateResizeGeometry({
    x: 0, y: 0, width: 10, height: 10,
    deltaX: 1, deltaY: 1, direction: 'invalid'
  }), /Arah resize/);
  assert.deepEqual(createMarqueeRect(90, 70, 20, 10), {
    left: 20,
    top: 10,
    right: 90,
    bottom: 70,
    width: 70,
    height: 60
  });
  const marquee = { left: 10, top: 10, right: 100, bottom: 100 };
  assert.equal(isRectSelected({ left: 20, top: 20, right: 40, bottom: 40 }, marquee, 'contain'), true);
  assert.equal(isRectSelected({ left: 5, top: 20, right: 40, bottom: 40 }, marquee, 'contain'), false);
  assert.equal(isRectSelected({ left: 5, top: 20, right: 40, bottom: 40 }, marquee, 'intersect'), true);
  assert.equal(isRectSelected({ left: 101, top: 20, right: 120, bottom: 40 }, marquee, 'intersect'), false);
  assert.throws(
    () => isRectSelected({ left: 0, top: 0, right: 1, bottom: 1 }, marquee, 'invalid'),
    /Mode marquee/
  );
  assert.deepEqual(findSnapPosition({
    left: 20,
    top: 30,
    width: 10,
    height: 10,
    siblings: [{ left: 100, top: 100, width: 20, height: 20 }]
  }), {
    left: 20,
    top: 30,
    guideX: null,
    guideY: null
  });
  assert.deepEqual(calculateNudgedPosition({
    x: 10,
    y: 20,
    width: 30,
    height: 10,
    key: 'ArrowRight',
    step: 0.1
  }), { x: 10.1, y: 20 });
  assert.deepEqual(calculateNudgedPosition({
    x: 0,
    y: 0,
    width: 30,
    height: 10,
    key: 'ArrowLeft',
    step: 1
  }), { x: 0, y: 0 });
  [
    ['A', false, 'left'], ['H', false, 'hcenter'], ['D', false, 'right'],
    ['W', false, 'top'], ['V', false, 'vcenter'], ['S', false, 'bottom'],
    ['H', true, 'distribute-h'], ['V', true, 'distribute-v']
  ].forEach(([key, shiftKey, action]) => {
    assert.equal(getAlignmentShortcut({ key, altKey: true, shiftKey, ctrlKey: false, metaKey: false }), action);
  });
  assert.equal(getAlignmentShortcut({ key: 'A', altKey: false, shiftKey: false, ctrlKey: false, metaKey: false }), null);

  const historyChanges = [];
  const history = createHistoryManager({
    limit: 2,
    onChange: state => historyChanges.push(state)
  });
  history.reset('A');
  assert.equal(history.recordInput('B'), true);
  assert.equal(history.recordInput('B lanjutan'), false);
  history.commit('B');
  assert.equal(history.recordInput('C'), true);
  assert.equal(history.undo('C'), 'B');
  assert.equal(history.redo('B'), 'C');
  assert.equal(history.undo('C'), 'B');
  assert.equal(history.recordInput('D'), true);
  assert.equal(history.status().canRedo, false, 'Edit baru harus membuang redo history');
  history.commit('D');
  history.push('D');
  history.push('E');
  assert.equal(history.status().undoCount, 2, 'Undo history harus mengikuti batas stack');
  assert.ok(historyChanges.length > 0);

  assert.equal(normalizeCalibrationOffset(-100), -50);
  assert.equal(normalizeCalibrationOffset(100), 50);
  assert.equal(normalizeCalibrationOffset('2.5'), 2.5);
  assert.deepEqual(getSaveStatusModel('pending'), { label: 'Belum tersimpan', state: 'pending' });
  assert.deepEqual(getSaveStatusModel('saved'), { label: 'Tersimpan lokal', state: 'saved' });
  assert.deepEqual(getSaveStatusModel('unknown'), { label: 'Siap', state: 'idle' });
  assert.deepEqual(createSettingsSnapshot({
    jsonInput: '[]',
    overlaySettings: { overlayDoc: 'none', overlayToggle: true, overlayOpacity: '50', printOverlayCheck: false },
    offsetX: 1.5,
    offsetY: -2,
    hideCalibrationPrint: true,
    hideCalibrationPreview: false,
    snappingEnabled: true
  }), {
    schemaVersion: 1,
    jsonInput: '[]',
    overlayDoc: 'none',
    overlayToggle: true,
    overlayOpacity: '50',
    printOverlayCheck: false,
    offsetX: '1.5',
    offsetY: '-2',
    hideCalCheck: true,
    hideCalPreviewCheck: false,
    enableSnapCheck: true
  });

  const bootstrapOrder = [];
  const bootstrap = createBootstrapController({
    documentRef: { readyState: 'complete', body: { classList: { contains: () => false } } },
    windowRef: { addEventListener() {} },
    settingsController: {
      load: () => { bootstrapOrder.push('load'); return { jsonInput: 'stored-json', overlayDoc: 'none' }; },
      apply: () => bootstrapOrder.push('settings'),
      destroy() {}
    },
    historyManager: { reset: value => bootstrapOrder.push(`history:${value}`) },
    editorController: {
      init: value => { bootstrapOrder.push(`editor:${value}`); return { value }; },
      destroy() {}
    },
    overlayController: {
      hydrate: () => bootstrapOrder.push('overlay'),
      destroy() {}
    },
    defaultJson: 'default-json',
    setEditor: () => bootstrapOrder.push('set-editor'),
    render: () => bootstrapOrder.push('render'),
    syncTheme: () => bootstrapOrder.push('theme')
  });
  bootstrap.start();
  assert.deepEqual(bootstrapOrder, [
    'load',
    'history:stored-json',
    'editor:stored-json',
    'set-editor',
    'settings',
    'render',
    'theme',
    'overlay'
  ]);
  assert.match(bootstrapSource, /readyState !== 'loading'/);
  assert.match(bootstrapSource, /DOMContentLoaded/);

  let bootstrapError = null;
  const failedBootstrap = createBootstrapController({
    documentRef: { readyState: 'complete', body: { classList: { contains: () => false } } },
    windowRef: { addEventListener() {} },
    settingsController: { load: () => { throw new Error('startup gagal'); }, destroy() {} },
    historyManager: { reset() {} },
    editorController: { init() {}, destroy() {} },
    overlayController: { hydrate() {}, destroy() {} },
    defaultJson: '[]',
    setEditor() {},
    render() {},
    syncTheme() {},
    onError: error => { bootstrapError = error; }
  });
  assert.equal(failedBootstrap.start(), null);
  assert.equal(bootstrapError?.message, 'startup gagal');

  assert.equal(normalizeOverlayOpacity(52), 50);
  assert.equal(normalizeOverlayOpacity(2), 5);
  assert.equal(normalizeOverlayOpacity(110), 100);
  assert.equal(validatePdfFile({ name: 'dokumen.pdf', type: '', size: 100 }), true);
  assert.throws(() => validatePdfFile({ name: 'kosong.pdf', type: 'application/pdf', size: 0 }), /kosong/);
  assert.throws(() => validatePdfFile({ name: 'dokumen.txt', type: 'text/plain', size: 100 }), /bukan PDF/);
  assert.throws(() => validatePdfFile({ name: 'besar.pdf', type: 'application/pdf', size: 101 }, 100), /melebihi batas/);
  assert.equal(resolveOverlaySource({
    documentValue: 'uploaded_pdf',
    pageNumber: 2,
    uploadedPages: ['page-1', 'page-2']
  }), 'page-2');
  assert.match(resolveOverlaySource({
    documentValue: 'doc_1',
    pageNumber: 1,
    uploadedPages: null
  }), /assets\/doc_1/);
  assert.equal(resolveOverlaySource({ documentValue: 'none', pageNumber: 1 }), null);

  const detectorViewport = {
    width: 200,
    height: 200,
    convertToViewportPoint: (x, y) => [x, 200 - y]
  };
  assert.deepEqual(convertPdfRectToCanvas([60, 120, 160, 140], detectorViewport), {
    x: 63,
    y: 99,
    width: 105,
    height: 33
  });
  assert.equal(normalizePlaceholderKey('Nama Lengkap:'), 'nama_lengkap');
  const widgetCandidates = extractAnnotationCandidates([{
    subtype: 'Widget', fieldType: 'Tx', fieldName: 'nama_lengkap', rect: [60, 120, 160, 140]
  }], detectorViewport, 1);
  assert.equal(widgetCandidates.length, 1);
  assert.equal(widgetCandidates[0].placeholder, '{{nama_lengkap}}');
  assert.equal(widgetCandidates[0].confidence, 0.99);

  const fakeOps = { save: 10, restore: 11, transform: 12, constructPath: 91 };
  const vectorCandidates = extractVectorCandidates({
    pageNumber: 1,
    viewport: detectorViewport,
    ops: fakeOps,
    textContent: {
      items: [{ str: 'Nama:', transform: [12, 0, 0, 12, 60, 60], width: 35, height: 12 }]
    },
    operatorList: {
      fnArray: [fakeOps.constructPath],
      argsArray: [[20, [], new Float32Array([60, 55, 160, 55])]]
    }
  });
  assert.equal(vectorCandidates.length, 1);
  assert.equal(vectorCandidates[0].source, 'vector-line');
  assert.equal(vectorCandidates[0].key, 'nama');

  const underlineCandidates = extractTextCandidates({
    pageNumber: 1,
    viewport: detectorViewport,
    textContent: {
      items: [{ str: 'Paraf: ______', transform: [12, 0, 0, 12, 40, 40], width: 90, height: 12 }]
    }
  });
  assert.equal(underlineCandidates.length, 1);
  assert.equal(underlineCandidates[0].source, 'text-underline');
  assert.equal(underlineCandidates[0].key, 'paraf');
  assert.equal(isCandidateSelectedByDefault({ confidence: 0.75 }), true);
  assert.equal(isCandidateSelectedByDefault({ confidence: 0.74 }), false);

  const narrativeCandidates = extractVectorCandidates({
    pageNumber: 1,
    viewport: detectorViewport,
    ops: fakeOps,
    textContent: {
      items: [{
        str: 'Kalimat naratif ini sangat panjang dan bukan merupakan label untuk sebuah field formulir kosong',
        transform: [12, 0, 0, 12, 10, 60], width: 140, height: 12
      }]
    },
    operatorList: {
      fnArray: [fakeOps.constructPath],
      argsArray: [[20, [], new Float32Array([155, 55, 195, 55])]]
    }
  });
  assert.equal(narrativeCandidates.length, 0);

  const multilineBoxCandidates = extractVectorCandidates({
    pageNumber: 1,
    viewport: detectorViewport,
    ops: fakeOps,
    textContent: {
      items: [{ str: 'Alamat lengkap:', transform: [12, 0, 0, 12, 20, 55], width: 70, height: 12 }]
    },
    operatorList: {
      fnArray: [fakeOps.constructPath],
      argsArray: [[20, [], new Float32Array([20, 20, 180, 50])]]
    }
  });
  assert.equal(multilineBoxCandidates.length, 1);
  assert.equal(multilineBoxCandidates[0].source, 'vector-box');
  assert.equal(multilineBoxCandidates[0].key, 'alamat_lengkap');

  const denseGridCandidates = extractVectorCandidates({
    pageNumber: 1,
    viewport: detectorViewport,
    ops: fakeOps,
    textContent: {
      items: [{ str: 'Baris tabel', transform: [12, 0, 0, 12, 20, 190], width: 70, height: 12 }]
    },
    operatorList: {
      fnArray: Array.from({ length: 31 }, () => fakeOps.constructPath),
      argsArray: Array.from({ length: 31 }, (_, index) => [
        20, [], new Float32Array([20, 185 - index * 2, 180, 185 - index * 2])
      ])
    }
  });
  assert.equal(denseGridCandidates.length, 0);

  const tableViewport = {
    width: 200,
    height: 200,
    convertToViewportPoint: (x, y) => [x, y]
  };
  const keyValueTableCandidates = extractTableCandidates({
    pageNumber: 1,
    viewport: tableViewport,
    ops: fakeOps,
    textContent: {
      items: [
        { str: 'Nama:', transform: [4, 0, 0, 4, 25, 100.5], width: 25, height: 4 },
        { str: 'Nomor KTP:', transform: [4, 0, 0, 4, 25, 106.5], width: 42, height: 4 }
      ]
    },
    operatorList: {
      fnArray: Array.from({ length: 6 }, () => fakeOps.constructPath),
      argsArray: [100, 106, 112].flatMap(y => [
        [20, [], new Float32Array([20, y, 80, y])],
        [20, [], new Float32Array([85, y, 180, y])]
      ])
    }
  });
  assert.deepEqual(keyValueTableCandidates.map(candidate => candidate.key), ['nama', 'nomor_ktp']);
  assert.ok(keyValueTableCandidates.every(candidate => candidate.source === 'table-cell'));

  const numberedTableCandidates = extractTableCandidates({
    pageNumber: 1,
    viewport: tableViewport,
    ops: fakeOps,
    textContent: {
      items: [
        { str: '1.', transform: [4, 0, 0, 4, 11, 100.5], width: 5, height: 4 },
        { str: 'Nama barang', transform: [4, 0, 0, 4, 25, 100.5], width: 40, height: 4 },
        { str: '2.', transform: [4, 0, 0, 4, 11, 106.5], width: 5, height: 4 },
        { str: 'Merk barang', transform: [4, 0, 0, 4, 25, 106.5], width: 40, height: 4 }
      ]
    },
    operatorList: {
      fnArray: Array.from({ length: 9 }, () => fakeOps.constructPath),
      argsArray: [100, 106, 112].flatMap(y => [
        [20, [], new Float32Array([10, y, 18, y])],
        [20, [], new Float32Array([20, y, 80, y])],
        [20, [], new Float32Array([85, y, 180, y])]
      ])
    }
  });
  assert.equal(numberedTableCandidates.length, 0);
  assert.equal(deduplicateCandidates([...widgetCandidates, {
    ...widgetCandidates[0], id: 'lower-priority', source: 'vector-box', confidence: 0.8
  }]).length, 1);

  assert.deepEqual(unresolvedPdfPages(4, [
    { pageNumber: 1 }, { pageNumber: 3 }, { pageNumber: 3 }
  ]), [2, 4]);
  const normalizedLocalCandidates = normalizeServiceCandidates([{
    pageNumber: 2,
    source: 'pymupdf-vector',
    label: 'Nomor KTP:',
    x: 30.04,
    y: 40.06,
    width: 80,
    height: 5,
    confidence: 1.4
  }, {
    pageNumber: 3,
    source: 'paddleocr',
    label: 'Di luar halaman yang diminta',
    x: 20,
    y: 30,
    width: 40,
    height: 5,
    confidence: 0.6
  }], [2]);
  assert.equal(normalizedLocalCandidates.length, 1);
  assert.equal(normalizedLocalCandidates[0].placeholder, '{{nomor_ktp}}');
  assert.equal(normalizedLocalCandidates[0].confidence, 1);
  assert.equal(normalizedLocalCandidates[0].x, 30);

  const localFetchCalls = [];
  const localScan = await scanWithLocalFieldService(new Uint8Array([37, 80, 68, 70]), {
    pages: [2],
    endpoint: 'http://127.0.0.1:8765',
    fetchImpl: async (url, options) => {
      localFetchCalls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          engines: ['pymupdf'],
          warnings: [],
          candidates: normalizedLocalCandidates
        })
      };
    }
  });
  assert.equal(localFetchCalls.length, 1);
  assert.match(localFetchCalls[0].url, /pages=2/);
  assert.equal(localFetchCalls[0].options.headers['Content-Type'], 'application/pdf');
  assert.equal(localScan.available, true);
  assert.equal(localScan.candidates[0].source, 'pymupdf-vector');

  const serviceHealth = await getLocalFieldServiceHealth({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ pymupdf: true, paddleocr: false })
    })
  });
  assert.deepEqual(serviceHealth, { available: true, pymupdf: true, paddleocr: false });

  let forcedScanUrl = '';
  const forcedOcrScan = await scanPdfWithMode({ numPages: 2 }, new Uint8Array([37, 80, 68, 70]), {
    mode: 'paddleocr',
    fetchImpl: async url => {
      forcedScanUrl = url;
      return {
        ok: true,
        json: async () => ({
          engines: ['paddleocr'],
          warnings: [],
          candidates: [{
            pageNumber: 2, source: 'paddleocr', label: 'Alamat',
            x: 20, y: 30, width: 50, height: 5, confidence: 0.61
          }]
        })
      };
    }
  });
  assert.match(forcedScanUrl, /pages=1%2C2/);
  assert.match(forcedScanUrl, /ocr=always/);
  assert.match(forcedScanUrl, /mode=ocr/);
  assert.equal(forcedOcrScan.candidates[0].source, 'paddleocr');
  await assert.rejects(
    () => scanPdfWithMode({ numPages: 1 }, new Uint8Array(), { mode: 'unknown' }),
    /tidak didukung/
  );

  const unavailableLocalScan = await scanWithLocalFieldService(new Uint8Array([1]), {
    pages: [1],
    scanTimeoutMs: 50,
    fetchImpl: async () => { throw new Error('connection refused'); }
  });
  assert.equal(unavailableLocalScan.available, false);
  assert.match(unavailableLocalScan.warnings[0], /tidak tersedia/);

  const appliedFields = applyFieldCandidates([
    { debitur: 'Satu', pages: [] },
    { debitur: 'Dua', pages: [{ page_number: 1, items: [] }] }
  ], widgetCandidates);
  assert.equal(appliedFields.addedCount, 2);
  assert.equal(appliedFields.data[0].pages[0].items[0].text, '{{nama_lengkap}}');
  assert.equal(appliedFields.data[1].pages[0].items[0].x, 63);
  const duplicateApply = applyFieldCandidates(appliedFields.data, widgetCandidates);
  assert.equal(duplicateApply.addedCount, 0);

  const pdfProgress = [];
  const renderedPdfPages = await renderPdfPages({
    numPages: 1,
    getPage: async () => ({
      getViewport: () => ({ width: 100, height: 200 }),
      render: () => ({ promise: Promise.resolve() })
    })
  }, {
    documentRef: {
      createElement: () => ({
        getContext: () => ({}),
        toDataURL: () => 'data:image/jpeg;base64,PDFPAGE'
      })
    },
    nextFrame: () => Promise.resolve(),
    onProgress: progress => pdfProgress.push(progress)
  });
  assert.deepEqual(renderedPdfPages, ['data:image/jpeg;base64,PDFPAGE']);
  assert.equal(pdfProgress[0].percent, 100);

  assert.deepEqual(getLineAndColumnFromPosition('abc\ndef', 5), { line: 2, column: 2 });
  const validEditorResult = analyzeEditorText(JSON.stringify(validTextFixture), {
    parseDocument: parseDocumentJson,
    activePdfPageCount: 1
  });
  assert.equal(validEditorResult.valid, true);
  assert.equal(validEditorResult.severity, 'success');
  assert.match(validEditorResult.message, /^✅ Format JSON & Skema Valid/);
  const twoPageEditorFixture = structuredClone(validTextFixture);
  twoPageEditorFixture[0].pages.push({ page_number: 2, items: [] });
  const warningEditorResult = analyzeEditorText(JSON.stringify(twoPageEditorFixture), {
    parseDocument: parseDocumentJson,
    activePdfPageCount: 1
  });
  assert.equal(warningEditorResult.valid, true);
  assert.equal(warningEditorResult.severity, 'warning');
  assert.match(warningEditorResult.message, /^⚠️ Peringatan Kecocokan Halaman:/);
  const invalidEditorResult = analyzeEditorText('[{', { parseDocument: parseDocumentJson });
  assert.equal(invalidEditorResult.valid, false);
  assert.match(invalidEditorResult.message, /^❌ Kesalahan:/);
  assert.equal(invalidEditorResult.annotations.length, 1);

  const textareaListeners = new Map();
  const fakeTextarea = {
    style: {},
    value: '',
    addEventListener: (name, handler) => textareaListeners.set(name, handler),
    removeEventListener: name => textareaListeners.delete(name),
    focus() {}
  };
  const fallbackAdapter = createTextareaEditorAdapter({ style: {} }, fakeTextarea);
  let fallbackChanges = 0;
  fallbackAdapter.session.on('change', () => fallbackChanges++);
  fallbackAdapter.setValue('editor fallback');
  assert.equal(fallbackAdapter.getValue(), 'editor fallback');
  assert.equal(fallbackChanges, 1);
  fallbackAdapter.destroy();
  assert.equal(textareaListeners.has('input'), false);

  const sourceDocument = documentData();
  const addedText = addTextItem(sourceDocument, { dbIdx: 0, pageIdx: 1, x: 12, y: 13 });
  assert.equal(sourceDocument[0].pages.length, 1, 'Canvas command tidak boleh memutasi dokumen asal');
  assert.equal(addedText.data[0].pages.length, 2);
  assert.deepEqual(addedText.data[0].pages[1].items[0], {
    text: 'Teks Baru',
    x: 12,
    y: 13,
    font_family: 'Arial, sans-serif',
    bold: false
  });
  const addedImage = addImageItem(sourceDocument, {
    dbIdx: 0,
    pageIdx: 0,
    src: 'data:image/png;base64,AAAA'
  });
  assert.equal(addedImage.data[0].pages[0].items[1].type, 'image');
  const cloned = cloneCanvasItem(sourceDocument, { dbIdx: 0, pageIdx: 0, itemIdx: 0 });
  assert.equal(cloned.data[0].pages[0].items.length, 2);
  assert.equal(cloned.data[0].pages[0].items[1].x, 15);
  const formatted = formatCanvasItem(sourceDocument, {
    dbIdx: 0,
    pageIdx: 0,
    itemIdx: 0,
    property: 'bold'
  });
  assert.equal(formatted.data[0].pages[0].items[0].bold, false);
  const explicitlyFormatted = formatCanvasItem(sourceDocument, {
    dbIdx: 0,
    pageIdx: 0,
    itemIdx: 0,
    property: 'italic',
    value: true
  });
  assert.equal(explicitlyFormatted.data[0].pages[0].items[0].italic, true);
  const idempotentFormat = formatCanvasItem(explicitlyFormatted.data, {
    dbIdx: 0,
    pageIdx: 0,
    itemIdx: 0,
    property: 'italic',
    value: true
  });
  assert.equal(idempotentFormat.data[0].pages[0].items[0].italic, true);
  const visualElement = {
    classList: { toggle(name, enabled) { this[name] = enabled; } },
    dataset: {},
    style: {
      setProperty(name, value) { this[name] = value; }
    }
  };
  applyVisualFormatPatch(visualElement, {
    color: '#123456', bold: true, italic: true, rotation: 15, locked: true, x: 12.5
  });
  assert.equal(visualElement.style.color, '#123456');
  assert.equal(visualElement.style.fontWeight, 'bold');
  assert.equal(visualElement.style.fontStyle, 'italic');
  assert.equal(visualElement.style['--item-rotation'], '15deg');
  assert.equal(visualElement.style.left, '12.5mm');
  assert.equal(visualElement.dataset.locked, 'true');

  let scheduledFrame = null;
  let scheduledCommit = null;
  const transactionCommits = [];
  const transaction = createFormatTransactionController({
    windowRef: {
      requestAnimationFrame(callback) { scheduledFrame = callback; return 1; },
      cancelAnimationFrame() { scheduledFrame = null; },
      setTimeout(callback) { scheduledCommit = callback; return 2; },
      clearTimeout() { scheduledCommit = null; }
    },
    commitPatch: (selections, patch) => transactionCommits.push({ selections, patch }),
    debounceMs: 200
  });
  transaction.begin([{ element: visualElement, dbIdx: 0, pageIdx: 0, itemIdx: 0 }]);
  transaction.preview({ color: '#abcdef' });
  transaction.preview({ font_size: 14 });
  assert.equal(transactionCommits.length, 0);
  scheduledFrame();
  assert.equal(visualElement.style.color, '#abcdef');
  assert.equal(visualElement.style.fontSize, '14pt');
  scheduledCommit();
  assert.equal(transactionCommits.length, 1);
  assert.deepEqual(transactionCommits[0].patch, { color: '#abcdef', font_size: 14 });
  transaction.preview({ bold: false }, { immediate: true });
  assert.equal(transactionCommits.length, 2);
  assert.equal(visualElement.style.fontWeight, 'normal');
  const deleted = deleteCanvasItem(cloned.data, { dbIdx: 0, pageIdx: 0, itemIdx: 0 });
  assert.equal(deleted.data[0].pages[0].items.length, 1);
  const updated = updateCanvasItems(sourceDocument, {
    selections: [{ dbIdx: 0, pageIdx: 0, itemIdx: 0 }],
    patch: { rotation: 45, z_index: 3, locked: true }
  });
  assert.equal(updated.data[0].pages[0].items[0].rotation, 45);
  assert.equal(updated.data[0].pages[0].items[0].locked, true);
  const alignSource = cloneCanvasItem(sourceDocument, { dbIdx: 0, pageIdx: 0, itemIdx: 0 }).data;
  const aligned = alignCanvasItems(alignSource, {
    action: 'left',
    selections: [
      { dbIdx: 0, pageIdx: 0, itemIdx: 0, width: 10, height: 5 },
      { dbIdx: 0, pageIdx: 0, itemIdx: 1, width: 10, height: 5 }
    ]
  });
  assert.equal(aligned.data[0].pages[0].items[0].x, aligned.data[0].pages[0].items[1].x);
  assert.equal(normalizePropertyValue('rotation', '12.5'), 12.5);
  assert.throws(() => normalizePropertyValue('rotation', '500'), /Rotasi/);
  assert.throws(() => formatCanvasItem(sourceDocument, {
    dbIdx: 0,
    pageIdx: 0,
    itemIdx: 0,
    property: 'onclick',
    value: 'alert(1)'
  }), /tidak didukung/);
  assert.deepEqual(getFormatToolbarPosition(
    { left: 5, top: 5, width: 20 },
    { width: 100, height: 30 }
  ), { left: 10, top: 15 });
  assert.deepEqual(getFormatToolbarPosition(
    { left: 50, top: 5, bottom: 25, width: 20, height: 20 },
    { width: 100, height: 30 },
    { viewportWidth: 300, viewportHeight: 100, margin: 10 }
  ), { left: 10, top: 35 });
  assert.deepEqual(getFormatToolbarPosition(
    { left: 480, top: 100, width: 20 },
    { width: 200, height: 30 },
    { viewportWidth: 500, margin: 10 }
  ), { left: 290, top: 60 });
  assert.deepEqual(getQuickPropertyValues({
    x: 12,
    y: 14,
    font_size: 11,
    rotation: 25,
    z_index: 4,
    locked: true
  }, {
    offsetWidth: 100,
    offsetHeight: 50,
    closest: () => ({ clientWidth: 1000, clientHeight: 1000 })
  }), {
    x: 12,
    y: 14,
    width: 21,
    height: 16.5,
    font_size: 11,
    rotation: 25,
    z_index: 4,
    locked: true
  });

  assert.equal(sanitizeExportFileName(JSON.stringify([{ debitur: 'Nama / Berbahaya <script>' }])), 'Nama_Berbahaya_script');
  assert.equal(sanitizeExportFileName('invalid json'), 'export');
  const standaloneHtml = buildStandaloneExportHtml({
    pagesHtml: '<div class="print-page">Aman</div>',
    fileName: '<unsafe>',
    offsetX: 1.5,
    offsetY: -2
  });
  assert.match(standaloneHtml, /^<!DOCTYPE html>/);
  assert.match(standaloneHtml, /<title>Export - &lt;unsafe&gt;<\/title>/);
  assert.match(standaloneHtml, /--offset-x: 1\.5mm/);
  assert.match(standaloneHtml, /@page \{ size:210mm 330mm/);

  let activePdfRecord = null;
  const fakeDatabase = {
    objectStoreNames: { contains: () => false },
    createObjectStore: () => {},
    close: () => {},
    transaction: () => {
      const transaction = { error: null };
      transaction.objectStore = () => ({
        put: value => {
          activePdfRecord = value;
          queueMicrotask(() => transaction.oncomplete?.());
        },
        get: () => {
          const request = {};
          queueMicrotask(() => request.onsuccess?.({ target: { result: activePdfRecord } }));
          return request;
        },
        delete: () => {
          const request = {};
          queueMicrotask(() => {
            activePdfRecord = null;
            request.onsuccess?.();
          });
          return request;
        }
      });
      return transaction;
    }
  };
  const fakeIndexedDb = {
    open: () => {
      const request = {};
      queueMicrotask(() => {
        request.onupgradeneeded?.({ target: { result: fakeDatabase } });
        request.onsuccess?.({ target: { result: fakeDatabase } });
      });
      return request;
    }
  };
  const pdfStorage = new PdfOverlayStorage({ indexedDb: fakeIndexedDb });
  const storedPdfData = new Uint8Array([37, 80, 68, 70]).buffer;
  await pdfStorage.savePages(['page-1'], widgetCandidates, { pdfData: storedPdfData, fileName: 'form.pdf' });
  assert.deepEqual(await pdfStorage.getPages(), ['page-1']);
  assert.deepEqual((await pdfStorage.getPayload()).candidates, widgetCandidates);
  await pdfStorage.saveCandidates([]);
  const storedPdfPayload = await pdfStorage.getPayload();
  assert.deepEqual(storedPdfPayload.candidates, []);
  assert.equal(storedPdfPayload.pdfData, storedPdfData);
  assert.equal(storedPdfPayload.fileName, 'form.pdf');
  await pdfStorage.deletePages();
  assert.equal(await pdfStorage.getPages(), null);
  await assert.rejects(() => new PdfOverlayStorage({ indexedDb: null }).getPages(), /tidak tersedia/);

  assert.match(canvasRendererSource, /overlay\.className = 'page-overlay-guide'/);
  assert.match(html, /<link rel="stylesheet" href="\.\/assets\/app\.css">/);
  assert.match(html, /id="btnScanPdfFields"/);
  assert.match(html, /id="pdfFieldScanMode"/);
  assert.match(tailwindSource, /@import "tailwindcss"/);
  assert.match(tailwindSource, /\.admin-panel\s*\{/);
  assert.match(compiledCss, /\.admin-panel\{/);
  assert.doesNotMatch(html, /\.admin-panel\s*\{/);
  assert.doesNotMatch(html, /overlay\.style\.backgroundImage/);
  assert.match(htmlExportSource, /rotate\(var\(--item-rotation\)\)/);
  assert.doesNotMatch(editorControllerSource, /\.innerHTML\s*=/);
  assert.match(appSource, /overlayController\.afterRender\(\)/);
  assert.doesNotMatch(appSource, /IMAGE_STORE_NAME|previousData|img\.data-item/);

  assert.match(documentSchemaSource, /export function validateDocumentData/);
  assert.match(bootstrapSource, /export function createBootstrapController/);
  assert.match(canvasCommandsSource, /export function createCanvasCommandController/);
  assert.match(canvasRendererSource, /export function renderCanvasPages/);
  assert.match(canvasInteractionsSource, /export function createCanvasInteractionController/);
  assert.match(keyboardControllerSource, /export function createCanvasKeyboardController/);
  assert.match(editorAdapterSource, /export function createEditorAdapter/);
  assert.match(editorControllerSource, /export function createEditorController/);
  assert.match(settingsSchemaSource, /export function normalizeSettings/);
  assert.match(htmlExportSource, /export function buildStandaloneExportHtml/);
  assert.match(overlayControllerSource, /export function createOverlayController/);
  assert.match(pdfStorageSource, /export class PdfOverlayStorage/);
  assert.match(historySource, /export function createHistoryManager/);
  assert.match(settingsControllerSource, /export function createSettingsController/);
  assert.match(appShellSource, /export function createAppShellController/);
  assert.match(appShellSource, /🛠️ Fitur & Cara Penggunaan/);
  assert.match(dialogSource, /export function createDialogLifecycle/);
  assert.doesNotMatch(feedbackSource, /\.innerHTML\s*=/);
  assert.match(canvasRendererSource, /element\.tabIndex = 0/);
  assert.match(canvasInteractionsSource, /snapSiblings/);
  assert.match(appSource, /function destroyApp\(\)/);
  assert.match(formatToolbarSource, /export function createFormatToolbarController/);
  assert.doesNotMatch(html, /import \{ APP_CONFIG \}|const AppState|function renderDataDariJSON/);
  assert.doesNotMatch(html, /function validateDocumentData\s*\(/);
  assert.doesNotMatch(html, /function normalizeSettings\s*\(/);
  assert.doesNotMatch(html, /itemsHtml\s*\+=|pageDiv\.innerHTML/);
  assert.doesNotMatch(html, /function (?:initDragAndDrop|initInlineTextEditing|initResizeHandler)\s*\(/);
  assert.doesNotMatch(html, /undoStack|redoStack|hasPendingTextUndo|lastCommittedState/);
  assert.doesNotMatch(html, /function (?:showFormatToolbar|hideFormatToolbar|applyTextFormat)\s*\(/);
  assert.doesNotMatch(html, /function (?:validateJsonInputLive|createTextareaEditorFallback|getLineAndColumnFromPosition)\s*\(/);
  assert.doesNotMatch(html, /function (?:updateOverlaySettings|handlePdfUpload|deleteUploadedPdf|updateOpacityBadge)\s*\(/);
  assert.doesNotMatch(html, /function (?:collectCurrentSettings|applySettings|saveAllSettingsToStorage|updateCalibrationOffsets|importSettings)\s*\(/);
  assert.doesNotMatch(html, /function (?:toggleTheme|syncThemeButtonState|showHelpModal|toggleEditorFullscreen|handleEscapeKey)\s*\(/);
  assert.doesNotMatch(appSource, /function (?:validateDocumentData|normalizeSettings|initDragAndDrop|initInlineTextEditing|initResizeHandler)\s*\(/);
  assert.doesNotMatch(appSource, /function (?:showFormatToolbar|hideFormatToolbar|applyTextFormat|validateJsonInputLive|createTextareaEditorFallback|getLineAndColumnFromPosition)\s*\(/);
  assert.doesNotMatch(appSource, /function (?:updateOverlaySettings|handlePdfUpload|deleteUploadedPdf|updateOpacityBadge|collectCurrentSettings|applySettings|saveAllSettingsToStorage|updateCalibrationOffsets|importSettings)\s*\(/);
  assert.doesNotMatch(appSource, /function (?:toggleTheme|syncThemeButtonState|showHelpModal|toggleEditorFullscreen|handleEscapeKey)\s*\(/);
  assert.doesNotMatch(html, /\b(?:loadSettings|saveSettings|normalizeSettings)\b/);
  assert.doesNotMatch(html, /\son(?:click|change|input|dblclick)=/i);

  console.log('Kartesian regression checks: PASS');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
