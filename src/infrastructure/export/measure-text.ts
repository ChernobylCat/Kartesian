import { estimateTextWidth, type TextMeasurer } from '@/domain/document/presentation';

const PX_TO_MM = 25.4 / 96;
let context: CanvasRenderingContext2D | null | undefined;

/**
 * Text width in mm measured with the browser's own font metrics (a 2D canvas), so
 * shrink-to-fit matches what the page renders. Falls back to an estimate where no
 * canvas exists (tests).
 */
export const measureText: TextMeasurer = (text, font) => {
  if (context === undefined)
    context =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!context) return estimateTextWidth(text, font);
  context.font = font;
  return context.measureText(text).width * PX_TO_MM;
};
