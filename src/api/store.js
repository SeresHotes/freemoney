// Высокоуровневая модель данных поверх Google Sheets.
//
// Структура таблицы:
//   Лист "Transactions": id | date | type | amount | category | note
//     type    — 'expense' | 'income'
//   Лист "Categories":   name | kind | status
//     kind    — 'expense' | 'income' | 'both'
//     status  — 'active' | 'archived'   (удаление = архивирование, строки не удаляем)

import {
  createSpreadsheet,
  getValues,
  appendRow,
  updateValues,
  listAppSpreadsheets,
} from './sheets';
import { SPREADSHEET_TITLE } from '../config';

export const SHEET_TX = 'Transactions';
export const SHEET_CAT = 'Categories';

const TX_HEADER = ['id', 'date', 'type', 'amount', 'category', 'note'];
const CAT_HEADER = ['name', 'kind', 'status'];

// Базовые категории при создании таблицы.
const DEFAULT_CATEGORIES = [
  ['Зарплата', 'income', 'active'],
  ['Прочий доход', 'income', 'active'],
  ['Продукты', 'expense', 'active'],
  ['Кафе и рестораны', 'expense', 'active'],
  ['Транспорт', 'expense', 'active'],
  ['Жильё', 'expense', 'active'],
  ['Развлечения', 'expense', 'active'],
  ['Здоровье', 'expense', 'active'],
  ['Одежда', 'expense', 'active'],
  ['Прочее', 'both', 'active'],
];

// Создать новую таблицу с двумя листами, шапками и базовыми категориями.
export async function initSpreadsheet() {
  const spreadsheet = await createSpreadsheet(SPREADSHEET_TITLE, [
    { properties: { title: SHEET_TX } },
    { properties: { title: SHEET_CAT } },
  ]);
  const id = spreadsheet.spreadsheetId;
  await updateValues(id, `${SHEET_TX}!A1`, [TX_HEADER]);
  await updateValues(id, `${SHEET_CAT}!A1`, [CAT_HEADER, ...DEFAULT_CATEGORIES]);
  return id;
}

export async function findExistingSpreadsheets() {
  return listAppSpreadsheets();
}

// --- Транзакции -------------------------------------------------------------

export async function fetchTransactions(id) {
  const rows = await getValues(id, `${SHEET_TX}!A2:F`);
  return rows
    .filter((r) => r[0]) // пропускаем пустые строки
    .map((r) => ({
      id: r[0],
      date: r[1] || '',
      type: r[2] || 'expense',
      amount: Number(r[3]) || 0,
      category: r[4] || '',
      note: r[5] || '',
    }));
}

export async function addTransaction(id, tx) {
  const row = [tx.id, tx.date, tx.type, tx.amount, tx.category, tx.note || ''];
  await appendRow(id, `${SHEET_TX}!A1`, row);
}

// --- Категории --------------------------------------------------------------

export async function fetchCategories(id) {
  const rows = await getValues(id, `${SHEET_CAT}!A2:C`);
  return rows
    .filter((r) => r[0])
    .map((r, index) => ({
      // Номер строки в таблице (1 — шапка, данные с 2). Стабилен, т.к. не удаляем строки.
      row: index + 2,
      name: r[0],
      kind: r[1] || 'both',
      status: r[2] || 'active',
    }));
}

export async function addCategory(id, { name, kind }) {
  await appendRow(id, `${SHEET_CAT}!A1`, [name, kind, 'active']);
}

// Архивирование / восстановление категории — правим только колонку status.
export async function setCategoryStatus(id, rowNumber, status) {
  await updateValues(id, `${SHEET_CAT}!C${rowNumber}`, [[status]]);
}
