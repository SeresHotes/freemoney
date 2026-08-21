// Бэкенд «Google Таблицы»: адаптер над store.js к единому интерфейсу хранилища.
// Идентификатор категории (id) = номер строки в листе Categories.

import {
  fetchTransactions,
  fetchCategories,
  addTransaction,
  addCategory,
  setCategoryStatus,
  updateCategory,
  renameCategoryInTransactions,
} from './store';

export function createGoogleBackend(spreadsheetId) {
  return {
    kind: 'google',
    spreadsheetId,

    fetchTransactions: () => fetchTransactions(spreadsheetId),

    fetchCategories: async () => {
      const cats = await fetchCategories(spreadsheetId);
      // row → id, чтобы контекст не знал о специфике Sheets.
      return cats.map((c) => ({ id: c.row, ...c }));
    },

    addTransaction: (tx) => addTransaction(spreadsheetId, tx),

    addCategory: (cat) => addCategory(spreadsheetId, cat),

    setCategoryStatus: (id, status) => setCategoryStatus(spreadsheetId, id, status),

    updateCategory: (id, patch) => updateCategory(spreadsheetId, id, patch),

    renameCategory: (oldName, newName) =>
      renameCategoryInTransactions(spreadsheetId, oldName, newName),
  };
}
