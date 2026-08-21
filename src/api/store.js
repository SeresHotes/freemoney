// Высокоуровневая модель данных поверх Google Sheets.
//
// Структура таблицы:
//   Лист "Transactions": id | date | type | amount | category | note | tags
//     type    — 'expense' | 'income'
//     tags    — произвольное число тегов, хранятся через запятую в одной ячейке
//   Лист "Categories":   name | kind | status | icon
//     kind    — 'expense' | 'income' | 'both'
//     status  — 'active' | 'archived'   (удаление = архивирование, строки не удаляем)
//     icon    — эмодзи категории

import {
  createSpreadsheet,
  getValues,
  appendRow,
  updateValues,
  listAppSpreadsheets,
} from './sheets';
import { SPREADSHEET_TITLE } from '../config';
import { DEFAULT_CATEGORIES, DEFAULT_ICON } from './defaults';

export const SHEET_TX = 'Transactions';
export const SHEET_CAT = 'Categories';

const TX_HEADER = ['id', 'date', 'type', 'amount', 'category', 'note', 'tags'];
const CAT_HEADER = ['name', 'kind', 'status', 'icon'];

// Базовые категории в виде строк листа Categories.
const DEFAULT_CATEGORY_ROWS = DEFAULT_CATEGORIES.map((c) => [
  c.name,
  c.kind,
  'active',
  c.icon,
]);

// Создать новую таблицу с двумя листами, шапками и базовыми категориями.
// title — желаемое имя таблицы (по умолчанию SPREADSHEET_TITLE).
export async function initSpreadsheet(title = SPREADSHEET_TITLE) {
  const name = title.trim() || SPREADSHEET_TITLE;
  const spreadsheet = await createSpreadsheet(name, [
    { properties: { title: SHEET_TX } },
    { properties: { title: SHEET_CAT } },
  ]);
  const id = spreadsheet.spreadsheetId;
  await updateValues(id, `${SHEET_TX}!A1`, [TX_HEADER]);
  await updateValues(id, `${SHEET_CAT}!A1`, [CAT_HEADER, ...DEFAULT_CATEGORY_ROWS]);
  return id;
}

export async function findExistingSpreadsheets() {
  return listAppSpreadsheets();
}

// --- Транзакции -------------------------------------------------------------

export async function fetchTransactions(id) {
  const rows = await getValues(id, `${SHEET_TX}!A2:G`);
  return rows
    .filter((r) => r[0]) // пропускаем пустые строки
    .map((r) => ({
      id: r[0],
      date: r[1] || '',
      type: r[2] || 'expense',
      amount: Number(r[3]) || 0,
      category: r[4] || '',
      note: r[5] || '',
      tags: parseTags(r[6]),
    }));
}

export async function addTransaction(id, tx) {
  const row = [
    tx.id,
    tx.date,
    tx.type,
    tx.amount,
    tx.category,
    tx.note || '',
    serializeTags(tx.tags),
  ];
  await appendRow(id, `${SHEET_TX}!A1`, row);
}

// Теги в ячейке хранятся через запятую; парсим в массив уникальных значений.
function parseTags(cell) {
  if (!cell) return [];
  return [...new Set(String(cell).split(',').map((t) => t.trim()).filter(Boolean))];
}

function serializeTags(tags) {
  if (!Array.isArray(tags)) return '';
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))].join(', ');
}

// --- Категории --------------------------------------------------------------

export async function fetchCategories(id) {
  const rows = await getValues(id, `${SHEET_CAT}!A2:D`);
  return rows
    .filter((r) => r[0])
    .map((r, index) => ({
      // Номер строки в таблице (1 — шапка, данные с 2). Стабилен, т.к. не удаляем строки.
      row: index + 2,
      name: r[0],
      kind: r[1] || 'both',
      status: r[2] || 'active',
      icon: r[3] || DEFAULT_ICON, // старые таблицы без колонки icon получают дефолт
    }));
}

export async function addCategory(id, { name, kind, icon }) {
  await appendRow(id, `${SHEET_CAT}!A1`, [name, kind, 'active', icon || DEFAULT_ICON]);
}

// Архивирование / восстановление категории — правим только колонку status.
export async function setCategoryStatus(id, rowNumber, status) {
  await updateValues(id, `${SHEET_CAT}!C${rowNumber}`, [[status]]);
}
