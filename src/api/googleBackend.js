// Бэкенд «Google Таблицы»: адаптер над store.js к единому интерфейсу хранилища.
// id категории/кошелька — номер строки на соответствующем листе.

import {
  ensureSchema,
  fetchAll,
  fetchTransactions,
  fetchCategories,
  fetchWallets,
  fetchTags,
  fetchSettings,
  addTransaction,
  addTransactions,
  updateTransaction,
  deleteTransaction,
  addCategory,
  setCategoryStatus,
  updateCategory,
  renameCategoryInTransactions,
  addWallet,
  updateWallet,
  setWalletStatus,
  addTag,
  deleteTag,
  setSetting,
} from './store';

export function createGoogleBackend(spreadsheetId) {
  return {
    kind: 'google',
    spreadsheetId,

    ensureSchema: () => ensureSchema(spreadsheetId),

    // Одно чтение всех данных (categories: row -> id).
    fetchAll: async () => {
      const data = await fetchAll(spreadsheetId);
      return { ...data, categories: data.categories.map((c) => ({ id: c.row, ...c })) };
    },

    fetchTransactions: () => fetchTransactions(spreadsheetId),

    fetchCategories: async () => {
      const cats = await fetchCategories(spreadsheetId);
      return cats.map((c) => ({ id: c.row, ...c }));
    },

    fetchWallets: async () => {
      const wallets = await fetchWallets(spreadsheetId);
      // id кошелька — собственный (генерится), row нужен для правок.
      return wallets;
    },

    fetchTags: () => fetchTags(spreadsheetId),

    fetchSettings: () => fetchSettings(spreadsheetId),

    addTransaction: (tx) => addTransaction(spreadsheetId, tx),
    addTransactions: (txs) => addTransactions(spreadsheetId, txs),
    updateTransaction: (tx) => updateTransaction(spreadsheetId, tx),
    deleteTransaction: (txId) => deleteTransaction(spreadsheetId, txId),

    addCategory: (cat) => addCategory(spreadsheetId, cat),
    setCategoryStatus: (id, status) => setCategoryStatus(spreadsheetId, id, status),
    updateCategory: (id, patch) => updateCategory(spreadsheetId, id, patch),
    renameCategory: (oldName, newName) =>
      renameCategoryInTransactions(spreadsheetId, oldName, newName),

    addWallet: (w) => addWallet(spreadsheetId, w),
    updateWallet: (wallet, patch) => updateWallet(spreadsheetId, wallet.row, patch),
    setWalletStatus: (wallet, status) => setWalletStatus(spreadsheetId, wallet.row, status),

    addTag: (name) => addTag(spreadsheetId, name),
    deleteTag: (name) => deleteTag(spreadsheetId, name),

    setSetting: (key, value) => setSetting(spreadsheetId, key, value),
  };
}
