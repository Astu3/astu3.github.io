// Golf Improvement App — Where the data lives: IndexedDB, read through an in-memory copy.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// STORE
// All app data is kept in IndexedDB: far more room than localStorage's ~5 MB,
// and marked persistent so the browser won't clear it to free space. The app
// reads synchronously, so every value is loaded into memory once at start-up
// (storeReady) and each write goes to memory at once and to disk just after.
// Data that was in localStorage is copied over on first run (the old copy is
// left in place as a fallback). Without IndexedDB it falls back to localStorage.
// Values are the same JSON strings localStorage held, so backups are unchanged.
// ════════════════════════════════════════════════════════════
const STORE_DB = 'golf-improvement', STORE_VERSION = 1;
const store = {
  mem: new Map(), db: null, backend: 'loading', pending: new Map(), flushing: false,
  getItem(k)    { return this.mem.has(k) ? this.mem.get(k) : null; },
  setItem(k, v) { v = String(v); if (this.backend === 'local') localStorage.setItem(k, v); this.mem.set(k, v); this.queue(k, v); },
  removeItem(k) { if (this.backend === 'local') localStorage.removeItem(k); this.mem.delete(k); this.queue(k, undefined); },
  keys()        { return [...this.mem.keys()]; },

  // Writes made in the same moment go to disk together in one transaction
  queue(k, v) {
    if (this.backend !== 'idb') return;
    this.pending.set(k, v);
    if (storeChannel) storeChannel.postMessage({ k, v });
    if (!this.flushing) { this.flushing = true; queueMicrotask(() => this.flush()); }
  },
  flush() {
    this.flushing = false;
    const batch = [...this.pending]; this.pending.clear();
    if (!batch.length) return;
    const tx = this.db.transaction('kv', 'readwrite'), kv = tx.objectStore('kv');
    batch.forEach(([k, v]) => v === undefined ? kv.delete(k) : kv.put(v, k));
    tx.onerror = tx.onabort = () => {
      console.error('Saving failed', tx.error);
      showToast('⚠️ Couldn\'t save to this device\'s storage — export a backup now (Dashboard › Data & Backup)');
    };
  },

  async open() {
    try {
      this.db = await storeOpenDB();
      const all = await storeReadAll(this.db);
      if (!all.has('golf_store_migrated')) await this.migrate(all);
      all.forEach((v, k) => this.mem.set(k, v));
      this.backend = 'idb';
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      console.warn('IndexedDB unavailable, using localStorage', e);
      this.backend = 'local';
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.includes('golf')) this.mem.set(k, localStorage.getItem(k)); }
    }
  },
  // First run on IndexedDB: copy everything the app kept in localStorage
  async migrate(all) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes('golf') && k !== 'golf_current_user' && !all.has(k)) all.set(k, localStorage.getItem(k));
    }
    all.set('golf_store_migrated', new Date().toISOString());
    await new Promise((res, rej) => {
      const tx = this.db.transaction('kv', 'readwrite'), kv = tx.objectStore('kv');
      all.forEach((v, k) => kv.put(v, k));
      tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error);
    });
  },
};

function storeOpenDB() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no IndexedDB'));
    const req = indexedDB.open(STORE_DB, STORE_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');      // app data: key → JSON string
      req.result.createObjectStore('handles'); // things that aren't text, e.g. the backup folder
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
    req.onblocked = () => rej(new Error('IndexedDB blocked'));
  });
}
function storeReadAll(db) {
  return new Promise((res, rej) => {
    const all = new Map(), req = db.transaction('kv').objectStore('kv').openCursor();
    req.onsuccess = () => { const c = req.result; if (c) { all.set(c.key, c.value); c.continue(); } else res(all); };
    req.onerror = () => rej(req.error);
  });
}
// The backup folder handle (and anything else that isn't a string) lives in its own table
function storeHandle(key, value) {
  if (!store.db) return Promise.resolve(null);
  return new Promise((res, rej) => {
    const tx = store.db.transaction('handles', value === undefined ? 'readonly' : 'readwrite'), hs = tx.objectStore('handles');
    const req = value === undefined ? hs.get(key) : value === null ? hs.delete(key) : hs.put(value, key);
    req.onsuccess = () => res(value === undefined ? req.result || null : value);
    req.onerror = () => rej(req.error);
  });
}

// Two tabs open at once stay in step: each tells the other what it saved
const storeChannel = 'BroadcastChannel' in window ? new BroadcastChannel('golf-store') : null;
if (storeChannel) storeChannel.onmessage = e => {
  const { k, v } = e.data || {};
  if (typeof k !== 'string') return;
  if (v === undefined) store.mem.delete(k); else store.mem.set(k, v);
  if (typeof dataChanged === 'function') dataChanged();
};

const storeReady = store.open();
