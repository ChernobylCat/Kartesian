/**
 * Switching between saved workspaces and templates. The open workspace is always the
 * single "active" record the editor autosaves; switching stores a snapshot of it in
 * the library, writes the chosen workspace as the active record, and reloads.
 */
import type { Workspace, WorkspaceRepository } from './ports';
import { paperOf } from '@/domain/document/paper';
import { uid } from '@/domain/document/model';
import { backupWorkspace, IndexedWorkspaceRepository } from '@/infrastructure/storage/workspace';
import type { CurrentWorkspace, LibraryEntry, LibraryKind } from '@/infrastructure/storage/library';

/** A library entry holding a complete, checksummed copy of a workspace. */
export async function snapshotEntry(
  workspace: Workspace,
  identity: CurrentWorkspace,
  kind: LibraryKind = 'workspace',
): Promise<LibraryEntry> {
  return {
    id: identity.id,
    kind,
    name: identity.name,
    updatedAt: Date.now(),
    documents: workspace.document.documents.length,
    paper: paperOf(workspace.document),
    payload: await backupWorkspace(workspace),
  };
}

/** A copy of an entry under a new id and name (e.g. "Formulir (copy)"). */
export const copyEntry = (entry: LibraryEntry, name: string): LibraryEntry => ({
  ...entry,
  id: uid(),
  name,
  updatedAt: Date.now(),
});

/**
 * Writes `next` as the active workspace. Loading first syncs the repository's
 * storage version, so the write is not refused as a concurrent change; the editor's
 * own autosaver still holds the old version and can no longer overwrite it.
 */
export async function activateWorkspace(
  next: Workspace,
  repository: WorkspaceRepository & { close(): void } = new IndexedWorkspaceRepository(),
) {
  try {
    await repository.load().catch(() => {});
    await repository.save({ ...next, revision: 0 });
  } finally {
    repository.close();
  }
}
