'use client';
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { EditorStore, EditorState } from './store/editor-store';
import type { Command } from '@/domain/document/commands';
import { measureSelection } from './measure-items';
import { errorMessage } from '@/application/error-message';
import { t } from '@/i18n/core';

export const EditorContext = createContext<{
  store: EditorStore;
  flush: () => Promise<void>;
} | null>(null);
export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) throw new Error('EditorContext provider is missing.');
  return context;
}
export function useEditorState<T>(selector: (state: EditorState) => T) {
  return useStore(useEditor().store, selector);
}
/**
 * Runs a command, reporting failures as a toast. Returns whether it was applied so
 * callers can skip follow-up work (selection, focus) after a rejected command.
 */
export function useCommand() {
  const { store } = useEditor();
  return (command: Command, group?: string) => {
    try {
      store
        .getState()
        .command(
          command.type === 'align' ? { ...command, sizes: measureSelection(command.ids) } : command,
          group,
        );
      return true;
    } catch (error) {
      store.setState({ message: errorMessage(error, t('error.command')) });
      return false;
    }
  };
}
