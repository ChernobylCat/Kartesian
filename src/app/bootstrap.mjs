export function createBootstrapController({
    documentRef = document,
    windowRef = window,
    settingsController,
    historyManager,
    editorController,
    overlayController,
    defaultJson,
    setEditor,
    render,
    syncTheme,
    onError = () => {}
}) {
    let lifecycle = null;
    let started = false;

    function start() {
        if (started) return;
        started = true;
        try {
            const settings = settingsController.load();
            const fallbackJson = typeof defaultJson === 'function' ? defaultJson() : defaultJson;
            const initialJson = settings?.jsonInput || fallbackJson;
            historyManager.reset(initialJson);
            const editor = editorController.init(initialJson, {
                darkMode: documentRef.body.classList.contains('dark')
            });
            setEditor(editor);
            settingsController.apply(settings ?? {}, { includeJson: false });
            render();
            syncTheme();
            overlayController.hydrate(settings?.overlayDoc);
            return editor;
        } catch (error) {
            started = false;
            onError(error);
            return null;
        }
    }

    function init() {
        lifecycle?.abort();
        lifecycle = new AbortController();
        if (documentRef.readyState !== 'loading') start();
        else documentRef.addEventListener('DOMContentLoaded', start, { once: true, signal: lifecycle.signal });
    }

    function destroy() {
        lifecycle?.abort();
        lifecycle = null;
        started = false;
        editorController.destroy();
        settingsController.destroy();
        overlayController.destroy();
    }

    return { destroy, init, start };
}
