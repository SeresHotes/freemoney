// Бэкенд «Файлы на устройстве»: данные в .csv файлах через Capacitor Filesystem.
// Доступен только в нативной сборке (Capacitor). Тот же интерфейс, что и у других.

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { DEFAULT_CATEGORIES, DEFAULT_ICON } from './defaults';
import { DEFAULT_BASE_CURRENCY } from '../config';
import { toCsv, parseCsv } from '../utils/csv';
import { newId } from '../utils/format';

const DIR = Directory.Documents;
const FOLDER = 'freemoney';

const FILES = {
  transactions: 'transactions.csv',
  categories: 'categories.csv',
  wallets: 'wallets.csv',
  tags: 'tags.csv',
  settings: 'settings.csv',
};

const TX_COLS = ['id', 'datetime', 'type', 'amount', 'category', 'note', 'tags', 'wallet', 'currency', 'origAmount', 'origCurrency', 'transferId', 'rate'];
const CAT_COLS = ['id', 'name', 'kind', 'status', 'icon'];
const WALLET_COLS = ['name', 'currency', 'status', 'order', 'kind', 'rate'];
const TAG_COLS = ['name', 'status'];

const path = (file) => `${FOLDER}/${file}`;

async function readRows(file) {
  try {
    const res = await Filesystem.readFile({ path: path(file), directory: DIR, encoding: Encoding.UTF8 });
    return parseCsv(res.data).filter((row) => row.some((c) => c !== ''));
  } catch {
    return []; // файла ещё нет
  }
}

async function writeRows(file, header, rows) {
  await Filesystem.writeFile({
    path: path(file),
    directory: DIR,
    data: toCsv([header, ...rows]),
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

// --- Сериализация сущностей -------------------------------------------------
const txToRow = (t) => [
  t.id, t.date ? `${t.date} ${t.time || '00:00'}` : '', t.type, t.amount, t.category || '', t.note || '', (t.tags || []).join(', '),
  t.wallet || '', t.currency || '', t.origAmount ?? '', t.origCurrency || '', t.transferId || '', t.rate ?? '',
];
const rowToTx = (r) => {
  const dt = r[1] || '';
  return {
    id: r[0], date: dt.slice(0, 10), time: dt.length > 10 ? dt.slice(11) : '00:00',
    type: r[2] || 'expense', amount: Number(r[3]) || 0,
    category: r[4] || '', note: r[5] || '',
    tags: (r[6] || '').split(',').map((s) => s.trim()).filter(Boolean),
    wallet: r[7] || '', currency: r[8] || '', origAmount: r[9] ? Number(r[9]) : null,
    origCurrency: r[10] || '', transferId: r[11] || '',
    rate: r[12] != null && r[12] !== '' ? Number(r[12]) : null,
  };
};
const catToRow = (c) => [c.id, c.name, c.kind, c.status, c.icon || DEFAULT_ICON];
const rowToCat = (r, i) => ({ id: r[0], name: r[1], kind: r[2] || 'both', status: r[3] || 'active', icon: r[4] || DEFAULT_ICON, order: i });
const walletToRow = (w) => [w.name, w.currency, w.status, w.order ?? 0, w.kind || 'cash', w.rate ?? 0];
const rowToWallet = (r, i) => ({ name: r[0], currency: r[1] || DEFAULT_BASE_CURRENCY, status: r[2] || 'active', order: Number(r[3]) || i, kind: r[4] || 'cash', rate: Number(r[5]) || 0 });

async function readAll(file, mapRow) {
  const rows = await readRows(file);
  return rows.slice(1).map(mapRow); // пропускаем заголовок
}

export async function isDeviceStoreReady() {
  const rows = await readRows(FILES.categories);
  return rows.length > 1;
}

export async function initDeviceStore() {
  const cats = DEFAULT_CATEGORIES.map((c, i) => ({ id: newId(), ...c, status: 'active', order: i }));
  await writeRows(FILES.categories, CAT_COLS, cats.map(catToRow));
  await writeRows(FILES.wallets, WALLET_COLS, [
    ['Основной', DEFAULT_BASE_CURRENCY, 'active', 0, 'cash', 0],
  ]);
  await writeRows(FILES.transactions, TX_COLS, []);
  await writeRows(FILES.tags, TAG_COLS, []);
  await writeRows(FILES.settings, ['key', 'value'], [['baseCurrency', DEFAULT_BASE_CURRENCY]]);
}

export function createDeviceBackend() {
  const loadTx = () => readAll(FILES.transactions, rowToTx);
  const loadCats = () => readAll(FILES.categories, rowToCat);
  const loadWallets = () => readAll(FILES.wallets, rowToWallet);
  const loadTags = async () =>
    (await readAll(FILES.tags, (r) => ({ name: r[0], status: r[1] || 'active' }))).filter((t) => t.name);
  const loadSettings = async () => {
    const rows = await readAll(FILES.settings, (r) => r);
    return Object.fromEntries(rows.map((r) => [r[0], r[1] ?? '']));
  };

  const saveTx = (list) => writeRows(FILES.transactions, TX_COLS, list.map(txToRow));
  const saveCats = (list) => writeRows(FILES.categories, CAT_COLS, list.map(catToRow));
  const saveWallets = (list) => writeRows(FILES.wallets, WALLET_COLS, list.map(walletToRow));
  const saveTags = (list) => writeRows(FILES.tags, TAG_COLS, list.map((t) => [t.name, t.status || 'active']));
  const saveSettings = (obj) => writeRows(FILES.settings, ['key', 'value'], Object.entries(obj));

  // Перенос старой раскладки wallets.csv (id|name|…) на новую (name|…): опознаём
  // по заголовку, ремапим ссылки в операциях с id кошелька на его название.
  const migrateWalletsToNameKey = async () => {
    const rows = await readRows(FILES.wallets);
    if (!rows.length || rows[0][0] !== 'id') return;
    const old = rows
      .slice(1)
      .filter((r) => r[0])
      .map((r) => ({
        id: r[0], name: r[1] || '', currency: r[2] || DEFAULT_BASE_CURRENCY,
        status: r[3] || 'active', order: Number(r[4]) || 0, kind: r[5] || 'cash', rate: Number(r[6]) || 0,
      }));
    const nameById = new Map(old.map((w) => [w.id, w.name]));
    const txs = await loadTx();
    await saveTx(txs.map((t) => (nameById.has(t.wallet) ? { ...t, wallet: nameById.get(t.wallet) } : t)));
    await saveWallets(old.map(({ id, ...rest }) => rest));
  };

  return {
    kind: 'device',

    ensureSchema: async () => {
      if (!(await isDeviceStoreReady())) { await initDeviceStore(); return; }
      await migrateWalletsToNameKey();
    },

    fetchAll: async () => {
      const [transactions, categories, wallets, tags, settings] = await Promise.all([
        loadTx(), loadCats(), loadWallets(), loadTags(), loadSettings(),
      ]);
      return {
        transactions: transactions.sort((a, b) => (a.date < b.date ? -1 : 1)),
        categories: categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        wallets: wallets.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        tags,
        settings,
      };
    },

    fetchTransactions: loadTx,
    fetchCategories: loadCats,
    fetchWallets: loadWallets,
    fetchTags: loadTags,
    fetchSettings: loadSettings,

    addTransaction: async (t) => { const l = await loadTx(); l.push(t); await saveTx(l); },
    addTransactions: async (txs) => { const l = await loadTx(); l.push(...txs); await saveTx(l); },
    updateTransaction: async (t) => { const l = await loadTx(); await saveTx(l.map((x) => (x.id === t.id ? t : x))); },
    deleteTransaction: async (id) => { const l = await loadTx(); await saveTx(l.filter((x) => x.id !== id)); },

    addCategory: async ({ name, kind, icon }) => {
      const l = await loadCats();
      l.push({ id: newId(), name, kind, icon: icon || DEFAULT_ICON, status: 'active', order: l.length });
      await saveCats(l);
    },
    setCategoryStatus: async (id, status) => { const l = await loadCats(); await saveCats(l.map((c) => (c.id === id ? { ...c, status } : c))); },
    updateCategory: async (id, patch) => { const l = await loadCats(); await saveCats(l.map((c) => (c.id === id ? { ...c, ...patch } : c))); },
    renameCategory: async (oldName, newName) => { const l = await loadTx(); await saveTx(l.map((t) => (t.category === oldName ? { ...t, category: newName } : t))); },

    addWallet: async ({ name, currency, kind, rate }) => { const l = await loadWallets(); l.push({ name, currency, status: 'active', order: l.length, kind: kind || 'cash', rate: Number(rate) || 0 }); await saveWallets(l); },
    updateWallet: async (wallet, patch) => { const l = await loadWallets(); await saveWallets(l.map((w) => (w.name === wallet.name ? { ...w, ...patch } : w))); },
    setWalletStatus: async (wallet, status) => { const l = await loadWallets(); await saveWallets(l.map((w) => (w.name === wallet.name ? { ...w, status } : w))); },
    renameWallet: async (oldName, newName) => { const l = await loadTx(); await saveTx(l.map((t) => (t.wallet === oldName ? { ...t, wallet: newName } : t))); },

    addTag: async (name) => { const l = await loadTags(); if (!l.some((t) => t.name === name)) { l.push({ name, status: 'active' }); await saveTags(l); } },
    setTagStatus: async (name, status) => { const l = await loadTags(); await saveTags(l.map((t) => (t.name === name ? { ...t, status } : t))); },
    renameTag: async (oldName, newName) => {
      const l = await loadTags();
      const seen = new Set();
      const next = [];
      for (const t of l) {
        const name = t.name === oldName ? newName : t.name;
        if (seen.has(name)) continue;
        seen.add(name);
        next.push({ name, status: t.status });
      }
      await saveTags(next);
      const txs = await loadTx();
      await saveTx(txs.map((t) => (
        (t.tags || []).includes(oldName)
          ? { ...t, tags: [...new Set(t.tags.map((x) => (x === oldName ? newName : x)))] }
          : t
      )));
    },

    setSetting: async (key, value) => { const s = await loadSettings(); s[key] = value; await saveSettings(s); },
  };
}
