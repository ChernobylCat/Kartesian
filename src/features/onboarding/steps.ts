import type { MessageKey } from '@/i18n/core';
import type { TourKind } from './onboarding';

/**
 * Elements the tours point at. Most carry a matching `data-tour` attribute in the
 * editor markup; the canvas step uses the first page of the first document.
 */
export const TOUR_TARGETS = {
  paper: '[data-tour="paper"]',
  pdf: '[data-tour="pdf"]',
  add: '[data-tour="add"]',
  elements: '[data-tour="elements"]',
  canvas: '#printContainer .page-wrapper',
  merge: '[data-tour="merge"]',
  workspaces: '[data-tour="workspaces"]',
  layers: '[data-tour="layers"]',
  output: '[data-tour="output"]',
} as const;

export type TourTarget = keyof typeof TOUR_TARGETS;

export type TourStep = {
  /** Element to highlight. Without one, or when it is hidden, the step is centred. */
  target?: TourTarget;
  title: MessageKey;
  body: MessageKey;
  /** Where to scroll a target taller than the screen; driver.js centres by default. */
  block?: ScrollLogicalPosition;
};

/**
 * The full tour follows the work from an empty sheet to the printed page. The
 * what's-new tour only covers what changed since the previous onboarding version.
 */
export const TOURS: Record<TourKind, readonly TourStep[]> = {
  full: [
    { title: 'tour.welcome.title', body: 'tour.welcome.body' },
    { target: 'paper', title: 'tour.paper.title', body: 'tour.paper.body' },
    { target: 'pdf', title: 'tour.pdf.title', body: 'tour.pdf.body' },
    { target: 'add', title: 'tour.add.title', body: 'tour.add.body' },
    { target: 'canvas', title: 'tour.canvas.title', body: 'tour.canvas.body', block: 'start' },
    { target: 'merge', title: 'tour.merge.title', body: 'tour.merge.body' },
    { target: 'output', title: 'tour.output.title', body: 'tour.output.body' },
  ],
  whatsNew: [
    { title: 'tour.new.title', body: 'tour.new.body' },
    { target: 'elements', title: 'tour.new.elements.title', body: 'tour.new.elements.body' },
    { target: 'merge', title: 'tour.new.merge.title', body: 'tour.new.merge.body' },
    { target: 'workspaces', title: 'tour.new.workspaces.title', body: 'tour.new.workspaces.body' },
    { target: 'layers', title: 'tour.new.layers.title', body: 'tour.new.layers.body' },
    { target: 'output', title: 'tour.new.output.title', body: 'tour.new.output.body' },
  ],
};

/**
 * driver.js renders titles and descriptions as HTML. Escape the text, then show
 * placeholders such as {{nama}} as code so they read as something to type.
 */
export function tourHtml(text: string) {
  return text
    .replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
    .replace(/\{\{[^{}]*\}\}/g, (placeholder) => `<code>${placeholder}</code>`);
}
