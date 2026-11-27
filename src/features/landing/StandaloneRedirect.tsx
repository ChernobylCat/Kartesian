'use client';
import { useEffect } from 'react';

/**
 * Installs made before the editor moved to /editor/ still launch at `/`. When the
 * page runs as an installed app, skip the landing page and open the editor.
 */
export default function StandaloneRedirect() {
  useEffect(() => {
    const standalone =
      matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) location.replace('/editor/');
  }, []);
  return null;
}
