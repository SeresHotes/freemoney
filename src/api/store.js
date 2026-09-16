// Google Таблица как реплика локальных данных для синхронизации.
//
// Схема листов — ПОЛНЫЙ суперсет полей приложения (ничего не теряется при
// round-trip) плюс служебные колонки синхронизации `updatedAt` и `deleted`:
//   Transactions: id|datetime|type|amount|category|note|tags|wallet|currency|
//                 origAmount|origCurrency|transferId|rate|updatedAt|deleted   (A:O)
//     datetime — «YYYY-MM-DD HH:MM[:SS]» (в приложении хранится как date + time)
//     type    — expense|income|transfer_in|transfer_out|adjust_in|adjust_out|
//               interest_in|interest_out
//   Categories: id|name|kind|status|icon|order|updatedAt|deleted              (A:H)
//   Wallets:    id|name|currency|status|order|kind|rate|updatedAt|deleted      (A:J)
//   Tags:       name|updatedAt|deleted                                        (A:C)
//   Settings:   key|value|updatedAt                                           (A:C)
//
// updatedAt — метка изменения (мс) для LWW-мерджа; deleted — tombstone ('1'/'').
// Лист остаётся читаемым и правится руками: изменения, внесённые в таблицу
// напрямую, sync распознаёт по расхождению со снапшотом (см. api/sync.js).
//
// Версия схемы хранится в служебном листе `_Meta` (ключ schemaVersion) — в самой
// таблице, а не в localStorage, поэтому любое устройство видит реальную версию и
// доводит недостающие миграции (см. SCHEMA_VERSION / MIGRATIONS ниже). Лист
// `_Meta` не входит в синхронизируемые сущности и sync его не трогает.

import {
  createSpreadsheet,
  getValues,
  getValuesBatch,
  updateValues,
  batchUpdateValues,
  clearValues,
  getSpreadsheetMeta,
  addSheet,
  listAppSpreadsheets,
} from './sheets';
import { SPREADSHEET_TITLE, DEFAULT_BASE_CURRENCY } from '../config';
import { DEFAULT_ICON } from './defaults';

export const SHEET_TX = 'Transactions';
export const SHEET_CAT = 'Categories';
export const SHEET_WALLET = 'Wallets';
export const SHEET_TAG = 'Tags';
export const SHEET_SETTINGS = 'Settings';
export const SHEET_META = '_Meta'; // служебный: версия схемы, не синхронизируется

const TX_HEADER = [
  'id', 'datetime', 'type', 'amount', 'category', 'note', 'tags',
  'wallet', 'currency', 'origAmount', 'origCurrency', 'transferId', 'rate',
  'updatedAt', 'deleted',
];
// ВАЖНО: новые колонки (id/order/updatedAt/deleted) добавлены В КОНЕЦ, а старые
// name|kind|status|icon остаются на местах A–D. Иначе у существующих таблиц
// (старая схема name|kind|status|icon) данные читались бы со сдвигом.
const CAT_HEADER = ['name', 'kind', 'status', 'icon', 'id', 'order', 'updatedAt', 'deleted'];
const WALLET_HEADER = ['id', 'name', 'currency', 'status', 'order', 'kind', 'rate', 'updatedAt', 'deleted'];
const TAG_HEADER = ['name', 'status', 'updatedAt', 'deleted'];
const SETTINGS_HEADER = ['key', 'value', 'updatedAt'];
const META_HEADER = ['key', 'value'];
const SCHEMA_VERSION_KEY = 'schemaVersion';

// Миграции схемы Google-таблицы, по порядку. Индекс+1 = целевая версия: элемент i
// приводит таблицу с версии i к версии i+1. Каждая миграция ДОЛЖНА быть
// идемпотентной (её могут прогнать повторно на частично мигрированной таблице).
// Добавление новой версии = дописать функцию в конец массива — SCHEMA_VERSION
// пересчитается сам, а старые таблицы догонят недостающие шаги при синхронизации.
const MIGRATIONS = [
  // v0 → v1: привести шапки всех листов к текущему суперсету колонок. Колонки
  // только дописывались в конец (данные позиционные), поэтому перезапись
  // заголовков безопасна и для таблиц старой схемы. Раньше это делалось разово по
  // localStorage-флагу (freemoney:hdrN) — теперь версия живёт в самой таблице.
  async (id) => {
    await batchUpdateValues(id, [
      { range: `${SHEET_TX}!A1:O1`, values: [TX_HEADER] },
      { range: `${SHEET_CAT}!A1:H1`, values: [CAT_HEADER] },
      { range: `${SHEET_WALLET}!A1:J1`, values: [WALLET_HEADER] },
      { range: `${SHEET_TAG}!A1:D1`, values: [TAG_HEADER] },
      { range: `${SHEET_SETTINGS}!A1:C1`, values: [SETTINGS_HEADER] },
    ]);
  },
];
// Текущая версия схемы = число миграций. Пре-версионные таблицы (без листа _Meta)
// считаются версией 0 и догоняются до этой отметки.
export const SCHEMA_VERSION = MIGRATIONS.length;

// --- Кодирование ячеек ------------------------------------------------------

const encBool = (v) => (v ? '1' : '');
const decBool = (v) => v === '1' || v === 'TRUE' || v === 'true' || v === true;
const decNum = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

function parseTags(cell) {
  if (!cell) return [];
  return [...new Set(String(cell).split(',').map((t) => t.trim()).filter(Boolean))];
}
function serializeTags(tags) {
  if (!Array.isArray(tags)) return '';
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))].join(', ');
}

// --- Строка ↔ каноническая запись (по одной паре на сущность) ----------------

function txToRow(t) {
  const datetime = t.date ? `${t.date} ${t.time || '00:00'}` : '';
  return [
    t.id, datetime, t.type, t.amount, t.category || '', t.note || '', serializeTags(t.tags),
    t.wallet || '', t.currency || '', t.origAmount ?? '', t.origCurrency || '', t.transferId || '',
    t.rate ?? '', String(t.updatedAt || 0), encBool(t.deleted),
  ];
}
function rowToTx(r) {
  const dt = r[1] || '';
  const date = dt.slice(0, 10);
  const time = dt.length > 10 ? dt.slice(11) : '00:00';
  const rateCell = r[12];
  const rate = rateCell != null && rateCell !== '' && !Number.isNaN(Number(rateCell)) ? Number(rateCell) : null;
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
    updatedAt: decNum(r[13]),
    deleted: decBool(r[14]),
  };
}

function catToRow(c) {
  return [
    c.name, c.kind || 'both', c.status || 'active', c.icon || DEFAULT_ICON,
    c.id || '', c.order ?? 0, String(c.updatedAt || 0), encBool(c.deleted),
  ];
}
function rowToCat(r, index) {
  return {
    name: r[0] || '',
    kind: r[1] || 'both',
    status: r[2] || 'active',
    icon: r[3] || DEFAULT_ICON,
    id: r[4] || '',
    order: r[5] === '' || r[5] == null ? index : decNum(r[5]),
    updatedAt: decNum(r[6]),
    deleted: decBool(r[7]),
  };
}

function walletToRow(w) {
  return [
    w.id, w.name || '', w.currency || DEFAULT_BASE_CURRENCY, w.status || 'active', w.order ?? 0,
    w.kind || 'cash', w.rate ?? 0, String(w.updatedAt || 0), encBool(w.deleted),
  ];
}
function rowToWallet(r, index) {
  return {
    id: r[0],
    name: r[1] || '',
    currency: r[2] || DEFAULT_BASE_CURRENCY,
    status: r[3] || 'active',
    order: r[4] === '' || r[4] == null ? index : decNum(r[4]),
    kind: r[5] || 'cash',
    rate: decNum(r[6]),
    updatedAt: decNum(r[7]),
    deleted: decBool(r[8]),
  };
}

function tagToRow(t) {
  return [t.name, t.status || 'active', String(t.updatedAt || 0), encBool(t.deleted)];
}
function rowToTag(r) {
  return { name: r[0] || '', status: r[1] || 'active', updatedAt: decNum(r[2]), deleted: decBool(r[3]) };
}

function settingToRow(s) {
  return [s.key, s.value ?? '', String(s.updatedAt || 0)];
}
function rowToSetting(r) {
  return { key: r[0] || '', value: r[1] ?? '', updatedAt: decNum(r[2]), deleted: false };
}

// Диапазоны данных (без строки заголовка) и мапперы по сущностям.
const ENTITY = {
  transactions: { sheet: SHEET_TX, lastCol: 'O', toRow: txToRow, fromRow: rowToTx },
  categories: { sheet: SHEET_CAT, lastCol: 'H', toRow: catToRow, fromRow: rowToCat },
  wallets: { sheet: SHEET_WALLET, lastCol: 'J', toRow: walletToRow, fromRow: rowToWallet },
  tags: { sheet: SHEET_TAG, lastCol: 'D', toRow: tagToRow, fromRow: rowToTag },
  settings: { sheet: SHEET_SETTINGS, lastCol: 'C', toRow: settingToRow, fromRow: rowToSetting },
};

// --- Создание и схема -------------------------------------------------------

// Создаём таблицу ТОЛЬКО с заголовками: наполнение придёт из локального стора
// при первой синхронизации (источник правды — локальные данные). Пустая таблица
// исключает дубли базовых категорий/кошелька при первом push.
export async function initSpreadsheet(title = SPREADSHEET_TITLE) {
  const name = title.trim() || SPREADSHEET_TITLE;
  const spreadsheet = await createSpreadsheet(name, [
    { properties: { title: SHEET_TX } },
    { properties: { title: SHEET_CAT } },
    { properties: { title: SHEET_WALLET } },
    { properties: { title: SHEET_TAG } },
    { properties: { title: SHEET_SETTINGS } },
    { properties: { title: SHEET_META } },
  ]);
  const id = spreadsheet.spreadsheetId;
  await updateValues(id, `${SHEET_TX}!A1`, [TX_HEADER]);
  await updateValues(id, `${SHEET_CAT}!A1`, [CAT_HEADER]);
  await updateValues(id, `${SHEET_WALLET}!A1`, [WALLET_HEADER]);
  await updateValues(id, `${SHEET_TAG}!A1`, [TAG_HEADER]);
  await updateValues(id, `${SHEET_SETTINGS}!A1`, [SETTINGS_HEADER]);
  // Свежая таблица уже на актуальной схеме — сразу проставляем версию.
  await writeSchemaVersion(id, SCHEMA_VERSION);
  return id;
}

// Прочитать версию схемы из листа _Meta. Отсутствие листа или ключа = версия 0
// (пре-версионная таблица); при отсутствующем листе запрос не делаем.
async function readSchemaVersion(id, metaExists) {
  if (!metaExists) return 0;
  const rows = await getValues(id, `${SHEET_META}!A2:B`);
  const row = rows.find((r) => r[0] === SCHEMA_VERSION_KEY);
  return row ? Number(row[1]) || 0 : 0;
}

// Записать версию схемы в лист _Meta (перезаписывает шапку и строку версии).
async function writeSchemaVersion(id, version) {
  await updateValues(id, `${SHEET_META}!A1:B2`, [
    META_HEADER,
    [SCHEMA_VERSION_KEY, String(version)],
  ]);
}

// Довести таблицу до актуальной схемы: дозавести недостающие листы и прогнать
// недостающие миграции по версии из листа _Meta. Старые таблицы (версия 0)
// проходят все шаги по порядку; версия фиксируется после каждого, поэтому
// прерванная синхронизация продолжится с места остановки.
export async function ensureSyncSchema(id) {
  const meta = await getSpreadsheetMeta(id);
  const titles = new Set((meta.sheets || []).map((s) => s.properties.title));

  // Недостающие листы заводим только с заголовками — данные придут из синка.
  if (!titles.has(SHEET_WALLET)) {
    await addSheet(id, SHEET_WALLET);
    await updateValues(id, `${SHEET_WALLET}!A1`, [WALLET_HEADER]);
  }
  if (!titles.has(SHEET_TAG)) {
    await addSheet(id, SHEET_TAG);
    await updateValues(id, `${SHEET_TAG}!A1`, [TAG_HEADER]);
  }
  if (!titles.has(SHEET_SETTINGS)) {
    await addSheet(id, SHEET_SETTINGS);
    await updateValues(id, `${SHEET_SETTINGS}!A1`, [SETTINGS_HEADER]);
  }

  const metaExists = titles.has(SHEET_META);
  if (!metaExists) await addSheet(id, SHEET_META);
  const current = await readSchemaVersion(id, metaExists);

  for (let v = current; v < SCHEMA_VERSION; v += 1) {
    await MIGRATIONS[v](id);
    await writeSchemaVersion(id, v + 1);
  }
}

export async function findExistingSpreadsheets() {
  return listAppSpreadsheets();
}

// --- Чтение/запись для синхронизации ----------------------------------------

// Прочитать все сущности одним batch-запросом. Возвращает канонические записи
// ВКЛЮЧАЯ tombstones (deleted:true) — их видит мердж.
export async function fetchAllForSync(id) {
  const [txRows, catRows, walletRows, tagRows, settingsRows] = await getValuesBatch(id, [
    `${SHEET_TX}!A2:O`,
    `${SHEET_CAT}!A2:H`,
    `${SHEET_WALLET}!A2:J`,
    `${SHEET_TAG}!A2:D`,
    `${SHEET_SETTINGS}!A2:C`,
  ]);
  return {
    transactions: txRows.filter((r) => r[0]).map(rowToTx),
    categories: catRows.filter((r) => r[0]).map(rowToCat),
    wallets: walletRows.filter((r) => r[0]).map(rowToWallet),
    tags: tagRows.filter((r) => r[0]).map(rowToTag),
    settings: settingsRows.filter((r) => r[0]).map(rowToSetting),
  };
}

// Полностью перезаписать лист сущности набором записей (со 2-й строки).
// Позиционная адресация листа тут не важна — переписываем весь блок целиком,
// это исключает рассинхрон номеров строк между устройствами.
export async function overwriteEntity(id, entity, records) {
  const meta = ENTITY[entity];
  if (!meta) throw new Error(`Неизвестная сущность: ${entity}`);
  await clearValues(id, `${meta.sheet}!A2:${meta.lastCol}`);
  const rows = records.map(meta.toRow);
  if (rows.length) await updateValues(id, `${meta.sheet}!A2`, rows);
}
