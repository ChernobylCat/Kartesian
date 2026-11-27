// Commit inline text and numeric drafts synchronously before writes are frozen.
export function finishEditing() {
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active.closest('input,textarea,select,[contenteditable="true"]')
  )
    active.blur();
}
