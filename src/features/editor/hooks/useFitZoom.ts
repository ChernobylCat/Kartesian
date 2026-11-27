'use client';
import { useEffect, useState } from 'react';
import type { Paper } from '@/domain/document/paper';

const MM_TO_PX = 96 / 25.4;
/** Width of the vertical ruler and height of the page label + horizontal ruler, in px. */
const RULER_PX = 26;
const PAGE_CHROME_PX = 96;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;

export type ZoomMode = number | 'fit-width' | 'fit-page';

/**
 * Canvas zoom for a mode: a fixed factor, or one fitted to the canvas width (and the
 * visible height for `fit-page`), recomputed when the window or paper size changes.
 */
export function useFitZoom(mode: ZoomMode, paper: Paper) {
  const [fitted, setFitted] = useState(0.75);
  useEffect(() => {
    if (typeof mode === 'number') return;
    const container = document.getElementById('printContainer');
    if (!container) return;
    const measure = () => {
      const style = getComputedStyle(container);
      const width =
        container.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        RULER_PX;
      let zoom = width / (paper.width * MM_TO_PX);
      if (mode === 'fit-page') {
        const bar = document.querySelector('.workspace-bar')?.getBoundingClientRect().bottom ?? 0;
        const height = window.innerHeight - bar - parseFloat(style.paddingTop) - PAGE_CHROME_PX - 8;
        zoom = Math.min(zoom, height / (paper.height * MM_TO_PX));
      }
      setFitted(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(zoom * 100) / 100)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [mode, paper.width, paper.height]);
  return typeof mode === 'number' ? mode : fitted;
}
