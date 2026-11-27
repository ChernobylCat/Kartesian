'use client';
import { useEffect, useState } from 'react';
import { uid } from '@/domain/document/model';
import { getCurrent, setCurrent, type CurrentWorkspace } from '@/infrastructure/storage/library';
import { t } from '@/i18n/core';

/**
 * Name and library id of the open workspace. Workspaces created before the library
 * existed get an id and a default name on first use.
 */
export function useCurrentWorkspace() {
  const [current, setState] = useState<CurrentWorkspace | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      let value = await getCurrent();
      if (!value) {
        value = { id: uid(), name: t('workspaces.defaultName') };
        await setCurrent(value);
      }
      if (active) setState(value);
    })().catch(() => {
      // Without IndexedDB the library is unavailable; the editor still works.
      if (active) setState(null);
    });
    return () => {
      active = false;
    };
  }, []);
  return [current, setState] as const;
}
