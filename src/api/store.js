// Высокоуровневая модель данных поверх Google Sheets.
//
// Листы:
//   Transactions: id|datetime|type|amount|category|note|tags|wallet|currency|origAmount|origCurrency|transferId|rate
//     datetime — «YYYY-MM-DD HH:MM» или «YYYY-MM-DD» (в приложении хранится как date + time)
//     type    — 'expense' | 'income' | 'transfer_out' | 'transfer_in'
//               | 'adjust_in' | 'adjust_out' | 'interest_in' | 'interest_out'
//     amount  — сумма в валюте кошелька
//     wallet  — название кошелька; currency — валюта кошелька (денормализовано)
//     origAmount/origCurrency — если операция введена в другой валюте
//     transferId — связывает две ноги перевода между кошельками
//     rate    — ставка процентов (%), только для interest_in/out (колонка M)
//   Categories:   name|kind|status|icon
//   Wallets:      name|currency|status|order|kind|rate
//     name — идентичность кошелька (уникальна); операции ссылаются на него по названию
//     kind — 'cash' (обычный) | 'debt' (долговой кошелёк на контрагента)
//     rate — ставка для ручного начисления процентов, % (0 = не начисляем)
//   Tags:         name|status
//     status — 'active' | 'archived' ('archived' = удалённый тег, скрыт из подсказок)
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
const WALLET_HEADER = ['name', 'currency', 'status', 'order', 'kind', 'rate'];
const TAG_HEADER = ['name', 'status'];
const SETTINGS_HEADER = ['key', 'value'];

const DEFAULT_CATEGORY_ROWS = DEFAULT_CATEGORIES.map((c) => [c.name, c.kind, 'active', c.icon]);

function defaultWalletRow() {
  return ['Основной', DEFAULT_BASE_CURRENCY, 'active', 0, 'cash', 0];
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

  // Кошельки теперь опознаются по названию — убираем колонку id и
  // переписываем ссылки в операциях с id на название (одноразово, по разметке листа).
  await migrateWalletsToNameKey(id);

  // Разово обновляем шапки столбцов (после добавления новых полей они устарели).
  const hdrKey = `freemoney:hdr5:${id}`;
  if (!localStorage.getItem(hdrKey)) {
    await batchUpdateValues(id, [
      // 13-й столбец (M) теперь rate — ставка процентов.
      { range: `${SHEET_TX}!A1:M1`, values: [[...TX_HEADER, 'rate']] },
      { range: `${SHEET_CAT}!A1:D1`, values: [CAT_HEADER] },
      { range: `${SHEET_WALLET}!A1:F1`, values: [WALLET_HEADER] },
      { range: `${SHEET_TAG}!A1:B1`, values: [TAG_HEADER] },
      { range: `${SHEET_SETTINGS}!A1:B1`, values: [SETTINGS_HEADER] },
    ]);
    localStorage.setItem(hdrKey, '1');
  }
}

// Миграция старой раскладки листа Wallets (id|name|…) на новую (name|…).
// Опознаём по заголовку A1: 'id' → старый лист. Ремапим ссылки в операциях
// (колонка H) с id кошелька на его название и переписываем лист без колонки id.
// Идемпотентна и не зависит от устройства (детект по содержимому листа).
async function migrateWalletsToNameKey(id) {
  const header = await getValues(id, `${SHEET_WALLET}!A1:A1`);
  if (header[0]?.[0] !== 'id') return; // уже мигрировано либо лист пуст

  const rows = await getValues(id, `${SHEET_WALLET}!A2:G`);
  const old = rows
    .filter((r) => r[0])
    .map((r) => ({
      id: r[0], name: r[1] || '', currency: r[2] || DEFAULT_BASE_CURRENCY,
      status: r[3] || 'active', order: Number(r[4]) || 0, kind: r[5] || 'cash', rate: Number(r[6]) || 0,
    }));
  const nameById = new Map(old.map((w) => [w.id, w.name]));

  // Ссылки в операциях: колонка H (индекс 7) — с id на название.
  const txRows = await getValues(id, `${SHEET_TX}!A2:M`);
  const txUpdates = [];
  txRows.forEach((r, index) => {
    const ref = r[7];
    if (ref && nameById.has(ref)) {
      txUpdates.push({ range: `${SHEET_TX}!H${index + 2}`, values: [[nameById.get(ref)]] });
    }
  });
  if (txUpdates.length) await batchUpdateValues(id, txUpdates);

  // Переписываем лист кошельков в новой раскладке (A:F), очищая бывшую колонку rate (G).
  const newRows = old.map((w) => [w.name, w.currency, w.status, w.order, w.kind, w.rate, '']);
  await updateValues(id, `${SHEET_WALLET}!A1:G${old.length + 1}`, [
    [...WALLET_HEADER, ''],
    ...newRows,
  ]);
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
      // Время из datetime (HH:MM или HH:MM:SS), либо из старой колонки; иначе 00:00.
      const time = dt.length > 10 ? dt.slice(11) : (r[12] || '00:00');
      // Колонка M переиспользована под ставку процентов (rate). Для старых
      // строк там могло лежать время — но rate читают только процентные операции.
      const rateNum = Number(r[12]);
      const rate = r[12] != null && r[12] !== '' && !Number.isNaN(rateNum) ? rateNum : null;
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
        rate,
      };
    });
}

export async function fetchTransactions(id) {
  const rows = await getValues(id, `${SHEET_TX}!A2:M`);
  return mapTxRows(rows);
}

function txToRow(t) {
  const datetime = t.date ? `${t.date} ${t.time || '00:00'}` : '';
  // 13-я колонка (M) — ставка процентов rate (только для interest_*).
  return [
    t.id, datetime, t.type, t.amount, t.category || '', t.note || '', serializeTags(t.tags),
    t.wallet || '', t.currency || '', t.origAmount ?? '', t.origCurrency || '', t.transferId || '',
    t.rate ?? '',
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
  // 13 колонок A:M, последняя (M) — rate.
  await updateValues(id, `${SHEET_TX}!A${row}:M${row}`, [txToRow(tx)]);
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
      name: r[0] || '',
      currency: r[1] || DEFAULT_BASE_CURRENCY,
      status: r[2] || 'active',
      order: Number(r[3]) || 0,
      kind: r[4] || 'cash',
      rate: Number(r[5]) || 0,
    }));
}

export async function fetchWallets(id) {
  const rows = await getValues(id, `${SHEET_WALLET}!A2:F`);
  return mapWalletRows(rows);
}

export async function addWallet(id, { name, currency, kind, rate }) {
  const existing = await fetchWallets(id);
  await appendRow(id, `${SHEET_WALLET}!A1`, [
    name, currency, 'active', existing.length, kind || 'cash', rate || 0,
  ]);
}

export async function updateWallet(id, rowNumber, { name, currency, kind, rate }) {
  await batchUpdateValues(id, [
    { range: `${SHEET_WALLET}!A${rowNumber}:B${rowNumber}`, values: [[name, currency]] },
    { range: `${SHEET_WALLET}!E${rowNumber}:F${rowNumber}`, values: [[kind || 'cash', rate || 0]] },
  ]);
}

export async function setWalletStatus(id, rowNumber, status) {
  await updateValues(id, `${SHEET_WALLET}!C${rowNumber}`, [[status]]);
}

// Переименование кошелька во всех операциях (колонка H) — название теперь ключ,
// поэтому старые ссылки надо переписать на новое имя.
export async function renameWalletInTransactions(id, oldName, newName) {
  const rows = await getValues(id, `${SHEET_TX}!A2:M`);
  const data = [];
  rows.forEach((r, index) => {
    if (r[7] === oldName) data.push({ range: `${SHEET_TX}!H${index + 2}`, values: [[newName]] });
  });
  if (data.length) await batchUpdateValues(id, data);
}

// --- Теги -------------------------------------------------------------------

function mapTagRows(rows) {
  return rows
    .filter((r) => r[0])
    .map((r) => ({ name: r[0], status: r[1] || 'active' }));
}

export async function fetchTags(id) {
  const rows = await getValues(id, `${SHEET_TAG}!A2:B`);
  return mapTagRows(rows);
}

export async function addTag(id, name) {
  await appendRow(id, `${SHEET_TAG}!A1`, [name, 'active']);
}

// «Удаление» тега = архивирование: убираем из подсказок, но храним и операции не трогаем.
export async function setTagStatus(id, name, status) {
  const rows = await getValues(id, `${SHEET_TAG}!A2:A`);
  const index = rows.findIndex((r) => r[0] === name);
  if (index < 0) return;
  await updateValues(id, `${SHEET_TAG}!B${index + 2}`, [[status]]);
}

// Переименование тега: и в списке подсказок, и во всех операциях. Статус сохраняем.
export async function renameTag(id, oldName, newName) {
  const seen = new Set();
  const nextTags = [];
  for (const t of await fetchTags(id)) {
    const name = t.name === oldName ? newName : t.name;
    if (seen.has(name)) continue;
    seen.add(name);
    nextTags.push({ name, status: t.status });
  }
  await updateValues(id, `${SHEET_TAG}!A2:B1000`, Array.from({ length: 999 }, () => ['', '']));
  if (nextTags.length) {
    await updateValues(id, `${SHEET_TAG}!A2`, nextTags.map((t) => [t.name, t.status]));
  }
  const rows = await getValues(id, `${SHEET_TX}!A2:M`);
  const data = [];
  rows.forEach((r, index) => {
    const rowTags = parseTags(r[6]);
    if (!rowTags.includes(oldName)) return;
    const renamed = [...new Set(rowTags.map((t) => (t === oldName ? newName : t)))];
    data.push({ range: `${SHEET_TX}!G${index + 2}`, values: [[serializeTags(renamed)]] });
  });
  if (data.length) await batchUpdateValues(id, data);
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
    `${SHEET_WALLET}!A2:F`,
    `${SHEET_TAG}!A2:B`,
    `${SHEET_SETTINGS}!A2:B`,
  ]);
  return {
    transactions: mapTxRows(txRows),
    categories: mapCatRows(catRows),
    wallets: mapWalletRows(walletRows),
    tags: mapTagRows(tagRows),
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
