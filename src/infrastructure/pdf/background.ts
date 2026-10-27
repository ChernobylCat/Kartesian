import type { Candidate } from '@/application/ports';
import { fitBackgroundRect } from '@/domain/document/background';

export async function fitPdfCandidates(candidates: Candidate[], pages: string[]) {
  const sizes = new Map<number, { width: number; height: number }>();
  for (const number of new Set(candidates.map((candidate) => candidate.pageNumber))) {
    const source = pages[number - 1];
    if (!source) throw new Error(`Background halaman ${number} tidak tersedia. Unggah ulang PDF.`);
    const image = new Image();
    image.src = source;
    await image.decode();
    sizes.set(number, { width: image.naturalWidth, height: image.naturalHeight });
  }
  return candidates.map((candidate) =>
    fitBackgroundRect(candidate, sizes.get(candidate.pageNumber)!),
  );
}
