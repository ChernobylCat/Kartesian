'use client';
import { useEffect } from 'react';
import { locate } from '@/domain/document/model';
import { moveSelection, type Align } from '@/domain/document/commands';
import { useEditor } from '../context';
import { measureSelection } from '../measure-items';
import { t } from '@/i18n/core';

export function useKeyboard(print: () => void, help: () => void) {
  const { store } = useEditor();
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === 'Escape') {
        store.getState().select([]);
        return;
      }
      if (
        target.closest(
          'input,textarea,select,[contenteditable="true"],[role="slider"],.ace_editor,dialog',
        )
      )
        return;
      const state = store.getState();
      const meta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (meta && key === 'p') {
        event.preventDefault();
        print();
        return;
      }
      if (key === 'f1' || key === '?') {
        event.preventDefault();
        help();
        return;
      }
      if (state.readonly || state.frozen) return;
      try {
        if (meta && key === 'z') {
          event.preventDefault();
          if (event.shiftKey) state.redo();
          else state.undo();
          return;
        }
        if (meta && key === 'y') {
          event.preventDefault();
          state.redo();
          return;
        }
        if (meta && key === 'a') {
          event.preventDefault();
          const docs = state.workspace.document.documents;
          const page = state.selected[0]
            ? locate(state.workspace.document, state.selected[0])?.page
            : (docs
                .flatMap((docEntry) => docEntry.pages)
                .find((page) => page.id === state.activePage) ?? docs[0]?.pages[0]);
          state.select(page?.items.map((item) => item.id) ?? []);
          return;
        }
        if (!state.selected.length || state.error) return;
        if (meta && key === 'g') {
          event.preventDefault();
          state.command({ type: event.shiftKey ? 'ungroup' : 'group', ids: state.selected });
          return;
        }
        if (meta && key === 'd') {
          event.preventDefault();
          state.command({ type: 'duplicate', ids: state.selected });
          return;
        }
        if (key === 'delete' || key === 'backspace') {
          event.preventDefault();
          if (confirm(t('confirm.deleteCount', { count: state.selected.length })))
            state.command({ type: 'delete', ids: state.selected });
          return;
        }
        if (event.altKey && key === 'l') {
          event.preventDefault();
          const locked = state.selected.every(
            (id) => locate(state.workspace.document, id)?.item.locked,
          );
          state.command({ type: 'patch', ids: state.selected, patch: { locked: !locked } });
          return;
        }
        const actions: Record<string, Align> = {
          a: 'left',
          h: 'hcenter',
          d: 'right',
          w: 'top',
          v: 'vcenter',
          s: 'bottom',
        };
        if (event.altKey && actions[key]) {
          event.preventDefault();
          state.command({
            type: 'align',
            ids: state.selected,
            sizes: measureSelection(state.selected),
            action:
              event.shiftKey && key === 'h'
                ? 'distribute-h'
                : event.shiftKey && key === 'v'
                  ? 'distribute-v'
                  : actions[key]!,
          });
          return;
        }
        if (event.key.startsWith('Arrow')) {
          event.preventDefault();
          const step = event.shiftKey ? 1 : 0.1;
          const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
          const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
          state.command(moveSelection(state.workspace.document, state.selected, dx, dy), 'nudge');
        }
      } catch (error) {
        store.setState({ message: error instanceof Error ? error.message : t('error.shortcut') });
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [store, print, help]);
}
