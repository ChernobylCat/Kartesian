const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
  );
}

export function createDialogLifecycle({
  documentRef = document,
  dialog,
  initialFocus = null,
  returnFocus = null,
  onEscape = () => {},
}) {
  if (!dialog) throw new Error('Elemen dialog wajib tersedia.');
  const previousFocus = returnFocus ?? documentRef.activeElement;
  const AbortControllerCtor = documentRef.defaultView?.AbortController ?? AbortController;
  const lifecycle = new AbortControllerCtor();

  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = documentRef.activeElement;
    if (!dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  documentRef.addEventListener('keydown', handleKeyDown, { signal: lifecycle.signal });
  (initialFocus ?? getFocusableElements(dialog)[0] ?? dialog).focus();

  return {
    destroy({ restoreFocus = true } = {}) {
      lifecycle.abort();
      if (restoreFocus && previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
        if (documentRef.activeElement !== previousFocus) {
          previousFocus.closest?.('[tabindex]')?.focus();
        }
      }
    },
  };
}
