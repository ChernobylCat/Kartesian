'use client';
import { useEffect } from 'react';
import type { AddTarget } from '@/domain/document/commands';
import { locate } from '@/domain/document/model';
import { paperOf } from '@/domain/document/paper';
import {
  PASTE_OFFSET_MM,
  parseClipboard,
  prepareItemsForPaste,
  serializeClipboard,
} from '@/domain/document/clipboard';
import { errorMessage } from '@/application/error-message';
import { useEditor } from '../context';

/** Clipboard shortcuts belong to text fields while one of them has focus. */
const isEditable = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest('input,textarea,select,[contenteditable="true"],.ace_editor');

/**
 * Copy, cut and paste of selected elements through the system clipboard
 * (Ctrl/Cmd + C, X, V), so items also move between pages, documents and tabs.
 * Pasting onto the page the items came from shifts each paste a little further.
 */
export function useClipboard(target: () => AddTarget) {
  const { store } = useEditor();
  useEffect(() => {
    let lastCopy: { pageId: string; pastes: number } | null = null;

    function copy(event: ClipboardEvent, cut: boolean) {
      if (isEditable(event.target) || !event.clipboardData) return;
      const state = store.getState();
      const located = state.selected
        .map((id) => locate(state.workspace.document, id))
        .filter((value) => value !== undefined);
      if (!located.length) return;
      event.preventDefault();
      try {
        event.clipboardData.setData(
          'text/plain',
          serializeClipboard(
            located.map(({ item }) => item),
            state.workspace.assets,
          ),
        );
        lastCopy = { pageId: located[0]!.page.id, pastes: 0 };
        if (cut) state.command({ type: 'delete', ids: located.map(({ item }) => item.id) });
      } catch (error) {
        store.setState({ message: errorMessage(error) });
      }
    }

    function paste(event: ClipboardEvent) {
      if (isEditable(event.target) || !event.clipboardData) return;
      const copied = parseClipboard(event.clipboardData.getData('text/plain'));
      if (!copied) return;
      event.preventDefault();
      const state = store.getState();
      if (state.readonly || state.frozen || state.error) return;
      const destination = target();
      const samePage = !!lastCopy && destination.pageId === lastCopy.pageId;
      const offset = samePage ? PASTE_OFFSET_MM * ++lastCopy!.pastes : 0;
      const { items, assets } = prepareItemsForPaste(
        copied,
        paperOf(state.workspace.document),
        offset,
      );
      try {
        state.command({ type: 'addMany', ...destination, items }, undefined, assets);
        state.select(items.map((item) => item.id));
      } catch (error) {
        store.setState({ message: errorMessage(error) });
      }
    }

    const onCopy = (event: ClipboardEvent) => copy(event, false);
    const onCut = (event: ClipboardEvent) => copy(event, true);
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCut);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCut);
      window.removeEventListener('paste', paste);
    };
  }, [store, target]);
}
