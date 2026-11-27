'use client';
import { useEffect, useState } from 'react';
import { useEditor } from '../context';

export function useOffline() {
  const { store, flush } = useEditor();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let disposed = false;
    let prepared = false;
    let previousReadonly = false;
    let registration: ServiceWorkerRegistration | undefined;
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const message = async (event: MessageEvent) => {
      if (event.data?.type === 'PREPARE_UPDATE') {
        try {
          if (store.getState().error)
            throw new Error('Perbaiki atau backup draft JSON sebelum memperbarui aplikasi.');
          await flush();
          previousReadonly = store.getState().readonly;
          store.setState({ readonly: true });
          prepared = true;
          (event.source as ServiceWorker | null)?.postMessage({
            type: 'UPDATE_ACK',
            token: event.data.token,
            ok: true,
          });
        } catch (error) {
          (event.source as ServiceWorker | null)?.postMessage({
            type: 'UPDATE_ACK',
            token: event.data.token,
            ok: false,
          });
          store.setState({ message: String(error) });
        }
      }
      if (event.data?.type === 'CANCEL_UPDATE') {
        if (prepared) store.setState({ readonly: previousReadonly });
        prepared = false;
        store.setState({
          message:
            'Update ditunda karena ada tab yang belum siap. Simpan semua tab lalu coba lagi.',
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
      .catch((error) => store.setState({ message: `Offline belum siap: ${String(error)}` }));
    return () => {
      disposed = true;
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
