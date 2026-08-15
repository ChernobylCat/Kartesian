export function createTextareaEditorAdapter(editorElement, textarea) {
    editorElement.style.display = 'none';
    textarea.style.display = 'block';
    textarea.style.width = '100%';
    textarea.style.minHeight = '360px';
    textarea.style.padding = '12px';
    textarea.style.border = '1px solid var(--editor-border)';
    textarea.style.background = 'var(--editor-bg)';
    textarea.style.color = 'var(--text-heading)';
    textarea.style.fontFamily = 'Consolas, monospace';
    textarea.style.resize = 'vertical';

    const changeHandlers = new Set();
    const notifyChange = () => changeHandlers.forEach(handler => handler());
    textarea.addEventListener('input', notifyChange);

    return {
        session: {
            on(eventName, handler) {
                if (eventName === 'change') changeHandlers.add(handler);
            },
            off(eventName, handler) {
                if (eventName === 'change') changeHandlers.delete(handler);
            },
            setMode() {},
            setUseWorker() {},
            clearAnnotations() {},
            setAnnotations() {}
        },
        getValue() {
            return textarea.value;
        },
        setValue(value) {
            textarea.value = String(value);
            notifyChange();
        },
        getCursorPosition() {
            return { row: 0, column: 0 };
        },
        moveCursorToPosition() {},
        setTheme() {},
        resize() {},
        focus() {
            textarea.focus();
        },
        destroy() {
            textarea.removeEventListener('input', notifyChange);
            changeHandlers.clear();
        }
    };
}

export function createEditorAdapter({
    windowRef = window,
    editorElement,
    textarea,
    darkMode = false
}) {
    if (windowRef.ace?.edit) {
        const editor = windowRef.ace.edit(editorElement.id);
        editor.setTheme(darkMode ? 'ace/theme/tomorrow_night' : 'ace/theme/chrome');
        return { editor, fallback: false };
    }

    return {
        editor: createTextareaEditorAdapter(editorElement, textarea),
        fallback: true
    };
}
