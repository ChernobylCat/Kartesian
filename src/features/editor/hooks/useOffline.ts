'use client';
import { useEffect, useState } from 'react';
import { useEditor } from '../context';
import { freezeAndFlush } from '@/application/workspace-transfer';
import { finishEditing } from '../finish-editing';
import { errorMessage } from '@/application/error-message';
import { t } from '@/i18n/core';
type UpdatePreparation = { cancelled: boolean; unfreeze?: () => void };

export function useOffline() {
  const { store, flush } = useEditor();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let disposed = false;
    let prepared = false;
    let preparation: UpdatePreparation | null = null;
    let registration: ServiceWorkerRegistration | undefined;
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const message = async (event: MessageEvent) => {
      if (event.data?.type === 'PREPARE_UPDATE') {
        const current: UpdatePreparation = { cancelled: false };
        try {
          if (preparation) throw new Error(t('update.preparing'));
          preparation = current;
          current.unfreeze = await freezeAndFlush(store, flush, finishEditing);
          if (current.cancelled || disposed) {
            current.unfreeze();
            return;
          }
          prepared = true;
          (event.source as ServiceWorker | null)?.postMessage({
            type: 'UPDATE_ACK',
            token: event.data.token,
            ok: true,
          });
        } catch (error) {
          if (preparation === current) preparation = null;
          current.unfreeze?.();
          (event.source as ServiceWorker | null)?.postMessage({
            type: 'UPDATE_ACK',
            token: event.data.token,
            ok: false,
          });
          store.setState({ message: errorMessage(error) });
        }
      }
      if (event.data?.type === 'CANCEL_UPDATE') {
        if (preparation) {
          preparation.cancelled = true;
          preparation.unfreeze?.();
          preparation = null;
        }
        prepared = false;
        store.setState({
          message: t('update.deferred'),
        });
      }
    };
    const checkWaiting = () => {
      if (disposed) return;
      const candidate = registration?.waiting;
      setWaiting(
        navigator.serviceWorker.controller && candidate?.state === 'installed' ? candidate : null,
      );
    };
    const changed = () => {
      checkWaiting();
      if (prepared) location.reload();
    };
    navigator.serviceWorker.addEventListener('message', message);
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    const onUpdate = () => {
      const installing = registration?.installing;
      installing?.addEventListener('statechange', () => {
        setTimeout(checkWaiting, 0);
      });
    };
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((result) => {
        if (disposed) return;
        registration = result;
        checkWaiting();
        result.addEventListener('updatefound', onUpdate);
      })
      .catch((error) =>
        store.setState({ message: t('offline.notReady', { reason: errorMessage(error) }) }),
      );
    return () => {
      disposed = true;
      if (preparation) {
        preparation.cancelled = true;
        preparation.unfreeze?.();
      }
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      navigator.serviceWorker.removeEventListener('message', message);
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      registration?.removeEventListener('updatefound', onUpdate);
    };
  }, [store, flush]);
  return {
    offline,
    updateAvailable: !!waiting,
    activate: () => waiting?.postMessage({ type: 'ACTIVATE' }),
  };
}
