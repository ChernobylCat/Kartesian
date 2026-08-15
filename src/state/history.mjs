export function createHistoryManager({ limit = 50, onChange = () => {} } = {}) {
    if (!Number.isInteger(limit) || limit < 1) {
        throw new TypeError('Batas history harus berupa bilangan bulat positif.');
    }

    const undoStack = [];
    const redoStack = [];
    let committedState = null;
    let hasPendingInputUndo = false;

    function trim(stack) {
        while (stack.length > limit) stack.shift();
    }

    function status() {
        return {
            canUndo: undoStack.length > 0,
            canRedo: redoStack.length > 0,
            undoCount: undoStack.length,
            redoCount: redoStack.length
        };
    }

    function notify() {
        onChange(status());
    }

    function reset(initialState = null) {
        undoStack.length = 0;
        redoStack.length = 0;
        committedState = initialState;
        hasPendingInputUndo = false;
        notify();
    }

    function commit(state) {
        committedState = state;
        hasPendingInputUndo = false;
    }

    function push(state) {
        if (typeof state !== 'string') return false;
        if (undoStack.at(-1) === state) return false;

        undoStack.push(state);
        trim(undoStack);
        redoStack.length = 0;
        committedState = state;
        hasPendingInputUndo = false;
        notify();
        return true;
    }

    function recordInput(currentState) {
        if (
            hasPendingInputUndo ||
            typeof currentState !== 'string' ||
            typeof committedState !== 'string' ||
            committedState === currentState
        ) {
            return false;
        }

        if (undoStack.at(-1) !== committedState) {
            undoStack.push(committedState);
            trim(undoStack);
        }
        redoStack.length = 0;
        hasPendingInputUndo = true;
        notify();
        return true;
    }

    function undo(currentState) {
        if (undoStack.length === 0 || typeof currentState !== 'string') return null;
        redoStack.push(currentState);
        trim(redoStack);
        const targetState = undoStack.pop();
        committedState = targetState;
        hasPendingInputUndo = false;
        notify();
        return targetState;
    }

    function redo(currentState) {
        if (redoStack.length === 0 || typeof currentState !== 'string') return null;
        undoStack.push(currentState);
        trim(undoStack);
        const targetState = redoStack.pop();
        committedState = targetState;
        hasPendingInputUndo = false;
        notify();
        return targetState;
    }

    return { commit, push, recordInput, redo, reset, status, undo };
}
