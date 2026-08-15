import { APP_CONFIG } from '../config.mjs';

const ACTIVE_PDF_ID = 'active_pdf';

export class PdfOverlayStorage {
  constructor({
    indexedDb = globalThis.indexedDB,
    dbName = APP_CONFIG.DB_NAME,
    dbVersion = APP_CONFIG.DB_VERSION,
    storeName = APP_CONFIG.STORE_NAME
  } = {}) {
    this.indexedDb = indexedDb;
    this.dbName = dbName;
    this.dbVersion = dbVersion;
    this.storeName = storeName;
    this.connectionPromise = null;
  }

  async getDatabase() {
    if (!this.indexedDb) throw new Error('IndexedDB tidak tersedia.');
    if (!this.connectionPromise) {
      this.connectionPromise = this.openDatabase().catch(error => {
        this.connectionPromise = null;
        throw error;
      });
    }
    return this.connectionPromise;
  }

  openDatabase() {
    return new Promise((resolve, reject) => {
      const request = this.indexedDb.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = event => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(this.storeName)) {
          database.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = event => {
        const database = event.target.result;
        database.onversionchange = () => {
          database.close();
          this.connectionPromise = null;
        };
        resolve(database);
      };
      request.onerror = event => reject(event.target.error);
      request.onblocked = () => reject(new Error('Database overlay sedang digunakan oleh tab lain.'));
    });
  }

  async savePages(pages) {
    const database = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([this.storeName], 'readwrite');
      transaction.objectStore(this.storeName).put({
        id: ACTIVE_PDF_ID,
        pages,
        timestamp: Date.now()
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Transaksi penyimpanan PDF dibatalkan.'));
    });
  }

  async getPages() {
    const database = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([this.storeName], 'readonly');
      const request = transaction.objectStore(this.storeName).get(ACTIVE_PDF_ID);
      request.onsuccess = event => resolve(event.target.result?.pages ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async deletePages() {
    const database = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([this.storeName], 'readwrite');
      const request = transaction.objectStore(this.storeName).delete(ACTIVE_PDF_ID);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
