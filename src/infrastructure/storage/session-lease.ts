export class SessionLease {
  private releaseLock: (() => void) | null = null;
  private channel: BroadcastChannel | null = null;
  private pendingRelease: (() => void) | null = null;
  constructor(private onTakeover: () => Promise<void>) {
    if ('BroadcastChannel' in globalThis) {
      this.channel = new BroadcastChannel('kartesian-editor-v2');
      this.channel.onmessage = (event) => {
        if (event.data === 'released') this.pendingRelease?.();
        if (event.data === 'release-request' && this.releaseLock)
          void this.onTakeover()
            .then(() => {
              this.release();
              this.channel?.postMessage('released');
            })
            .catch(() => {
              this.channel?.postMessage('release-rejected');
            });
      };
    }
  }
  async acquire(): Promise<boolean> {
    if (!navigator.locks) return true; // IndexedDB compare-and-swap still prevents lost writes.
    return new Promise((resolve) => {
      void navigator.locks
        .request('kartesian-editor-v2', { ifAvailable: true }, async (lock) => {
          if (!lock) {
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
    if (!this.channel) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRelease = null;
        reject(
          new Error(
            'Tab aktif belum melepas workspace. Simpan draft pada tab tersebut lalu coba lagi.',
          ),
        );
      }, 10000);
      this.pendingRelease = () => {
        clearTimeout(timer);
        this.pendingRelease = null;
        resolve();
      };
      this.channel!.postMessage('release-request');
    });
  }
  release() {
    this.releaseLock?.();
    this.releaseLock = null;
  }
  close() {
    this.release();
    this.channel?.close();
  }
}
