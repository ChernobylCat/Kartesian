import { z } from 'zod';
import { formatNumber, t } from '@/i18n/core';

/** Sheet size in millimetres. Orientation is implied by which side is longer. */
export type Paper = { width: number; height: number };

/** Portrait dimensions of the supported presets. */
export const PAPER_PRESETS = [
  { id: 'a3', label: 'A3', width: 297, height: 420 },
  { id: 'a4', label: 'A4', width: 210, height: 297 },
  { id: 'a5', label: 'A5', width: 148, height: 210 },
  { id: 'b5', label: 'B5', width: 176, height: 250 },
  { id: 'f4', label: 'F4', width: 210, height: 330 },
  { id: 'letter', label: 'Letter', width: 215.9, height: 279.4 },
  { id: 'legal', label: 'Legal', width: 215.9, height: 355.6 },
] as const;
export type PaperPresetId = (typeof PAPER_PRESETS)[number]['id'];

/** Workspaces created before paper sizes existed were always F4. */
export const DEFAULT_PAPER: Paper = Object.freeze({ width: 210, height: 330 });
/** Range accepted for each side of a custom sheet. */
export const PAPER_RANGE = Object.freeze({ min: 50, max: 500 });

const side = z.number().finite().min(PAPER_RANGE.min).max(PAPER_RANGE.max);
export const paperSchema = z.object({ width: side, height: side });

export const paperOf = (document: { paper?: Paper }): Paper => document.paper ?? DEFAULT_PAPER;
export const samePaper = (a: Paper, b: Paper) => a.width === b.width && a.height === b.height;
export const isLandscape = (paper: Paper) => paper.width > paper.height;
/** Same sheet turned 90°. */
export const rotatePaper = (paper: Paper): Paper => ({ width: paper.height, height: paper.width });

/** The preset this sheet matches in either orientation, if any. */
export function paperPreset(paper: Paper) {
  return PAPER_PRESETS.find(
    (preset) =>
      samePaper(preset, paper) || samePaper(preset, { width: paper.height, height: paper.width }),
  );
}
export function presetPaper(id: PaperPresetId, landscape: boolean): Paper {
  const preset = PAPER_PRESETS.find((entry) => entry.id === id)!;
  const portrait = { width: preset.width, height: preset.height };
  return landscape ? rotatePaper(portrait) : portrait;
}

const mm = (value: number) => formatNumber(value);
/** Size only, e.g. "210 × 297 mm". */
export const paperSize = (paper: Paper) => `${mm(paper.width)} × ${mm(paper.height)} mm`;
/** Human-readable name, e.g. "A4 lanskap · 297 × 210 mm" or "Kustom · 200 × 300 mm". */
export function paperLabel(paper: Paper) {
  const preset = paperPreset(paper);
  const name = preset
    ? isLandscape(paper)
      ? t('paper.landscapeName', { name: preset.label })
      : preset.label
    : t('paper.custom');
  return `${name} · ${paperSize(paper)}`;
}
