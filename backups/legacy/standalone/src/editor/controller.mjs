import { createEditorAdapter } from './adapter.mjs';

export function getLineAndColumnFromPosition(text, position) {
  let line = 1;
  let column = 1;
  for (let index = 0; index < Math.min(position, text.length); index++) {
    if (text[index] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

export function analyzeEditorText(text, { parseDocument, activePdfPageCount = 0 }) {
  if (!text.trim()) {
    return {
      valid: false,
      severity: 'error',
      message: '❌ JSON tidak boleh kosong.',
      annotations: [],
    };
  }

  try {
    const data = parseDocument(text);
    const warnings = [];
    if (activePdfPageCount > 0) {
      data.forEach((entry, index) => {
        if (entry.pages.length > activePdfPageCount) {
          const title = entry.title || entry.name || entry.debitur || `Dokumen ${index + 1}`;
          warnings.push(
            `Dokumen ke-${index + 1} ("${title}") mendefinisikan ${entry.pages.length} halaman, sedangkan PDF aktif hanya memiliki ${activePdfPageCount} halaman.`,
          );
        }
      });
    }

    if (warnings.length > 0) {
      return {
        valid: true,
        severity: 'warning',
        message: `⚠️ Peringatan Kecocokan Halaman:\n${warnings.join('\n')}`,
        annotations: [],
        data,
      };
    }

    return {
      valid: true,
      severity: 'success',
      message:
        '✅ Format JSON & Skema Valid' +
        (activePdfPageCount > 0 ? ` (panduan aktif: ${activePdfPageCount} halaman)` : ''),
      annotations: [],
      data,
    };
  } catch (error) {
    const message = error.message;
    let line = 1;
    let column = 1;
    const positionMatch = message.match(/at position (\d+)/);
    if (positionMatch) {
      ({ line, column } = getLineAndColumnFromPosition(
        text,
        Number.parseInt(positionMatch[1], 10),
      ));
    } else {
      const lineMatch = message.match(/at line (\d+) column (\d+)/);
      if (lineMatch) {
        line = Number.parseInt(lineMatch[1], 10);
        column = Number.parseInt(lineMatch[2], 10);
      }
    }

    const showCoordinates = Boolean(positionMatch) || message.includes('JSON.parse');
    return {
      valid: false,
      severity: 'error',
      message: `❌ Kesalahan: ${message}${showCoordinates ? ` (Baris ${line}, Kolom ${column})` : ''}`,
      annotations: [{ row: line - 1, column: column - 1, text: message, type: 'error' }],
    };
  }
}

const STATUS_STYLES = {
  error: { backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
  warning: { backgroundColor: '#fffbeb', color: '#854d0e', border: '1px solid #fef08a' },
  success: { backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' },
};

export function createEditorController({
  documentRef = document,
  windowRef = window,
  parseDocument,
  getActivePdfPageCount = () => 0,
  isSilentUpdate = () => false,
  onSave = () => {},
  onValidInput = () => {},
  onFallback = () => {},
  renderDelay = 400,
}) {
  let editor = null;
  let changeHandler = null;
  let renderTimer = null;

  function setOutputActionsEnabled(enabled) {
    ['btnPrint', 'btnExportHtml'].forEach((id) => {
      const button = documentRef.getElementById(id);
      if (button) button.disabled = !enabled;
    });
    documentRef.getElementById('printContainer')?.classList.toggle('preview-invalid', !enabled);
  }

  function validate(text = editor?.getValue() ?? '') {
    const result = analyzeEditorText(text, {
      parseDocument,
      activePdfPageCount: getActivePdfPageCount(),
    });
    const statusElement = documentRef.getElementById('jsonValidationStatus');
    if (statusElement) {
      Object.assign(statusElement.style, STATUS_STYLES[result.severity]);
      statusElement.style.display = 'block';
      statusElement.style.whiteSpace = result.severity === 'warning' ? 'pre-line' : '';
      statusElement.textContent = result.message;
    }
    if (editor) {
      if (result.annotations.length > 0) editor.session.setAnnotations(result.annotations);
      else editor.session.clearAnnotations();
    }
    setOutputActionsEnabled(result.valid);
    return result.valid;
  }

  function init(initialValue, { darkMode = false } = {}) {
    const editorElement = documentRef.getElementById('jsonInputEditor');
    const textarea = documentRef.getElementById('jsonInput');
    if (!editorElement || !textarea) throw new Error('Elemen editor JSON tidak ditemukan.');

    const adapter = createEditorAdapter({ windowRef, editorElement, textarea, darkMode });
    editor = adapter.editor;
    editor.session.setMode('ace/mode/json');
    editor.session.setUseWorker(false);
    editor.setValue(initialValue, -1);
    textarea.value = initialValue;
    if (adapter.fallback) onFallback();

    changeHandler = () => {
      const value = editor.getValue();
      textarea.value = value;
      onSave();
      const valid = validate(value);
      windowRef.clearTimeout(renderTimer);
      renderTimer = null;
      if (!isSilentUpdate() && valid) {
        renderTimer = windowRef.setTimeout(() => {
          renderTimer = null;
          onValidInput(value);
        }, renderDelay);
      }
    };
    editor.session.on('change', changeHandler);
    validate(initialValue);
    return editor;
  }

  function beautify() {
    if (!editor) return false;
    try {
      editor.setValue(JSON.stringify(JSON.parse(editor.getValue()), null, 2), -1);
      return true;
    } catch {
      return false;
    }
  }

  function destroy() {
    windowRef.clearTimeout(renderTimer);
    renderTimer = null;
    if (editor && changeHandler) editor.session.off?.('change', changeHandler);
    editor?.destroy?.();
    editor = null;
    changeHandler = null;
  }

  return { beautify, destroy, getEditor: () => editor, init, validate };
}
