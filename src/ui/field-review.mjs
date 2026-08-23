import { createDialogLifecycle } from './dialog.mjs';

function confidenceLabel(value) {
  if (value >= 0.9) return 'Tinggi';
  if (value >= 0.75) return 'Sedang';
  return 'Rendah';
}

function sourceLabel(source) {
  if (source === 'acroform') return 'Form PDF';
  if (source === 'pymupdf-acroform') return 'Form PDF (PyMuPDF)';
  if (source === 'table-cell') return 'Sel tabel';
  if (source === 'pymupdf-table') return 'Sel tabel (PyMuPDF)';
  if (source === 'pymupdf-text') return 'Teks (PyMuPDF)';
  if (source === 'pymupdf-vector') return 'Garis/kotak (PyMuPDF)';
  if (source === 'paddleocr') return 'Hasil OCR';
  if (source === 'vector-box') return 'Kotak';
  if (source === 'text-underline') return 'Garis teks';
  return 'Garis';
}

export function isCandidateSelectedByDefault(candidate) {
  return Number(candidate?.confidence) >= 0.75;
}

export function createFieldReviewController({
  documentRef = document,
  onApply = async () => ({ addedCount: 0 }),
  onDismiss = async () => {},
  confirmDismiss = () => Promise.resolve(false),
  showToast = () => {},
  isPreviewVisible = () => true
} = {}) {
  let candidates = [];
  let lifecycle = null;
  let dialogLifecycle = null;
  let activeOverlay = null;

  const element = id => documentRef.getElementById(id);

  function closeDialog() {
    activeOverlay?.remove();
    activeOverlay = null;
    dialogLifecycle?.destroy();
    dialogLifecycle = null;
  }

  function updateButton() {
    const button = element('btnReviewPdfFields');
    if (!button) return;
    button.hidden = candidates.length === 0;
    button.disabled = candidates.length === 0;
    const count = button.querySelector('[data-field-count]');
    if (count) count.textContent = String(candidates.length);
  }

  function renderPreview() {
    documentRef.querySelectorAll('.pdf-field-suggestion-layer').forEach(layer => layer.remove());
    if (!candidates.length || !isPreviewVisible()) return;
    documentRef.querySelectorAll('.print-page').forEach(page => {
      const pageNumber = Number.parseInt(page.querySelector('.page-overlay-guide')?.dataset.pdfPage, 10) || 1;
      const pageCandidates = candidates.filter(candidate => candidate.pageNumber === pageNumber);
      if (!pageCandidates.length) return;
      const layer = documentRef.createElement('div');
      layer.className = 'pdf-field-suggestion-layer no-print';
      layer.setAttribute('aria-hidden', 'true');
      pageCandidates.forEach(candidate => {
        const box = documentRef.createElement('div');
        box.className = `pdf-field-suggestion pdf-field-confidence-${confidenceLabel(candidate.confidence).toLowerCase()}`;
        box.style.left = `${candidate.x}mm`;
        box.style.top = `${candidate.y}mm`;
        box.style.width = `${candidate.width}mm`;
        box.style.height = `${candidate.height}mm`;
        box.title = `${candidate.label} — confidence ${Math.round(candidate.confidence * 100)}%`;
        const label = documentRef.createElement('span');
        label.textContent = candidate.placeholder;
        box.appendChild(label);
        layer.appendChild(box);
      });
      page.appendChild(layer);
    });
  }

  function createCandidateRow(candidate) {
    const row = documentRef.createElement('div');
    row.className = 'field-review-row';
    row.dataset.candidateId = candidate.id;

    const checkbox = documentRef.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isCandidateSelectedByDefault(candidate);
    checkbox.dataset.fieldSelect = candidate.id;
    checkbox.setAttribute('aria-label', `Pilih kandidat ${candidate.label}`);

    const copy = documentRef.createElement('span');
    copy.className = 'field-review-copy';
    const heading = documentRef.createElement('span');
    heading.className = 'field-review-heading';
    const name = documentRef.createElement('strong');
    name.textContent = candidate.label;
    const badge = documentRef.createElement('small');
    badge.className = `field-confidence-badge confidence-${confidenceLabel(candidate.confidence).toLowerCase()}`;
    badge.textContent = `${confidenceLabel(candidate.confidence)} · ${Math.round(candidate.confidence * 100)}%`;
    heading.append(name, badge);

    const meta = documentRef.createElement('small');
    meta.className = 'field-review-meta';
    meta.textContent = `${sourceLabel(candidate.source)} · X ${candidate.x} mm · Y ${candidate.y} mm`;

    const input = documentRef.createElement('input');
    input.type = 'text';
    input.value = candidate.placeholder;
    input.dataset.fieldPlaceholder = candidate.id;
    input.maxLength = 120;
    input.setAttribute('aria-label', `Placeholder untuk ${candidate.label}`);
    copy.append(heading, meta, input);
    row.append(checkbox, copy);
    return row;
  }

  function openDialog() {
    if (!candidates.length || activeOverlay) return;
    const overlay = documentRef.createElement('div');
    overlay.className = 'modal-overlay field-review-overlay';
    const card = documentRef.createElement('div');
    card.className = 'modal-card field-review-modal';

    const title = documentRef.createElement('h3');
    title.id = 'fieldReviewTitle';
    title.textContent = 'Tinjau kandidat field PDF';
    const description = documentRef.createElement('p');
    description.id = 'fieldReviewDescription';
    description.textContent = 'Pilih dan ubah placeholder sebelum diterapkan ke halaman yang sama pada seluruh debitur.';

    const list = documentRef.createElement('div');
    list.className = 'field-review-list';
    let currentPage = null;
    candidates.forEach(candidate => {
      if (candidate.pageNumber !== currentPage) {
        currentPage = candidate.pageNumber;
        const pageHeading = documentRef.createElement('h4');
        pageHeading.textContent = `Halaman ${currentPage}`;
        list.appendChild(pageHeading);
      }
      list.appendChild(createCandidateRow(candidate));
    });

    const actions = documentRef.createElement('div');
    actions.className = 'modal-actions field-review-actions';
    const cancelButton = documentRef.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-outline';
    cancelButton.textContent = 'Batal';
    const dismissButton = documentRef.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'btn btn-outline field-dismiss-button';
    dismissButton.textContent = 'Abaikan Semua';
    const applyButton = documentRef.createElement('button');
    applyButton.type = 'button';
    applyButton.className = 'btn btn-primary';
    applyButton.textContent = 'Terapkan Terpilih';
    actions.append(cancelButton, dismissButton, applyButton);
    card.append(title, description, list, actions);
    card.setAttribute('aria-labelledby', title.id);
    card.setAttribute('aria-describedby', description.id);
    overlay.appendChild(card);
    documentRef.body.appendChild(overlay);
    activeOverlay = overlay;

    const setBusy = busy => {
      [cancelButton, dismissButton, applyButton].forEach(button => { button.disabled = busy; });
      applyButton.textContent = busy ? 'Menerapkan…' : 'Terapkan Terpilih';
    };

    cancelButton.addEventListener('click', closeDialog);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeDialog();
    });
    dismissButton.addEventListener('click', async () => {
      if (!await confirmDismiss('Abaikan seluruh kandidat hasil scan PDF ini?')) return;
      setBusy(true);
      try {
        await onDismiss(candidates.map(candidate => candidate.id));
        closeDialog();
        showToast('Kandidat field diabaikan.', 'info');
      } catch (error) {
        setBusy(false);
        showToast(`Kandidat tidak dapat dihapus: ${error.message}`, 'error', 6000);
      }
    });
    applyButton.addEventListener('click', async () => {
      const selected = candidates.filter(candidate => {
        return card.querySelector(`[data-field-select="${candidate.id}"]`)?.checked;
      }).map(candidate => ({
        ...candidate,
        placeholder: card.querySelector(`[data-field-placeholder="${candidate.id}"]`)?.value.trim() || candidate.placeholder
      }));
      if (!selected.length) {
        showToast('Pilih minimal satu kandidat field.', 'warning');
        return;
      }
      setBusy(true);
      try {
        const result = await onApply(selected);
        closeDialog();
        showToast(
          result.addedCount > 0
            ? `${result.addedCount} placeholder berhasil diterapkan.`
            : 'Semua placeholder terpilih sudah ada pada dokumen.',
          result.addedCount > 0 ? 'success' : 'info'
        );
      } catch (error) {
        setBusy(false);
        showToast(`Placeholder tidak dapat diterapkan: ${error.message}`, 'error', 6000);
      }
    });

    dialogLifecycle = createDialogLifecycle({
      documentRef,
      dialog: card,
      initialFocus: list.querySelector('input'),
      returnFocus: element('btnReviewPdfFields'),
      onEscape: closeDialog
    });
  }

  function setCandidates(nextCandidates = []) {
    candidates = Array.isArray(nextCandidates) ? nextCandidates.map(candidate => ({ ...candidate })) : [];
    updateButton();
    renderPreview();
    if (!candidates.length) closeDialog();
  }

  function init() {
    lifecycle?.abort();
    lifecycle = new AbortController();
    element('btnReviewPdfFields')?.addEventListener('click', openDialog, { signal: lifecycle.signal });
    updateButton();
    renderPreview();
  }

  function destroy() {
    closeDialog();
    lifecycle?.abort();
    lifecycle = null;
    documentRef.querySelectorAll('.pdf-field-suggestion-layer').forEach(layer => layer.remove());
  }

  return { destroy, init, openDialog, renderPreview, setCandidates };
}
