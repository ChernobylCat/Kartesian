'use client';
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { EditorStore, EditorState } from './store/editor-store';
import type { Command } from '@/domain/document/commands';

export const EditorContext = createContext<{
  store: EditorStore;
  flush: () => Promise<void>;
} | null>(null);
export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) throw new Error('Editor provider tidak tersedia.');
  return context;
}
export function useEditorState<T>(selector: (state: EditorState) => T) {
  return useStore(useEditor().store, selector);
}
export function useCommand() {
  const { store } = useEditor();
  return (command: Command, group?: string) => {
    try {
      store.getState().command(command, group);
    } catch (error) {
      store.setState({ message: error instanceof Error ? error.message : 'Perintah gagal.' });
    }
  };
}
