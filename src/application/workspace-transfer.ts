import type { EditorStore } from '@/features/editor/store/editor-store';
import { t } from '@/i18n/core';

const transferInProgress = () => t('transfer.inProgress');

/**
 * Freezes edits, commits inline drafts and saves; resolves to an unfreeze callback.
 * Freezing is separate from ownership: the owner must still be able to save.
 */
export async function freezeAndFlush(
  store: EditorStore,
  flush: () => Promise<void>,
  finishEditing?: () => void,
) {
  if (store.getState().frozen) throw new Error(transferInProgress());
  // Blurring a field commits its draft synchronously and may start another transfer.
  finishEditing?.();
  const state = store.getState();
  if (state.frozen) throw new Error(transferInProgress());
  if (state.error) throw new Error(t('transfer.fixJson'));
  store.setState({ frozen: true });
  try {
    await flush();
    const latest = store.getState();
    if (latest.error || (!latest.readonly && latest.saveStatus !== 'saved'))
      throw new Error(t('transfer.unsaved'));
  } catch (error) {
    store.setState({ frozen: false });
    throw error;
  }
  return () => store.setState({ frozen: false });
}
