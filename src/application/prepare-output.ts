import type { OutputSnapshot } from './ports';
import { validateModel } from '@/domain/document/model';

export function snapshotOutput(workspace: OutputSnapshot): OutputSnapshot {
  validateModel(workspace.document, workspace.assets);
  return {
    document: workspace.document,
    assets: workspace.assets,
    settings: { ...workspace.settings },
    pdf: workspace.pdf,
  };
}
export async function waitForAssets(root: ParentNode) {
  await document.fonts.ready;
  await Promise.all(
    [...root.querySelectorAll('img')].map(async (image) => {
      if (image.complete && image.naturalWidth > 0) return;
      await image.decode();
    }),
  );
}
