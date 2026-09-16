// Локальное хранилище (IndexedDB) — единственный источник правды приложения.
// Все правки пишутся сюда мгновенно и работают офлайн; Google Таблица — это
// необязательная реплика, синхронизируемая в фоне (см. api/sync.js).
//
// Каждая запись несёт метку изменения `updatedAt` (мс) для LWW-мерджа и флаг
// `deleted` (tombstone) — удаления не стираются физически, а помечаются, иначе
// удаление на одном устройстве «воскресало» бы при синхронизации с другого.

import { DEFAULT_CATEGORIES, DEFAULT_ICON } from './defaults';
import { DEFAULT_BASE_CURRENCY } from '../config';
import { newId, nowStamp } from '../utils/format';

const DB_NAME = 'freemoney';
const DB_VERSION = 4;
const STORE_TX = 'transactions';
const STORE_CAT = 'categories';
const STORE_WALLET = 'wallets';
const STORE_TAG = 'tags';
const STORE_SETTINGS = 'settings';
const STORE_META = '_meta'; // служебное: снапшот синхронизации и пр.

// Соответствие имени сущности (как в sync.js) имени хранилища IndexedDB.
const STORE_BY_ENTITY = {
  transactions: STORE_TX,
  categories: STORE_CAT,
  wallets: STORE_WALLET,
  tags: STORE_TAG,
  settings: STORE_SETTINGS,
};
const DATA_STORES = [STORE_TX, STORE_CAT, STORE_WALLET, STORE_TAG, STORE_SETTINGS];

// v4: кошелёк идентифицируется по имени (keyPath 'name'), поле id упразднено.
// Переносим существующий стор wallets (keyPath 'id') в стор с keyPath 'name' и
// переводим ссылки операций t.wallet со старого id на имя кошелька. Всё внутри
// versionchange-транзакции: getAll → пересоздание стора → перезапись операций.
function migrateWalletsIdToName(db, tx) {
  const getReq = tx.objectStore(STORE_WALLET).getAll();
  getReq.onsuccess = () => {
    const oldWallets = (getReq.result || []).filter((w) => w.name);
    const idToName = new Map(oldWallets.map((w) => [w.id, w.name]));
    db.deleteObjectStore(STORE_WALLET);
    const newStore = db.createObjectStore(STORE_WALLET, { keyPath: 'name' });
    // Дубли имён схлопываются в один кошелёк (последний побеждает) — намеренно.
    for (const w of oldWallets) {
      const { id, ...rest } = w;
      newStore.put(rest);
    }
    const txStore = tx.objectStore(STORE_TX);
    const txReq = txStore.getAll();
    txReq.onsuccess = () => {
      for (const t of txReq.result || []) {
        const name = idToName.get(t.wallet);
        if (name && name !== t.wallet) txStore.put({ ...t, wallet: name });
      }
    };
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TX)) db.createObjectStore(STORE_TX, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_CAT)) db.createObjectStore(STORE_CAT, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_TAG)) db.createObjectStore(STORE_TAG, { keyPath: 'name' });
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORE_WALLET)) {
        db.createObjectStore(STORE_WALLET, { keyPath: 'name' });
      } else if (event.oldVersion < 4) {
        migrateWalletsIdToName(db, request.transaction);
      }
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
// Запись с проставлением свежей метки изменения.
const putStamped = (db, name, value) => put(db, name, { ...value, updatedAt: nowStamp() });

const isLive = (r) => !r.deleted;

// Попросить браузер не вытеснять данные под давлением диска. Критично: локальный
// стор — источник правды. Идемпотентно, тихо игнорирует отсутствие API.
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
  } catch {
    /* API недоступно — не критично */
  }
  return false;
}

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
    putStamped(db, STORE_CAT, { id: newId(), ...c, status: 'active', order: index }),
  );
  await putStamped(db, STORE_WALLET, {
    name: 'Основной',
    currency: DEFAULT_BASE_CURRENCY,
    status: 'active',
    order: 0,
    kind: 'cash',
    rate: 0,
  });
  await putStamped(db, STORE_SETTINGS, { key: 'baseCurrency', value: DEFAULT_BASE_CURRENCY });
  db.close();
}

// --- Служебные данные синхронизации (_meta) ---------------------------------
export async function getMeta(key) {
  const db = await openDb();
  const rec = await reqToPromise(store(db, STORE_META, 'readonly').get(key));
  db.close();
  return rec ? rec.value : null;
}

export async function setMeta(key, value) {
  const db = await openDb();
  await put(db, STORE_META, { key, value });
  db.close();
}

// --- Функции для sync-движка ------------------------------------------------
// Полный дамп всех сущностей ВКЛЮЧАЯ tombstones и updatedAt — сырьё для мерджа.
export async function rawDump() {
  const db = await openDb();
  const [txs, cats, wls, tgs, settings] = await Promise.all([
    getAll(db, STORE_TX), getAll(db, STORE_CAT), getAll(db, STORE_WALLET),
    getAll(db, STORE_TAG), getAll(db, STORE_SETTINGS),
  ]);
  db.close();
  return { transactions: txs, categories: cats, wallets: wls, tags: tgs, settings };
}

// Применить записи-победители мерджа в локальный стор (upsert, включая tombstones).
// Compare-and-set в одной транзакции: НЕ перезаписываем запись, если её локальная
// версия стала новее посчитанного победителя (правка во время синхронизации).
// get→put выполняются синхронно в onsuccess, поэтому транзакция атомарна
// относительно параллельных правок (IndexedDB сериализует readwrite-транзакции).
export async function applyRecords(entity, records) {
  if (!records?.length) return;
  const name = STORE_BY_ENTITY[entity];
  const keyOf = (r) => (name === STORE_TAG || name === STORE_WALLET ? r.name : name === STORE_SETTINGS ? r.key : r.id);
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    const s = tx.objectStore(name);
    for (const r of records) {
      const getReq = s.get(keyOf(r));
      getReq.onsuccess = () => {
        const cur = getReq.result;
        if (!cur || (r.updatedAt || 0) >= (cur.updatedAt || 0)) s.put(r);
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

// Полностью заменить локальные данные (принять таблицу как есть — «pristine adopt»).
export async function replaceAllData({ transactions, categories, wallets, tags, settings }) {
  const db = await openDb();
  const byEntity = { transactions, categories, wallets, tags, settings };
  for (const [entity, records] of Object.entries(byEntity)) {
    const name = STORE_BY_ENTITY[entity];
    const s = store(db, name, 'readwrite');
    await reqToPromise(s.clear());
    for (const r of records || []) await reqToPromise(s.put(r));
  }
  db.close();
}

// Число «живых» операций — признак того, что на устройстве есть реальные данные.
export async function countActiveTransactions() {
  const db = await openDb();
  const rows = await getAll(db, STORE_TX);
  db.close();
  return rows.filter(isLive).length;
}

export function createLocalBackend() {
  return {
    kind: 'local',

    // Дозаполнить дефолты и проставить метки старым записям (миграция v2 → v3).
    ensureSchema: async () => {
      const db = await openDb();
      const wallets = await getAll(db, STORE_WALLET);
      if (wallets.length === 0) {
        await put(db, STORE_WALLET, {
          name: 'Основной',
          currency: DEFAULT_BASE_CURRENCY,
          status: 'active',
          order: 0,
          kind: 'cash',
          rate: 0,
          updatedAt: nowStamp(),
        });
      }
      const settings = await getAll(db, STORE_SETTINGS);
      if (!settings.some((s) => s.key === 'baseCurrency')) {
        await put(db, STORE_SETTINGS, { key: 'baseCurrency', value: DEFAULT_BASE_CURRENCY, updatedAt: nowStamp() });
      }
      // Бэкфилл updatedAt: существовавшие до синхронизации данные считаем
      // актуальными, чтобы они не проиграли пустой/старой таблице при первом мердже.
      const stamp = nowStamp();
      for (const name of DATA_STORES) {
        const rows = await getAll(db, name);
        const s = store(db, name, 'readwrite');
        for (const r of rows) {
          if (r.updatedAt == null) await reqToPromise(s.put({ ...r, updatedAt: stamp }));
        }
      }
      db.close();
    },

    // Всё сразу для UI: tombstones отфильтрованы.
    fetchAll: async () => {
      const db = await openDb();
      const [txs, cats, wls, tgs, settings] = await Promise.all([
        getAll(db, STORE_TX), getAll(db, STORE_CAT), getAll(db, STORE_WALLET),
        getAll(db, STORE_TAG), getAll(db, STORE_SETTINGS),
      ]);
      db.close();
      return {
        transactions: txs.filter(isLive)
          .map((r) => ({ ...r, tags: Array.isArray(r.tags) ? r.tags : [] }))
          .sort((a, b) => (a.date < b.date ? -1 : 1)),
        categories: cats.filter(isLive)
          .map((c) => ({ ...c, icon: c.icon || DEFAULT_ICON }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        wallets: wls.filter(isLive)
          .map((w) => ({ ...w, kind: w.kind || 'cash', rate: Number(w.rate) || 0 }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        tags: tgs.filter(isLive).map((r) => ({ name: r.name, status: r.status || 'active' })),
        settings: Object.fromEntries(settings.filter(isLive).map((r) => [r.key, r.value])),
      };
    },

    fetchTransactions: async () => {
      const db = await openDb();
      const rows = await getAll(db, STORE_TX);
      db.close();
      return rows.filter(isLive)
        .map((r) => ({ ...r, tags: Array.isArray(r.tags) ? r.tags : [] }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
    },

    fetchCategories: async () => {
      const db = await openDb();
      const rows = await getAll(db, STORE_CAT);
      db.close();
      return rows.filter(isLive)
        .map((c) => ({ ...c, icon: c.icon || DEFAULT_ICON }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    },

    fetchWallets: async () => {
      const db = await openDb();
      const rows = await getAll(db, STORE_WALLET);
      db.close();
      return rows.filter(isLive)
        .map((w) => ({ ...w, kind: w.kind || 'cash', rate: Number(w.rate) || 0 }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    },

    fetchTags: async () => {
      const db = await openDb();
      const rows = await getAll(db, STORE_TAG);
      db.close();
      return rows.filter(isLive).map((r) => ({ name: r.name, status: r.status || 'active' }));
    },

    fetchSettings: async () => {
      const db = await openDb();
      const rows = await getAll(db, STORE_SETTINGS);
      db.close();
      return Object.fromEntries(rows.filter(isLive).map((r) => [r.key, r.value]));
    },

    addTransaction: async (t) => {
      const db = await openDb();
      await putStamped(db, STORE_TX, { ...t, tags: t.tags || [], deleted: false });
      db.close();
    },

    addTransactions: async (txs) => {
      const db = await openDb();
      for (const t of txs) await putStamped(db, STORE_TX, { ...t, tags: t.tags || [], deleted: false });
      db.close();
    },

    updateTransaction: async (t) => {
      const db = await openDb();
      await putStamped(db, STORE_TX, { ...t, tags: t.tags || [], deleted: false });
      db.close();
    },

    // Удаление = tombstone (запись остаётся с deleted:true и свежей меткой).
    deleteTransaction: async (txId) => {
      const db = await openDb();
      const s = store(db, STORE_TX, 'readwrite');
      const t = await reqToPromise(s.get(txId));
      if (t) await reqToPromise(s.put({ ...t, deleted: true, updatedAt: nowStamp() }));
      db.close();
    },

    addCategory: async ({ name, kind, icon }) => {
      const db = await openDb();
      const existing = (await getAll(db, STORE_CAT)).filter(isLive);
      await putStamped(db, STORE_CAT, {
        id: newId(), name, kind, icon: icon || DEFAULT_ICON, status: 'active',
        order: existing.length, deleted: false,
      });
      db.close();
    },

    setCategoryStatus: async (id, status) => {
      const db = await openDb();
      const s = store(db, STORE_CAT, 'readwrite');
      const cat = await reqToPromise(s.get(id));
      if (cat) { cat.status = status; cat.updatedAt = nowStamp(); await reqToPromise(s.put(cat)); }
      db.close();
    },

    updateCategory: async (id, { name, kind, icon }) => {
      const db = await openDb();
      const s = store(db, STORE_CAT, 'readwrite');
      const cat = await reqToPromise(s.get(id));
      if (cat) {
        Object.assign(cat, { name, kind, icon: icon || DEFAULT_ICON, updatedAt: nowStamp() });
        await reqToPromise(s.put(cat));
      }
      db.close();
    },

    renameCategory: async (oldName, newName) => {
      const db = await openDb();
      const s = store(db, STORE_TX, 'readwrite');
      const all = await reqToPromise(s.getAll());
      for (const t of all) {
        if (t.category === oldName) {
          t.category = newName; t.updatedAt = nowStamp();
          await reqToPromise(s.put(t));
        }
      }
      db.close();
    },

    addWallet: async ({ name, currency, kind, rate }) => {
      const db = await openDb();
      const existing = (await getAll(db, STORE_WALLET)).filter(isLive);
      await putStamped(db, STORE_WALLET, {
        name, currency, status: 'active', order: existing.length,
        kind: kind || 'cash', rate: Number(rate) || 0, deleted: false,
      });
      db.close();
    },

    // Правка полей кошелька (кроме имени) — по имени-ключу.
    updateWallet: async (name, { currency, kind, rate }) => {
      const db = await openDb();
      const s = store(db, STORE_WALLET, 'readwrite');
      const w = await reqToPromise(s.get(name));
      if (w) {
        Object.assign(w, { currency, kind: kind || 'cash', rate: Number(rate) || 0, updatedAt: nowStamp() });
        await reqToPromise(s.put(w));
      }
      db.close();
    },

    // Переименование = tombstone старого имени + запись под новым + каскад в
    // операции (t.wallet), по образцу renameTag. Имя — идентификатор кошелька.
    renameWallet: async (oldName, newName) => {
      const db = await openDb();
      const s = store(db, STORE_WALLET, 'readwrite');
      const old = await reqToPromise(s.get(oldName));
      if (old) {
        await reqToPromise(s.put({ ...old, name: oldName, deleted: true, updatedAt: nowStamp() }));
        const { deleted, ...rest } = old;
        await reqToPromise(s.put({ ...rest, name: newName, deleted: false, updatedAt: nowStamp() }));
      }
      const txs = store(db, STORE_TX, 'readwrite');
      const all = await reqToPromise(txs.getAll());
      for (const t of all) {
        if (t.wallet === oldName) {
          t.wallet = newName; t.updatedAt = nowStamp();
          await reqToPromise(txs.put(t));
        }
      }
      db.close();
    },

    setWalletStatus: async (name, status) => {
      const db = await openDb();
      const s = store(db, STORE_WALLET, 'readwrite');
      const w = await reqToPromise(s.get(name));
      if (w) { w.status = status; w.updatedAt = nowStamp(); await reqToPromise(s.put(w)); }
      db.close();
    },

    addTag: async (name) => {
      const db = await openDb();
      await putStamped(db, STORE_TAG, { name, status: 'active', deleted: false });
      db.close();
    },

    // «Удаление» тега = архивирование (status), тег остаётся и восстановим.
    // deleted (tombstone) для тегов ставит только rename — чтобы старое имя не
    // воскресало при синхронизации.
    setTagStatus: async (name, status) => {
      const db = await openDb();
      const s = store(db, STORE_TAG, 'readwrite');
      const tag = await reqToPromise(s.get(name));
      if (tag) { tag.status = status; tag.updatedAt = nowStamp(); await reqToPromise(s.put(tag)); }
      db.close();
    },

    renameTag: async (oldName, newName) => {
      const db = await openDb();
      const tagStore = store(db, STORE_TAG, 'readwrite');
      const old = await reqToPromise(tagStore.get(oldName));
      const status = old?.status || 'active';
      await reqToPromise(tagStore.put({ name: oldName, status, deleted: true, updatedAt: nowStamp() }));
      await reqToPromise(tagStore.put({ name: newName, status, deleted: false, updatedAt: nowStamp() }));
      const s = store(db, STORE_TX, 'readwrite');
      const all = await reqToPromise(s.getAll());
      for (const t of all) {
        if ((t.tags || []).includes(oldName)) {
          t.tags = [...new Set(t.tags.map((x) => (x === oldName ? newName : x)))];
          t.updatedAt = nowStamp();
          await reqToPromise(s.put(t));
        }
      }
      db.close();
    },

    setSetting: async (key, value) => {
      const db = await openDb();
      await putStamped(db, STORE_SETTINGS, { key, value, deleted: false });
      db.close();
    },
  };
}
