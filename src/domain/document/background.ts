import type { Paper } from './paper';
import { t } from '@/i18n/core';

export type ImageSize = { width: number; height: number };
type Rect = { x: number; y: number; width: number; height: number };

/**
 * Coordinate space of detector results: the PDF page stretched to 210 × 330. Both
 * detectors (browser and the Python service) and saved candidates use it, whatever the
 * sheet size, so it is a storage contract. Map it to the sheet only where it is used.
 */
export const DETECTOR_SPACE: Readonly<Paper> = Object.freeze({ width: 210, height: 330 });

/** Matches object-fit: contain / object-position: center on the sheet. */
export function backgroundBounds(image: ImageSize, paper: Paper): Rect {
  if (
    !(image.width > 0 && image.height > 0) ||
    !Number.isFinite(image.width) ||
    !Number.isFinite(image.height)
  )
    throw new Error(t('error.backgroundSize'));
  const scale = Math.min(paper.width / image.width, paper.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (paper.width - width) / 2, y: (paper.height - height) / 2, width, height };
}

/** Maps a rectangle from detector space onto the background as drawn on the sheet. */
export function fitBackgroundRect<T extends Rect>(rect: T, image: ImageSize, paper: Paper): T {
  const bounds = backgroundBounds(image, paper);
  return {
    ...rect,
    x: bounds.x + (rect.x / DETECTOR_SPACE.width) * bounds.width,
    y: bounds.y + (rect.y / DETECTOR_SPACE.height) * bounds.height,
    width: (rect.width / DETECTOR_SPACE.width) * bounds.width,
    height: (rect.height / DETECTOR_SPACE.height) * bounds.height,
  };
}
