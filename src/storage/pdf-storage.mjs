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

  async savePages(pages, candidates = [], { pdfData = null, fileName = '' } = {}) {
    const database = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([this.storeName], 'readwrite');
      transaction.objectStore(this.storeName).put({
        id: ACTIVE_PDF_ID,
        pages,
        candidates,
        pdfData,
        fileName: String(fileName || ''),
        timestamp: Date.now()
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Gagal menyimpan PDF ke IndexedDB.'));
      transaction.onabort = () => reject(transaction.error || new Error('Transaksi penyimpanan PDF dibatalkan.'));
    });
  }

  async getPayload() {
    const database = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([this.storeName], 'readonly');
      const request = transaction.objectStore(this.storeName).get(ACTIVE_PDF_ID);
      request.onsuccess = event => {
        const record = event.target.result;
        resolve(record ? {
          pages: Array.isArray(record.pages) ? record.pages : [],
          candidates: Array.isArray(record.candidates) ? record.candidates : [],
          pdfData: record.pdfData || record.pdfBlob || null,
          fileName: typeof record.fileName === 'string' ? record.fileName : ''
        } : null);
      };
      request.onerror = () => reject(request.error || new Error('Gagal membaca PDF dari IndexedDB.'));
    });
  }

  async getPages() {
    return (await this.getPayload())?.pages ?? null;
  }

  async saveCandidates(candidates) {
    const payload = await this.getPayload();
    if (!payload) throw new Error('PDF aktif tidak ditemukan.');
    return this.savePages(payload.pages, candidates, {
      pdfData: payload.pdfData,
      fileName: payload.fileName
    });
  }

  async deletePages() {
    const database = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([this.storeName], 'readwrite');
      const request = transaction.objectStore(this.storeName).delete(ACTIVE_PDF_ID);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Gagal menghapus PDF dari IndexedDB.'));
    });
  }
}
