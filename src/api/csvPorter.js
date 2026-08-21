// Экспорт и импорт данных в CSV. Работает поверх любого бэкенда хранилища.

import { toCsv, parseCsv, downloadFile } from '../utils/csv';
import { newId } from '../utils/format';

const TX_COLUMNS = ['id', 'date', 'type', 'amount', 'category', 'note', 'tags'];
const CAT_COLUMNS = ['name', 'kind', 'status', 'icon'];

// --- Экспорт ----------------------------------------------------------------

export function exportTransactionsCsv(transactions) {
  const rows = [TX_COLUMNS];
  for (const t of transactions) {
    rows.push([t.id, t.date, t.type, t.amount, t.category, t.note || '', (t.tags || []).join(', ')]);
  }
  downloadFile('freemoney-transactions.csv', toCsv(rows));
}

export function exportCategoriesCsv(categories) {
  const rows = [CAT_COLUMNS];
  for (const c of categories) {
    rows.push([c.name, c.kind, c.status, c.icon]);
  }
  downloadFile('freemoney-categories.csv', toCsv(rows));
}

// --- Импорт -----------------------------------------------------------------

// Сопоставляет заголовок CSV с индексами колонок.
function headerIndex(header, columns) {
  const map = {};
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const col of columns) map[col] = lower.indexOf(col);
  return map;
}

// Импорт транзакций: добавляет операции, которых ещё нет (по id).
// Возвращает число добавленных.
export async function importTransactionsCsv(text, backend, existingTransactions) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) return 0;
  const idx = headerIndex(rows[0], TX_COLUMNS);
  const existingIds = new Set(existingTransactions.map((t) => t.id));
  let added = 0;

  for (const row of rows.slice(1)) {
    const amount = Number(String(row[idx.amount] ?? '').replace(',', '.'));
    if (!amount) continue;
    const id = (idx.id >= 0 && row[idx.id]) || newId();
    if (existingIds.has(id)) continue;
    const tags = (idx.tags >= 0 ? row[idx.tags] || '' : '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await backend.addTransaction({
      id,
      date: (idx.date >= 0 && row[idx.date]) || '',
      type: row[idx.type] === 'income' ? 'income' : 'expense',
      amount,
      category: (idx.category >= 0 && row[idx.category]) || '',
      note: (idx.note >= 0 && row[idx.note]) || '',
      tags,
    });
    existingIds.add(id);
    added += 1;
  }
  return added;
}

// Импорт категорий: добавляет отсутствующие по имени.
export async function importCategoriesCsv(text, backend, existingCategories) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) return 0;
  const idx = headerIndex(rows[0], CAT_COLUMNS);
  const existingNames = new Set(existingCategories.map((c) => c.name.toLowerCase()));
  let added = 0;

  for (const row of rows.slice(1)) {
    const name = (idx.name >= 0 && row[idx.name] || '').trim();
    if (!name || existingNames.has(name.toLowerCase())) continue;
    const kind = ['expense', 'income', 'both'].includes(row[idx.kind]) ? row[idx.kind] : 'expense';
    await backend.addCategory({ name, kind, icon: (idx.icon >= 0 && row[idx.icon]) || undefined });
    existingNames.add(name.toLowerCase());
    added += 1;
  }
  return added;
}
