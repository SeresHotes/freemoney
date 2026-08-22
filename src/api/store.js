// Высокоуровневая модель данных поверх Google Sheets.
//
// Листы:
//   Transactions: id|datetime|type|amount|category|note|tags|wallet|currency|origAmount|origCurrency|transferId
//     datetime — «YYYY-MM-DD HH:MM» или «YYYY-MM-DD» (в приложении хранится как date + time)
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
  getValuesBatch,
  appendRow,
  appendRows,
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
  'id', 'datetime', 'type', 'amount', 'category', 'note', 'tags',
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

  // Разово обновляем шапки столбцов (после добавления новых полей они устарели).
  const hdrKey = `freemoney:hdr3:${id}`;
  if (!localStorage.getItem(hdrKey)) {
    await batchUpdateValues(id, [
      // 13-й столбец очищаем от старого заголовка time.
      { range: `${SHEET_TX}!A1:M1`, values: [[...TX_HEADER, '']] },
      { range: `${SHEET_CAT}!A1:D1`, values: [CAT_HEADER] },
      { range: `${SHEET_WALLET}!A1:E1`, values: [WALLET_HEADER] },
      { range: `${SHEET_TAG}!A1`, values: [TAG_HEADER] },
      { range: `${SHEET_SETTINGS}!A1:B1`, values: [SETTINGS_HEADER] },
    ]);
    localStorage.setItem(hdrKey, '1');
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

function mapTxRows(rows) {
  return rows
    .filter((r) => r[0])
    .map((r) => {
      // Колонка datetime: «YYYY-MM-DD HH:MM» либо просто «YYYY-MM-DD».
      const dt = r[1] || '';
      const date = dt.slice(0, 10);
      // Время из datetime, либо из старой колонки; если нет — 00:00.
      const time = dt.length > 10 ? dt.slice(11, 16) : (r[12] || '00:00');
      return {
        id: r[0],
        date,
        time,
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
      };
    });
}

export async function fetchTransactions(id) {
  const rows = await getValues(id, `${SHEET_TX}!A2:M`);
  return mapTxRows(rows);
}

function txToRow(t) {
  const datetime = t.date ? `${t.date} ${t.time || '00:00'}` : '';
  return [
    t.id, datetime, t.type, t.amount, t.category || '', t.note || '', serializeTags(t.tags),
    t.wallet || '', t.currency || '', t.origAmount ?? '', t.origCurrency || '', t.transferId || '',
  ];
}

export async function addTransaction(id, tx) {
  await appendRow(id, `${SHEET_TX}!A1`, txToRow(tx));
}

// Добавить несколько транзакций одним запросом (перевод, импорт).
export async function addTransactions(id, txs) {
  if (!txs.length) return;
  await appendRows(id, `${SHEET_TX}!A1`, txs.map(txToRow));
}

async function findTxRow(id, txId) {
  const ids = await getValues(id, `${SHEET_TX}!A2:A`);
  const index = ids.findIndex((r) => r[0] === txId);
  return index < 0 ? null : index + 2;
}

export async function updateTransaction(id, tx) {
  const row = await findTxRow(id, tx.id);
  if (row == null) throw new Error('Операция не найдена');
  // Пишем 13 значений (последнее пустое), чтобы очистить старую колонку time (M).
  await updateValues(id, `${SHEET_TX}!A${row}:M${row}`, [[...txToRow(tx), '']]);
}

// Удаление = очистка строки (пустые строки отфильтровываются при чтении).
export async function deleteTransaction(id, txId) {
  const row = await findTxRow(id, txId);
  if (row == null) return;
  await updateValues(id, `${SHEET_TX}!A${row}:M${row}`, [Array(13).fill('')]);
}

// --- Категории --------------------------------------------------------------

function mapCatRows(rows) {
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

export async function fetchCategories(id) {
  const rows = await getValues(id, `${SHEET_CAT}!A2:D`);
  return mapCatRows(rows);
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
  const rows = await getValues(id, `${SHEET_TX}!A2:M`);
  const data = [];
  rows.forEach((r, index) => {
    if (r[4] === oldName) data.push({ range: `${SHEET_TX}!E${index + 2}`, values: [[newName]] });
  });
  await batchUpdateValues(id, data);
}

// --- Кошельки ---------------------------------------------------------------

function mapWalletRows(rows) {
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

export async function fetchWallets(id) {
  const rows = await getValues(id, `${SHEET_WALLET}!A2:E`);
  return mapWalletRows(rows);
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

// Удаление тега из списка подсказок (операции не трогаем).
export async function deleteTag(id, name) {
  const tags = (await fetchTags(id)).filter((t) => t !== name);
  // Перезаписываем область тегов: сначала чистим с запасом, потом пишем оставшиеся.
  await updateValues(id, `${SHEET_TAG}!A2:A1000`, Array.from({ length: 999 }, () => ['']));
  if (tags.length) {
    await updateValues(id, `${SHEET_TAG}!A2`, tags.map((t) => [t]));
  }
}

// --- Настройки --------------------------------------------------------------

function mapSettingsRows(rows) {
  const map = {};
  rows.forEach((r) => {
    if (r[0]) map[r[0]] = r[1] ?? '';
  });
  return map;
}

export async function fetchSettings(id) {
  const rows = await getValues(id, `${SHEET_SETTINGS}!A2:B`);
  return mapSettingsRows(rows);
}

// Одно чтение всех данных сразу (экономит квоту API).
export async function fetchAll(id) {
  const [txRows, catRows, walletRows, tagRows, settingsRows] = await getValuesBatch(id, [
    `${SHEET_TX}!A2:M`,
    `${SHEET_CAT}!A2:D`,
    `${SHEET_WALLET}!A2:E`,
    `${SHEET_TAG}!A2:A`,
    `${SHEET_SETTINGS}!A2:B`,
  ]);
  return {
    transactions: mapTxRows(txRows),
    categories: mapCatRows(catRows),
    wallets: mapWalletRows(walletRows),
    tags: tagRows.map((r) => r[0]).filter(Boolean),
    settings: mapSettingsRows(settingsRows),
  };
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
