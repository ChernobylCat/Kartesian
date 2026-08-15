export function createContextMenuController({
    documentRef = document,
    windowRef = window,
    root,
    selectTarget,
    duplicateSelection,
    deleteSelection,
    toggleLock,
    changeLayer
}) {
    let lifecycle = null;
    const menu = documentRef.getElementById('canvasContextMenu');

    function close() { menu.hidden = true; }
    function open(event, element) {
        event.preventDefault();
        if (!element.classList.contains('selected-item')) selectTarget(element);
        menu.hidden = false;
        const maxX = windowRef.innerWidth - menu.offsetWidth - 8;
        const maxY = windowRef.innerHeight - menu.offsetHeight - 8;
        menu.style.left = `${Math.max(8, Math.min(event.clientX, maxX))}px`;
        menu.style.top = `${Math.max(8, Math.min(event.clientY, maxY))}px`;
        menu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
    }

    function init() {
        lifecycle?.abort(); lifecycle = new AbortController();
        root.addEventListener('contextmenu', event => {
            const element = event.target.closest('.data-item');
            if (element) open(event, element);
            else close();
        }, { signal: lifecycle.signal });
        menu.addEventListener('click', event => {
            const action = event.target.closest('[data-context-action]')?.dataset.contextAction;
            if (!action) return;
            if (action === 'duplicate') duplicateSelection();
            else if (action === 'delete') deleteSelection();
            else if (action === 'lock') toggleLock();
            else if (action === 'front' || action === 'back') changeLayer(action);
            close();
        }, { signal: lifecycle.signal });
        documentRef.addEventListener('pointerdown', event => {
            if (!event.target.closest('#canvasContextMenu')) close();
        }, { signal: lifecycle.signal });
        windowRef.addEventListener('keydown', event => {
            if (event.key === 'Escape') close();
        }, { signal: lifecycle.signal });
    }
    function destroy() { lifecycle?.abort(); lifecycle = null; close(); }
    return { close, destroy, init };
}
