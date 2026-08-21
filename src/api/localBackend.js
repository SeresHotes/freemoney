// Бэкенд «Локально»: данные в IndexedDB. Тот же интерфейс, что и у googleBackend.

import { DEFAULT_CATEGORIES, DEFAULT_ICON } from './defaults';
import { DEFAULT_BASE_CURRENCY } from '../config';
import { newId } from '../utils/format';

const DB_NAME = 'freemoney';
const DB_VERSION = 2;
const STORE_TX = 'transactions';
const STORE_CAT = 'categories';
const STORE_WALLET = 'wallets';
const STORE_TAG = 'tags';
const STORE_SETTINGS = 'settings';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TX)) db.createObjectStore(STORE_TX, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_CAT)) db.createObjectStore(STORE_CAT, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_WALLET)) db.createObjectStore(STORE_WALLET, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_TAG)) db.createObjectStore(STORE_TAG, { keyPath: 'name' });
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function store(db, name, mode) {
  return db.transaction(name, mode).objectStore(name);
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const getAll = (db, name) => reqToPromise(store(db, name, 'readonly').getAll());
const put = (db, name, value) => reqToPromise(store(db, name, 'readwrite').put(value));

export async function isLocalStoreReady() {
  if (!('indexedDB' in window)) return false;
  const db = await openDb();
  const count = await reqToPromise(store(db, STORE_CAT, 'readonly').count());
  db.close();
  return count > 0;
}

export async function initLocalStore() {
  const db = await openDb();
  DEFAULT_CATEGORIES.forEach((c, index) =>
    put(db, STORE_CAT, { id: newId(), ...c, status: 'active', order: index }),
  );
  await put(db, STORE_WALLET, {
    id: newId(),
    name: 'Основной',
    currency: DEFAULT_BASE_CURRENCY,
    status: 'active',
    order: 0,
  });
  await put(db, STORE_SETTINGS, { key: 'baseCurrency', value: DEFAULT_BASE_CURRENCY });
  db.close();
}

export function createLocalBackend() {
  return {
    kind: 'local',

    // Дозаполнить дефолты при апгрейде старой локальной базы (v1 → v2).
    ensureSchema: async () => {
      const db = await openDb();
      const wallets = await getAll(db, STORE_WALLET);
      if (wallets.length === 0) {
        await put(db, STORE_WALLET, {
          id: newId(),
          name: 'Основной',
          currency: DEFAULT_BASE_CURRENCY,
          status: 'active',
          order: 0,
        });
      }
      const settings = await getAll(db, STORE_SETTINGS);
      if (!settings.some((s) => s.key === 'baseCurrency')) {
        await put(db, STORE_SETTINGS, { key: 'baseCurrency', value: DEFAULT_BASE_CURRENCY });
      }
      db.close();
    },

    fetchTransactions: async () => {
      const db = await openDb();
      const rows = await getAll(db, STORE_TX);
      db.close();
      return rows
        .map((r) => ({ ...r, tags: Array.isArray(r.tags) ? r.tags : [] }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
    },

    fetchCategories: async () => {
      const db = await openDb();
      const rows = await getAll(db, STORE_CAT);
      db.close();
      return rows
        .map((c) => ({ ...c, icon: c.icon || DEFAULT_ICON }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    },

    fetchWallets: async () => {
      const db = await openDb();
      const rows = await getAll(db, STORE_WALLET);
      db.close();
      return rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    },

    fetchTags: async () => {
      const db = await openDb();
      const rows = await getAll(db, STORE_TAG);
      db.close();
      return rows.map((r) => r.name);
    },

    fetchSettings: async () => {
      const db = await openDb();
      const rows = await getAll(db, STORE_SETTINGS);
      db.close();
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },

    addTransaction: async (t) => {
      const db = await openDb();
      await put(db, STORE_TX, { ...t, tags: t.tags || [] });
      db.close();
    },

    addTransactions: async (txs) => {
      const db = await openDb();
      for (const t of txs) await put(db, STORE_TX, { ...t, tags: t.tags || [] });
      db.close();
    },

    addCategory: async ({ name, kind, icon }) => {
      const db = await openDb();
      const existing = await getAll(db, STORE_CAT);
      await put(db, STORE_CAT, {
        id: newId(), name, kind, icon: icon || DEFAULT_ICON, status: 'active', order: existing.length,
      });
      db.close();
    },

    setCategoryStatus: async (id, status) => {
      const db = await openDb();
      const s = store(db, STORE_CAT, 'readwrite');
      const cat = await reqToPromise(s.get(id));
      if (cat) { cat.status = status; await reqToPromise(s.put(cat)); }
      db.close();
    },

    updateCategory: async (id, { name, kind, icon }) => {
      const db = await openDb();
      const s = store(db, STORE_CAT, 'readwrite');
      const cat = await reqToPromise(s.get(id));
      if (cat) { Object.assign(cat, { name, kind, icon: icon || DEFAULT_ICON }); await reqToPromise(s.put(cat)); }
      db.close();
    },

    renameCategory: async (oldName, newName) => {
      const db = await openDb();
      const s = store(db, STORE_TX, 'readwrite');
      const all = await reqToPromise(s.getAll());
      for (const t of all) {
        if (t.category === oldName) { t.category = newName; await reqToPromise(s.put(t)); }
      }
      db.close();
    },

    addWallet: async ({ name, currency }) => {
      const db = await openDb();
      const existing = await getAll(db, STORE_WALLET);
      await put(db, STORE_WALLET, {
        id: newId(), name, currency, status: 'active', order: existing.length,
      });
      db.close();
    },

    updateWallet: async (wallet, { name, currency }) => {
      const db = await openDb();
      const s = store(db, STORE_WALLET, 'readwrite');
      const w = await reqToPromise(s.get(wallet.id));
      if (w) { Object.assign(w, { name, currency }); await reqToPromise(s.put(w)); }
      db.close();
    },

    setWalletStatus: async (wallet, status) => {
      const db = await openDb();
      const s = store(db, STORE_WALLET, 'readwrite');
      const w = await reqToPromise(s.get(wallet.id));
      if (w) { w.status = status; await reqToPromise(s.put(w)); }
      db.close();
    },

    addTag: async (name) => {
      const db = await openDb();
      await put(db, STORE_TAG, { name });
      db.close();
    },

    deleteTag: async (name) => {
      const db = await openDb();
      await reqToPromise(store(db, STORE_TAG, 'readwrite').delete(name));
      const s = store(db, STORE_TX, 'readwrite');
      const all = await reqToPromise(s.getAll());
      for (const t of all) {
        if (Array.isArray(t.tags) && t.tags.includes(name)) {
          t.tags = t.tags.filter((x) => x !== name);
          await reqToPromise(s.put(t));
        }
      }
      db.close();
    },

    setSetting: async (key, value) => {
      const db = await openDb();
      await put(db, STORE_SETTINGS, { key, value });
      db.close();
    },
  };
}
