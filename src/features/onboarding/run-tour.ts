import { driver, type Driver, type DriveStep, type HookOpts, type PopoverDOM } from 'driver.js';
import { t } from '@/i18n/core';
import { markOnboardingSeen, type TourKind } from './onboarding';
import { TOURS, TOUR_TARGETS, tourHtml, type TourStep } from './steps';

const STICKY_OFFSET = '--tour-sticky-offset';

/**
 * How far down the sticky header and canvas bar reach once stuck. Their height
 * changes with the screen width (the header wraps on phones), so it is measured.
 */
function stickyOffset() {
  let bottom = 0;
  for (const bar of document.querySelectorAll<HTMLElement>('.app-header, .workspace-bar')) {
    const style = getComputedStyle(bar);
    if (style.position !== 'sticky' && style.position !== 'fixed') continue;
    bottom = Math.max(bottom, (parseFloat(style.top) || 0) + bar.getBoundingClientRect().height);
  }
  return bottom;
}

/**
 * The step's element when it is on the page and has a size. A missing or hidden
 * target (for example a header button hidden on a narrow screen) centres the step.
 */
function visibleTarget(step: TourStep): Element | undefined {
  if (!step.target) return undefined;
  const element = document.querySelector(TOUR_TARGETS[step.target]);
  const box = element?.getBoundingClientRect();
  if (!element || !box || box.width <= 0 || box.height <= 0) return undefined;
  // A target scrolled to its top must not end up under the sticky bars.
  if (step.block === 'start')
    document.documentElement.style.setProperty(STICKY_OFFSET, `${stickyOffset() + 12}px`);
  return element;
}

/** Adds a "Skip tour" button next to Next on the first step. */
function addSkipButton(popover: PopoverDOM, { driver: tour }: HookOpts) {
  if (popover.footerButtons.querySelector('.tour-skip')) return;
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'driver-popover-footer-btn tour-skip';
  skip.textContent = t('tour.skip');
  skip.addEventListener('click', () => tour.destroy());
  popover.footerButtons.prepend(skip);
}

/**
 * Starts a tour and returns its driver. `onEnd` runs once the tour closes, however it
 * closes (finished, skipped, Escape or a click outside); the onboarding then counts as seen.
 */
export function startTour(kind: TourKind, onEnd: () => void): Driver {
  const steps = TOURS[kind];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const driveSteps: DriveStep[] = steps.map((step, index) => ({
    // A function, so the element is looked up when the step opens: the canvas
    // re-renders its pages, and a resize can hide or show a target.
    element: () => visibleTarget(step) as Element,
    ...(step.block && { scrollIntoView: { block: step.block } }),
    popover: {
      title: tourHtml(t(step.title)),
      description: tourHtml(t(step.body)),
      ...(index === 0 && {
        showButtons: ['next', 'close'],
        onPopoverRender: addSkipButton,
      }),
    },
  }));
  const tour = driver({
    steps: driveSteps,
    animate: !reduceMotion,
    smoothScroll: !reduceMotion,
    overlayColor: '#0b1324',
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 10,
    popoverOffset: 12,
    popoverClass: 'kartesian-tour',
    showProgress: true,
    progressText: t('tour.progress', { current: '{{current}}', total: '{{total}}' }),
    nextBtnText: t('tour.next'),
    prevBtnText: t('tour.back'),
    doneBtnText: t(kind === 'full' ? 'tour.finish' : 'tour.done'),
    closeBtnLabel: t('tour.close'),
    // The tour explains; it does not press buttons. Highlighted controls stay inert.
    disableActiveInteraction: true,
    onDestroyed: (_element, _step, { reason }) => {
      document.documentElement.style.removeProperty(STICKY_OFFSET);
      if (reason === 'replaced') return;
      markOnboardingSeen();
      onEnd();
    },
  });
  tour.drive();
  return tour;
}
