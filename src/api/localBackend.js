// Бэкенд «Локально»: данные в IndexedDB браузера. Работает офлайн и без
// авторизации Google. Тот же интерфейс, что и у googleBackend.

import { DEFAULT_CATEGORIES, DEFAULT_ICON } from './defaults';
import { newId } from '../utils/format';

const DB_NAME = 'freemoney';
const DB_VERSION = 1;
const STORE_TX = 'transactions';
const STORE_CAT = 'categories';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TX)) {
        db.createObjectStore(STORE_TX, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CAT)) {
        db.createObjectStore(STORE_CAT, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db, storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll(db, storeName) {
  return reqToPromise(tx(db, storeName, 'readonly').getAll());
}

async function put(db, storeName, value) {
  const store = tx(db, storeName, 'readwrite');
  await reqToPromise(store.put(value));
}

// Есть ли уже инициализированная локальная база (хотя бы одна категория).
export async function isLocalStoreReady() {
  if (!('indexedDB' in window)) return false;
  const db = await openDb();
  const count = await reqToPromise(tx(db, STORE_CAT, 'readonly').count());
  db.close();
  return count > 0;
}

// Создать локальную базу с базовыми категориями.
export async function initLocalStore() {
  const db = await openDb();
  const store = tx(db, STORE_CAT, 'readwrite');
  DEFAULT_CATEGORIES.forEach((c, index) => {
    store.put({
      id: newId(),
      name: c.name,
      kind: c.kind,
      status: 'active',
      icon: c.icon,
      order: index,
    });
  });
  await new Promise((resolve, reject) => {
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
  });
  db.close();
}

export function createLocalBackend() {
  return {
    kind: 'local',

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

    addTransaction: async (t) => {
      const db = await openDb();
      await put(db, STORE_TX, { ...t, tags: t.tags || [] });
      db.close();
    },

    addCategory: async ({ name, kind, icon }) => {
      const db = await openDb();
      const existing = await getAll(db, STORE_CAT);
      const order = existing.length;
      await put(db, STORE_CAT, {
        id: newId(),
        name,
        kind,
        icon: icon || DEFAULT_ICON,
        status: 'active',
        order,
      });
      db.close();
    },

    setCategoryStatus: async (id, status) => {
      const db = await openDb();
      const store = tx(db, STORE_CAT, 'readwrite');
      const cat = await reqToPromise(store.get(id));
      if (cat) {
        cat.status = status;
        await reqToPromise(store.put(cat));
      }
      db.close();
    },

    updateCategory: async (id, { name, kind, icon }) => {
      const db = await openDb();
      const store = tx(db, STORE_CAT, 'readwrite');
      const cat = await reqToPromise(store.get(id));
      if (cat) {
        Object.assign(cat, { name, kind, icon: icon || DEFAULT_ICON });
        await reqToPromise(store.put(cat));
      }
      db.close();
    },

    renameCategory: async (oldName, newName) => {
      const db = await openDb();
      const store = tx(db, STORE_TX, 'readwrite');
      const all = await reqToPromise(store.getAll());
      for (const t of all) {
        if (t.category === oldName) {
          t.category = newName;
          await reqToPromise(store.put(t));
        }
      }
      db.close();
    },
  };
}
