import type { Candidate } from '@/application/ports';
import { fitBackgroundRect } from '@/domain/document/background';
import type { Paper } from '@/domain/document/paper';
import { t } from '@/i18n/core';

/** Maps candidates from detector space onto the uploaded PDF as drawn on the sheet. */
export async function fitPdfCandidates(candidates: Candidate[], pages: string[], paper: Paper) {
  const sizes = new Map<number, { width: number; height: number }>();
  for (const number of new Set(candidates.map((candidate) => candidate.pageNumber))) {
    const source = pages[number - 1];
    if (!source) throw new Error(t('error.backgroundPageMissing', { page: number }));
    const image = new Image();
    image.src = source;
    await image.decode();
    sizes.set(number, { width: image.naturalWidth, height: image.naturalHeight });
  }
  return candidates.map((candidate) =>
    fitBackgroundRect(candidate, sizes.get(candidate.pageNumber)!, paper),
  );
}
