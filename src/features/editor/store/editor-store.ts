import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  allItemIds,
  expandGroups,
  decodeLegacy,
  encodeLegacy,
  type Settings,
  type DocumentModel,
  type Assets,
} from '@/domain/document/model';
import { execute, type Command } from '@/domain/document/commands';
import { pushHistory, type HistoryEntry } from '@/domain/document/history';
import type { Workspace, PdfData } from '@/application/ports';
import { FULL_SCOPE, type OutputScope } from '@/domain/document/output-scope';
import type { Unit } from '@/domain/document/units';
import { t } from '@/i18n/core';

export type EditorState = {
  workspace: Workspace;
  rawText: string;
  error: string | null;
  selected: string[];
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  readonly: boolean;
  frozen: boolean;
  saveStatus: 'saved' | 'pending' | 'saving' | 'error';
  message: string;
  activePage: string | null;
  /** Part of the workspace Print and Export HTML produce; kept for this session only. */
  outputScope: OutputScope;
  /** Grid spacing in mm shown on the canvas (0 = off); a per-device preference. */
  grid: number;
  /** Items hidden on screen only (never in print or storage), for this session. */
  hidden: string[];
  /** Display unit for coordinates (stored values stay in mm); a per-device preference. */
  unit: Unit;
  command(command: Command, group?: string, assets?: Assets): void;
  editJson(raw: string): void;
  replace(document: DocumentModel, assets: Assets): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  settings(patch: Partial<Settings>): void;
  pdf(pdf: PdfData): void;
};
export type EditorStore = StoreApi<EditorState>;
/** Edits sharing a group key within this window become a single undo step. */
const GROUP_WINDOW_MS = 400;
const serialize = (document: DocumentModel, assets: Assets) =>
  JSON.stringify(encodeLegacy(document, assets), null, 2);

export function createEditorStore(workspace: Workspace): EditorStore {
  let grouping: { key: string; time: number } | null = null;
  return createStore<EditorState>()((set, get) => {
    function commit(document: DocumentModel, assets = get().workspace.assets, group?: string) {
      const current = get();
      if (current.readonly || current.frozen) throw new Error(t('store.locked'));
      const now = Date.now();
      const grouped = group && grouping?.key === group && now - grouping.time < GROUP_WINDOW_MS;
      grouping = group ? { key: group, time: now } : null;
      const validIds = allItemIds(document);
      set({
        workspace: {
          ...current.workspace,
          document,
          assets,
          revision: current.workspace.revision + 1,
        },
        rawText: serialize(document, assets),
        error: null,
        selected: current.selected.filter((id) => validIds.has(id)),
        undoStack: grouped
          ? current.undoStack
          : pushHistory(current.undoStack, current.workspace.document),
        redoStack: [],
        saveStatus: 'pending',
      });
    }
    /** Moves one snapshot between the undo and redo stacks. */
    function travel(direction: 'undo' | 'redo') {
      const state = get();
      const from = direction === 'undo' ? state.undoStack : state.redoStack;
      const to = direction === 'undo' ? state.redoStack : state.undoStack;
      const entry = from.at(-1);
      if (!entry || state.readonly || state.frozen) return;
      grouping = null;
      const remaining = from.slice(0, -1);
      const pushed = pushHistory(to, state.workspace.document);
      set({
        workspace: {
          ...state.workspace,
          document: entry.document,
          revision: state.workspace.revision + 1,
        },
        rawText: serialize(entry.document, state.workspace.assets),
        error: null,
        selected: [],
        undoStack: direction === 'undo' ? remaining : pushed,
        redoStack: direction === 'undo' ? pushed : remaining,
        saveStatus: 'pending',
      });
    }
    return {
      workspace,
      rawText: serialize(workspace.document, workspace.assets),
      error: null,
      selected: [],
      undoStack: [],
      redoStack: [],
      readonly: false,
      frozen: false,
      saveStatus: 'saved',
      message: '',
      activePage: workspace.document.documents[0]?.pages[0]?.id ?? null,
      outputScope: FULL_SCOPE,
      grid: 0,
      hidden: [],
      unit: 'mm',
      command(command, group, addedAssets) {
        const state = get();
        if (state.readonly || state.frozen) throw new Error(t('store.locked'));
        if (state.error) throw new Error(t('store.fixJsonFirst'));
        const assets = addedAssets
          ? { ...state.workspace.assets, ...addedAssets }
          : state.workspace.assets;
        commit(execute(state.workspace.document, command, assets), assets, group);
      },
      editJson(rawText) {
        if (get().readonly || get().frozen) return;
        try {
          const result = decodeLegacy(rawText, get().workspace.document, get().workspace.assets);
          commit(result.document, result.assets, 'json-input');
          set({ rawText });
        } catch (error) {
          set({ rawText, error: error instanceof Error ? error.message : t('json.invalid') });
        }
      },
      replace(document, assets) {
        commit(document, { ...get().workspace.assets, ...assets });
        set({ selected: [] });
      },
      undo() {
        travel('undo');
      },
      redo() {
        travel('redo');
      },
      select(selected) {
        set({ selected: expandGroups(get().workspace.document, selected) });
      },
      settings(patch) {
        const state = get();
        if (state.readonly || state.frozen) return;
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
        if (state.readonly || state.frozen) return;
        set({
          workspace: { ...state.workspace, pdf, revision: state.workspace.revision + 1 },
          saveStatus: 'pending',
        });
      },
    };
  });
}
