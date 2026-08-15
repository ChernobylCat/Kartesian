import { createDialogLifecycle } from './dialog.mjs';

const TOAST_TYPES = new Set(['success', 'error', 'warning', 'info']);
let dialogSequence = 0;

export function showToast(message, type = 'info', duration = 3500, documentRef = document) {
  const container = documentRef.getElementById('toastContainer');
  if (!container) return;

  const normalizedType = TOAST_TYPES.has(type) ? type : 'info';
  while (container.children.length >= 5) container.firstElementChild?.remove();

  const toast = documentRef.createElement('div');
  toast.className = `toast toast-${normalizedType}`;
  toast.setAttribute('role', normalizedType === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', normalizedType === 'error' ? 'assertive' : 'polite');
  toast.setAttribute('aria-atomic', 'true');
  toast.textContent = String(message);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function showConfirm(message, title = 'Konfirmasi', documentRef = document) {
  return new Promise(resolve => {
    const sequence = ++dialogSequence;
    const overlay = documentRef.createElement('div');
    overlay.className = 'modal-overlay';
    const card = documentRef.createElement('div');
    card.className = 'modal-card';
    const titleElement = documentRef.createElement('h3');
    titleElement.id = `confirmDialogTitle-${sequence}`;
    titleElement.textContent = String(title);
    const messageElement = documentRef.createElement('p');
    messageElement.id = `confirmDialogDescription-${sequence}`;
    messageElement.textContent = String(message);
    const actions = documentRef.createElement('div');
    actions.className = 'modal-actions';
    const cancelButton = documentRef.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-outline';
    cancelButton.textContent = 'Batal';
    const confirmButton = documentRef.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'btn btn-primary';
    confirmButton.textContent = 'Konfirmasi';
    actions.append(cancelButton, confirmButton);
    card.append(titleElement, messageElement, actions);
    card.setAttribute('aria-labelledby', titleElement.id);
    card.setAttribute('aria-describedby', messageElement.id);
    overlay.appendChild(card);
    documentRef.body.appendChild(overlay);

    let settled = false;
    let dialogLifecycle = null;
    const finish = result => {
      if (settled) return;
      settled = true;
      overlay.remove();
      dialogLifecycle?.destroy();
      resolve(result);
    };

    confirmButton.addEventListener('click', () => finish(true));
    cancelButton.addEventListener('click', () => finish(false));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) finish(false);
    });
    dialogLifecycle = createDialogLifecycle({
      documentRef,
      dialog: card,
      initialFocus: cancelButton,
      onEscape: () => finish(false)
    });
  });
}
