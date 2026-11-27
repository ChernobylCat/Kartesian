import { t } from '@/i18n/core';
export class SessionLease {
  private releaseLock: (() => void) | null = null;
  private channel: BroadcastChannel | null = null;
  private pendingRelease: ((error?: Error) => void) | null = null;
  private closed = false;
  private transferring = false;
  constructor(private onTakeover: () => Promise<void>) {
    if ('BroadcastChannel' in globalThis) {
      this.channel = new BroadcastChannel('kartesian-editor-v2');
      this.channel.onmessage = (event) => {
        if (event.data === 'released') this.pendingRelease?.();
        if (event.data === 'release-rejected') this.pendingRelease?.(new Error(t('lease.refused')));
        if (event.data === 'release-request' && this.releaseLock && !this.transferring) {
          this.transferring = true;
          void this.onTakeover()
            .then(() => {
              this.release();
              this.channel?.postMessage('released');
            })
            .catch(() => {
              this.channel?.postMessage('release-rejected');
            })
            .finally(() => {
              this.transferring = false;
            });
        }
      };
    }
  }
  async acquire(): Promise<boolean> {
    if (this.closed) return false;
    if (this.releaseLock) return true;
    if (!navigator.locks) return true; // IndexedDB compare-and-swap still prevents lost writes.
    return new Promise((resolve) => {
      void navigator.locks
        .request('kartesian-editor-v2', { ifAvailable: true }, async (lock) => {
          if (!lock || this.closed) {
            resolve(false);
            return;
          }
          await new Promise<void>((release) => {
            this.releaseLock = release;
            resolve(true);
          });
        })
        .catch(() => resolve(false));
    });
  }
  requestRelease(): Promise<void> {
    if (this.closed) return Promise.reject(new Error(t('lease.closed')));
    if (this.pendingRelease) return Promise.reject(new Error(t('lease.pending')));
    if (!this.channel) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRelease = null;
        reject(new Error(t('lease.timeout')));
      }, 10000);
      this.pendingRelease = (error) => {
        clearTimeout(timer);
        this.pendingRelease = null;
        if (error) reject(error);
        else resolve();
      };
      this.channel!.postMessage('release-request');
    });
  }
  release() {
    this.releaseLock?.();
    this.releaseLock = null;
  }
  close() {
    this.closed = true;
    this.pendingRelease?.(new Error(t('lease.closed')));
    this.release();
    this.channel?.close();
    this.channel = null;
  }
}
