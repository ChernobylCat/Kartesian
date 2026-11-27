import type { Assets, DocumentModel, Settings } from '@/domain/document/model';

export type Candidate = {
  id: string;
  pageNumber: number;
  source: string;
  label: string;
  key: string;
  placeholder: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};
export type PdfData = {
  pages: string[];
  candidates: Candidate[];
  bytes: Uint8Array | null;
  fileName: string;
};
export const emptyPdf = (): PdfData => ({ pages: [], candidates: [], bytes: null, fileName: '' });
export type Workspace = {
  schemaVersion: 2;
  document: DocumentModel;
  assets: Assets;
  settings: Settings;
  pdf: PdfData;
  revision: number;
  migratedAt?: string;
};
export interface WorkspaceRepository {
  load(): Promise<Workspace | null>;
  save(workspace: Workspace): Promise<void>;
  close(): void;
}
export type OutputSnapshot = {
  document: DocumentModel;
  assets: Assets;
  settings: Settings;
  pdf: PdfData;
};
