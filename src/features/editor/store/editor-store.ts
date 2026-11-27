import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  decodeLegacy,
  encodeLegacy,
  type Settings,
  type DocumentModel,
  type Assets,
} from '@/domain/document/model';
import { execute, type Command } from '@/domain/document/commands';
import { pushHistory, type HistoryEntry } from '@/domain/document/history';
import type { Workspace, PdfData } from '@/application/ports';

export type EditorState = {
  workspace: Workspace;
  rawText: string;
  error: string | null;
  selected: string[];
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  readonly: boolean;
  saveStatus: 'saved' | 'pending' | 'saving' | 'error';
  message: string;
  activePage: string | null;
  command(command: Command, group?: string): void;
  editJson(raw: string): void;
  replace(document: DocumentModel, assets: Assets): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  settings(patch: Partial<Settings>): void;
  pdf(pdf: PdfData): void;
};
export type EditorStore = StoreApi<EditorState>;
export function createEditorStore(workspace: Workspace): EditorStore {
  let grouping: { key: string; time: number } | null = null;
  return createStore<EditorState>()((set, get) => {
    function commit(document: DocumentModel, assets = get().workspace.assets, group?: string) {
      const current = get();
      if (current.readonly) throw new Error('Workspace dibuka hanya-baca.');
      const grouped = group && grouping?.key === group && Date.now() - grouping.time < 400;
      grouping = group ? { key: group, time: Date.now() } : null;
      const validIds = new Set(
        document.debtors.flatMap((docEntry) =>
          docEntry.pages.flatMap((page) => page.items.map((item) => item.id)),
        ),
      );
      set({
        workspace: {
          ...current.workspace,
          document,
          assets,
          revision: current.workspace.revision + 1,
        },
        rawText: JSON.stringify(encodeLegacy(document, assets), null, 2),
        error: null,
        selected: current.selected.filter((id) => validIds.has(id)),
        undoStack: grouped
          ? current.undoStack
          : pushHistory(current.undoStack, current.workspace.document),
        redoStack: [],
        saveStatus: 'pending',
      });
    }
    return {
      workspace,
      rawText: JSON.stringify(encodeLegacy(workspace.document, workspace.assets), null, 2),
      error: null,
      selected: [],
      undoStack: [],
      redoStack: [],
      readonly: false,
      saveStatus: 'saved',
      message: '',
      activePage: workspace.document.debtors[0]?.pages[0]?.id ?? null,
      command(command, group) {
        const state = get();
        if (state.error) throw new Error('Perbaiki JSON sebelum mengedit canvas.');
        commit(
          execute(state.workspace.document, command, state.workspace.assets),
          undefined,
          group,
        );
      },
      editJson(rawText) {
        if (get().readonly) return;
        try {
          const result = decodeLegacy(rawText, get().workspace.document, get().workspace.assets);
          commit(result.document, result.assets, 'json-input');
          set({ rawText });
        } catch (error) {
          set({ rawText, error: error instanceof Error ? error.message : 'JSON tidak valid.' });
        }
      },
      replace(document, assets) {
        commit(document, { ...get().workspace.assets, ...assets });
        set({ selected: [] });
      },
      undo() {
        const state = get();
        const entry = state.undoStack.at(-1);
        if (!entry || state.readonly) return;
        grouping = null;
        set({
          workspace: {
            ...state.workspace,
            document: entry.document,
            revision: state.workspace.revision + 1,
          },
          rawText: JSON.stringify(encodeLegacy(entry.document, state.workspace.assets), null, 2),
          error: null,
          selected: [],
          undoStack: state.undoStack.slice(0, -1),
          redoStack: pushHistory(state.redoStack, state.workspace.document),
          saveStatus: 'pending',
        });
      },
      redo() {
        const state = get();
        const entry = state.redoStack.at(-1);
        if (!entry || state.readonly) return;
        grouping = null;
        set({
          workspace: {
            ...state.workspace,
            document: entry.document,
            revision: state.workspace.revision + 1,
          },
          rawText: JSON.stringify(encodeLegacy(entry.document, state.workspace.assets), null, 2),
          error: null,
          selected: [],
          redoStack: state.redoStack.slice(0, -1),
          undoStack: pushHistory(state.undoStack, state.workspace.document),
          saveStatus: 'pending',
        });
      },
      select(selected) {
        set({ selected });
      },
      settings(patch) {
        const state = get();
        if (state.readonly) return;
        set({
          workspace: {
            ...state.workspace,
            settings: { ...state.workspace.settings, ...patch },
            revision: state.workspace.revision + 1,
          },
          saveStatus: 'pending',
        });
      },
      pdf(pdf) {
        const state = get();
        if (state.readonly) return;
        set({
          workspace: { ...state.workspace, pdf, revision: state.workspace.revision + 1 },
          saveStatus: 'pending',
        });
      },
    };
  });
}
