// Бэкенд «Google Таблицы»: адаптер над store.js к единому интерфейсу хранилища.
// id категории — номер строки на листе; кошелёк опознаётся по названию,
// а его row нужен лишь для точечных правок строки листа.

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
  renameWalletInTransactions,
  addTag,
  setTagStatus,
  renameTag,
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

    fetchWallets: () => fetchWallets(spreadsheetId),

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
    renameWallet: (oldName, newName) => renameWalletInTransactions(spreadsheetId, oldName, newName),

    addTag: (name) => addTag(spreadsheetId, name),
    setTagStatus: (name, status) => setTagStatus(spreadsheetId, name, status),
    renameTag: (oldName, newName) => renameTag(spreadsheetId, oldName, newName),

    setSetting: (key, value) => setSetting(spreadsheetId, key, value),
  };
}
