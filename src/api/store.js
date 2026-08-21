// Высокоуровневая модель данных поверх Google Sheets.
//
// Листы:
//   Transactions: id|date|type|amount|category|note|tags|wallet|currency|origAmount|origCurrency|transferId
//     type    — 'expense' | 'income' | 'transfer_out' | 'transfer_in'
//     amount  — сумма в валюте кошелька
//     wallet  — id кошелька; currency — валюта кошелька (денормализовано)
//     origAmount/origCurrency — если операция введена в другой валюте
//     transferId — связывает две ноги перевода между кошельками
//   Categories:   name|kind|status|icon
//   Wallets:      id|name|currency|status|order
//   Tags:         name
//   Settings:     key|value

import {
  createSpreadsheet,
  getValues,
  appendRow,
  updateValues,
  batchUpdateValues,
  getSpreadsheetMeta,
  addSheet,
  listAppSpreadsheets,
} from './sheets';
import { SPREADSHEET_TITLE, DEFAULT_BASE_CURRENCY } from '../config';
import { DEFAULT_CATEGORIES, DEFAULT_ICON } from './defaults';
import { newId } from '../utils/format';

export const SHEET_TX = 'Transactions';
export const SHEET_CAT = 'Categories';
export const SHEET_WALLET = 'Wallets';
export const SHEET_TAG = 'Tags';
export const SHEET_SETTINGS = 'Settings';

const TX_HEADER = [
  'id', 'date', 'type', 'amount', 'category', 'note', 'tags',
  'wallet', 'currency', 'origAmount', 'origCurrency', 'transferId',
];
const CAT_HEADER = ['name', 'kind', 'status', 'icon'];
const WALLET_HEADER = ['id', 'name', 'currency', 'status', 'order'];
const TAG_HEADER = ['name'];
const SETTINGS_HEADER = ['key', 'value'];

const DEFAULT_CATEGORY_ROWS = DEFAULT_CATEGORIES.map((c) => [c.name, c.kind, 'active', c.icon]);

function defaultWalletRow() {
  return [newId(), 'Основной', DEFAULT_BASE_CURRENCY, 'active', 0];
}

// --- Создание и схема -------------------------------------------------------

export async function initSpreadsheet(title = SPREADSHEET_TITLE) {
  const name = title.trim() || SPREADSHEET_TITLE;
  const spreadsheet = await createSpreadsheet(name, [
    { properties: { title: SHEET_TX } },
    { properties: { title: SHEET_CAT } },
    { properties: { title: SHEET_WALLET } },
    { properties: { title: SHEET_TAG } },
    { properties: { title: SHEET_SETTINGS } },
  ]);
  const id = spreadsheet.spreadsheetId;
  await updateValues(id, `${SHEET_TX}!A1`, [TX_HEADER]);
  await updateValues(id, `${SHEET_CAT}!A1`, [CAT_HEADER, ...DEFAULT_CATEGORY_ROWS]);
  await updateValues(id, `${SHEET_WALLET}!A1`, [WALLET_HEADER, defaultWalletRow()]);
  await updateValues(id, `${SHEET_TAG}!A1`, [TAG_HEADER]);
  await updateValues(id, `${SHEET_SETTINGS}!A1`, [
    SETTINGS_HEADER,
    ['baseCurrency', DEFAULT_BASE_CURRENCY],
  ]);
  return id;
}

// Дозавести недостающие листы в уже существующей таблице (миграция).
export async function ensureSchema(id) {
  const meta = await getSpreadsheetMeta(id);
  const titles = new Set((meta.sheets || []).map((s) => s.properties.title));

  if (!titles.has(SHEET_WALLET)) {
    await addSheet(id, SHEET_WALLET);
    await updateValues(id, `${SHEET_WALLET}!A1`, [WALLET_HEADER, defaultWalletRow()]);
  }
  if (!titles.has(SHEET_TAG)) {
    await addSheet(id, SHEET_TAG);
    await updateValues(id, `${SHEET_TAG}!A1`, [TAG_HEADER]);
  }
  if (!titles.has(SHEET_SETTINGS)) {
    await addSheet(id, SHEET_SETTINGS);
    await updateValues(id, `${SHEET_SETTINGS}!A1`, [
      SETTINGS_HEADER,
      ['baseCurrency', DEFAULT_BASE_CURRENCY],
    ]);
  }
}

export async function findExistingSpreadsheets() {
  return listAppSpreadsheets();
}

// --- Транзакции -------------------------------------------------------------

function parseTags(cell) {
  if (!cell) return [];
  return [...new Set(String(cell).split(',').map((t) => t.trim()).filter(Boolean))];
}

function serializeTags(tags) {
  if (!Array.isArray(tags)) return '';
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))].join(', ');
}

export async function fetchTransactions(id) {
  const rows = await getValues(id, `${SHEET_TX}!A2:L`);
  return rows
    .filter((r) => r[0])
    .map((r) => ({
      id: r[0],
      date: r[1] || '',
      type: r[2] || 'expense',
      amount: Number(r[3]) || 0,
      category: r[4] || '',
      note: r[5] || '',
      tags: parseTags(r[6]),
      wallet: r[7] || '',
      currency: r[8] || '',
      origAmount: r[9] ? Number(r[9]) : null,
      origCurrency: r[10] || '',
      transferId: r[11] || '',
    }));
}

function txToRow(t) {
  return [
    t.id, t.date, t.type, t.amount, t.category || '', t.note || '', serializeTags(t.tags),
    t.wallet || '', t.currency || '', t.origAmount ?? '', t.origCurrency || '', t.transferId || '',
  ];
}

export async function addTransaction(id, tx) {
  await appendRow(id, `${SHEET_TX}!A1`, txToRow(tx));
}

// Добавить несколько транзакций одним запросом (перевод = 2 ноги).
export async function addTransactions(id, txs) {
  for (const tx of txs) {
    await appendRow(id, `${SHEET_TX}!A1`, txToRow(tx));
  }
}

// --- Категории --------------------------------------------------------------

export async function fetchCategories(id) {
  const rows = await getValues(id, `${SHEET_CAT}!A2:D`);
  return rows
    .filter((r) => r[0])
    .map((r, index) => ({
      row: index + 2,
      name: r[0],
      kind: r[1] || 'both',
      status: r[2] || 'active',
      icon: r[3] || DEFAULT_ICON,
    }));
}

export async function addCategory(id, { name, kind, icon }) {
  await appendRow(id, `${SHEET_CAT}!A1`, [name, kind, 'active', icon || DEFAULT_ICON]);
}

export async function setCategoryStatus(id, rowNumber, status) {
  await updateValues(id, `${SHEET_CAT}!C${rowNumber}`, [[status]]);
}

export async function updateCategory(id, rowNumber, { name, kind, icon }) {
  await batchUpdateValues(id, [
    { range: `${SHEET_CAT}!A${rowNumber}:B${rowNumber}`, values: [[name, kind]] },
    { range: `${SHEET_CAT}!D${rowNumber}`, values: [[icon]] },
  ]);
}

export async function renameCategoryInTransactions(id, oldName, newName) {
  const rows = await getValues(id, `${SHEET_TX}!A2:L`);
  const data = [];
  rows.forEach((r, index) => {
    if (r[4] === oldName) data.push({ range: `${SHEET_TX}!E${index + 2}`, values: [[newName]] });
  });
  await batchUpdateValues(id, data);
}

// --- Кошельки ---------------------------------------------------------------

export async function fetchWallets(id) {
  const rows = await getValues(id, `${SHEET_WALLET}!A2:E`);
  return rows
    .filter((r) => r[0])
    .map((r, index) => ({
      row: index + 2,
      id: r[0],
      name: r[1] || '',
      currency: r[2] || DEFAULT_BASE_CURRENCY,
      status: r[3] || 'active',
      order: Number(r[4]) || 0,
    }));
}

export async function addWallet(id, { name, currency }) {
  const existing = await fetchWallets(id);
  await appendRow(id, `${SHEET_WALLET}!A1`, [
    newId(), name, currency, 'active', existing.length,
  ]);
}

export async function updateWallet(id, rowNumber, { name, currency }) {
  await updateValues(id, `${SHEET_WALLET}!B${rowNumber}:C${rowNumber}`, [[name, currency]]);
}

export async function setWalletStatus(id, rowNumber, status) {
  await updateValues(id, `${SHEET_WALLET}!D${rowNumber}`, [[status]]);
}

// --- Теги -------------------------------------------------------------------

export async function fetchTags(id) {
  const rows = await getValues(id, `${SHEET_TAG}!A2:A`);
  return rows.map((r) => r[0]).filter(Boolean);
}

export async function addTag(id, name) {
  await appendRow(id, `${SHEET_TAG}!A1`, [name]);
}

// Удаление тега: убираем из списка (перезаписываем весь столбец) и из операций.
export async function deleteTag(id, name) {
  const tags = (await fetchTags(id)).filter((t) => t !== name);
  // Перезаписываем область тегов: сначала чистим с запасом, потом пишем оставшиеся.
  await updateValues(id, `${SHEET_TAG}!A2:A1000`, Array.from({ length: 999 }, () => ['']));
  if (tags.length) {
    await updateValues(id, `${SHEET_TAG}!A2`, tags.map((t) => [t]));
  }
  // Удаляем тег из всех операций.
  const rows = await getValues(id, `${SHEET_TX}!A2:L`);
  const data = [];
  rows.forEach((r, index) => {
    const current = parseTags(r[6]);
    if (current.includes(name)) {
      const next = current.filter((t) => t !== name);
      data.push({ range: `${SHEET_TX}!G${index + 2}`, values: [[serializeTags(next)]] });
    }
  });
  await batchUpdateValues(id, data);
}

// --- Настройки --------------------------------------------------------------

export async function fetchSettings(id) {
  const rows = await getValues(id, `${SHEET_SETTINGS}!A2:B`);
  const map = {};
  rows.forEach((r) => {
    if (r[0]) map[r[0]] = r[1] ?? '';
  });
  return map;
}

export async function setSetting(id, key, value) {
  const rows = await getValues(id, `${SHEET_SETTINGS}!A2:B`);
  const index = rows.findIndex((r) => r[0] === key);
  if (index >= 0) {
    await updateValues(id, `${SHEET_SETTINGS}!B${index + 2}`, [[value]]);
  } else {
    await appendRow(id, `${SHEET_SETTINGS}!A1`, [key, value]);
  }
}
