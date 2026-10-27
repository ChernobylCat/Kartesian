import type { WorkspaceRepository } from './ports';
import type { EditorStore } from '@/features/editor/store/editor-store';

export function attachAutosave(store: EditorStore, repository: WorkspaceRepository) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain = Promise.resolve();
  let stopped = false;
  function flush() {
    clearTimeout(timer);
    chain = chain
      .catch(() => {})
      .then(async () => {
        const state = store.getState();
        if (stopped || state.readonly || state.error || state.saveStatus === 'saved') return;
        const snapshot = state.workspace;
        store.setState({ saveStatus: 'saving' });
        try {
          await repository.save(snapshot);
          if (store.getState().workspace.revision === snapshot.revision)
            store.setState({ saveStatus: 'saved' });
          else store.setState({ saveStatus: 'pending' });
        } catch (error) {
          store.setState({
            saveStatus: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      });
    return chain;
  }
  const unsubscribe = store.subscribe((state, previous) => {
    if (
      state.workspace.revision !== previous.workspace.revision ||
      (previous.error && !state.error)
    ) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void flush().catch(() => {});
      }, 500);
    }
  });
  return {
    flush,
    destroy() {
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
    },
  };
}
