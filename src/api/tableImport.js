// Универсальный импорт операций из таблицы (.xlsx или .csv) — одна таблица
// с английскими заголовками, из которой выводится всё остальное: кошельки,
// категории, теги, переводы.
//
// Колонки (порядок не важен, заголовки без учёта регистра):
//   date*            дата: 2026-09-01 или 01.09.2026
//   time             время HH:MM — только для порядка операций внутри дня
//   wallet*          имя кошелька; отсутствующий создаётся
//   currency         валюта кошелька при его создании (иначе базовая)
//   amount*          со знаком: расход < 0, доход > 0
//   category         категория; отсутствующая создаётся (вид — по знаку сумм)
//   transfer_to      имя кошелька-получателя → строка становится переводом
//   transfer_amount  сколько зачислено получателю (другая валюта / комиссия)
//   note             заметка
//   tags             теги через запятую
//   paid_amount      сумма в валюте оплаты, если платили не в валюте кошелька
//   paid_currency    валюта оплаты
//   type             expense / income / transfer / adjust / interest; пусто — по знаку
//
// Импорт только добавляет: id операции — хэш содержимого строки, поэтому
// повторная загрузка того же файла ничего не дублирует.

import { parseCsv, detectDelimiter, downloadFile, downloadBlob, toCsv } from '../utils/csv';
import { readXlsxRows, writeXlsx } from '../utils/xlsx';

export const SHEET_NAME = 'Transactions';

export const COLUMNS = [
  'date', 'time', 'wallet', 'currency', 'amount', 'category',
  'transfer_to', 'transfer_amount', 'note', 'tags', 'paid_amount', 'paid_currency', 'type',
];

// Синонимы заголовков → каноническое имя.
const ALIASES = {
  account: 'wallet',
  description: 'note',
  comment: 'note',
  memo: 'note',
  tag: 'tags',
  'transfer to': 'transfer_to',
  'transfer amount': 'transfer_amount',
  'paid amount': 'paid_amount',
  'paid currency': 'paid_currency',
  'transfer currency': 'transfer_currency',
};

const TYPES = new Set(['expense', 'income', 'transfer', 'adjust', 'interest']);

// --- Чтение файла -------------------------------------------------------------

// Файл (.xlsx / .csv) → массив строк-массивов строк. Тип узнаём по сигнатуре zip.
export async function readTableFile(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip) return readXlsxRows(buf, SHEET_NAME);
  const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  return parseCsv(text, detectDelimiter(text));
}

// --- Разбор строк -------------------------------------------------------------

function canonicalHeader(cell) {
  const key = String(cell || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return ALIASES[key] || key.replace(/ /g, '_');
}

// --- Диалект Monefy -----------------------------------------------------------
// Выгрузка Monefy («Экспорт в файл»): date, account, category, amount, currency,
// converted amount, currency, description. account/description — синонимы наших
// колонок, а вот перевод там — две строки: списание и зачисление. В старых
// выгрузках их категории именные (`To 'Счёт'` / `From 'Счёт'`), в новых —
// служебные ключи `expensetransfer` / `incometransfer` без имени второго счёта;
// тогда пару ищем по дате и одинаковой сумме в базовой валюте (converted amount).
// Начальный остаток — `Initial balance` / `initalbalance` (опечатка Monefy).
// Здесь переписываем такие строки в наш формат; остальное разбирает общий код.

const MONEFY_TO_RE = /^to\s+'(.+)'$/i;
const MONEFY_FROM_RE = /^from\s+'(.+)'$/i;
const MONEFY_INITIAL = new Set(['initial balance', 'initialbalance', 'initalbalance', 'начальный баланс']);
const MONEFY_OUT = 'expensetransfer';
const MONEFY_IN = 'incometransfer';

function isMonefyRows(rows) {
  const header = (rows[0] || []).map((c) => String(c ?? '').trim().toLowerCase());
  return header.includes('account') && header.includes('converted amount');
}

// Роль строки Monefy: { role: 'out'|'in'|'initial'|'normal', counterparty? }
function monefyRole(category) {
  const key = category.trim().toLowerCase();
  const to = MONEFY_TO_RE.exec(category.trim());
  if (to) return { role: 'out', counterparty: to[1] };
  const from = MONEFY_FROM_RE.exec(category.trim());
  if (from) return { role: 'in', counterparty: from[1] };
  if (key === MONEFY_OUT) return { role: 'out' };
  if (key === MONEFY_IN) return { role: 'in' };
  if (MONEFY_INITIAL.has(key)) return { role: 'initial' };
  return { role: 'normal' };
}

export function convertMonefyRows(rows) {
  const header = rows[0].map((c) => String(c ?? '').trim().toLowerCase());
  const names = ['date', 'account', 'category', 'amount', 'currency', 'converted amount', 'description'];
  const idx = Object.fromEntries(names.map((n) => [n, header.indexOf(n)]));
  const cell = (row, key) => (idx[key] >= 0 ? String(row[idx[key]] ?? '').trim() : '');
  // Исходные номера строк файла — для сообщений о проблемах после конвертации.
  const data = rows.map((row, i) => ({ row, line: i + 1 })).slice(1)
    .filter(({ row }) => row.some((c) => String(c ?? '').trim() !== ''));

  // Ключ пары: именной (дата|источник|получатель) или по сумме в базовой валюте.
  const decimal = detectDecimalSeparator(data.flatMap(({ row }) => [cell(row, 'amount'), cell(row, 'converted amount')]));
  const baseAmount = (row) => {
    const n = parseAmount(cell(row, 'converted amount'), decimal) ?? parseAmount(cell(row, 'amount'), decimal) ?? 0;
    return Math.abs(n).toFixed(2);
  };
  const namedKey = (date, from, to) => `n|${date}|${from.toLowerCase()}|${to.toLowerCase()}`;
  const sumKey = (row) => `s|${cell(row, 'date')}|${baseAmount(row)}`;

  // Зачисления складываем в очереди; строка списания забирает свою пару.
  const incoming = new Map();
  for (const item of data) {
    const { role, counterparty } = monefyRole(cell(item.row, 'category'));
    if (role !== 'in') continue;
    const key = counterparty ? namedKey(cell(item.row, 'date'), counterparty, cell(item.row, 'account')) : sumKey(item.row);
    incoming.set(key, [...(incoming.get(key) || []), item]);
  }
  const takePair = (key) => {
    const list = incoming.get(key);
    const item = list?.shift();
    if (list && !list.length) incoming.delete(key);
    return item;
  };

  const columns = [...COLUMNS, 'transfer_currency', '_line'];
  const out = [columns];
  const push = (fields) => out.push(columns.map((c) => fields[c] ?? ''));
  for (const { row, line } of data) {
    const category = cell(row, 'category');
    const { role, counterparty } = monefyRole(category);
    if (role === 'in') continue; // зеркальные строки — ниже
    const base = {
      date: cell(row, 'date'), wallet: cell(row, 'account'), currency: cell(row, 'currency'),
      amount: cell(row, 'amount'), note: cell(row, 'description'), _line: line,
    };
    if (role === 'out') {
      const key = counterparty ? namedKey(base.date, base.wallet, counterparty) : sumKey(row);
      const pair = takePair(key);
      push({
        ...base, type: 'transfer',
        transfer_to: counterparty || (pair ? cell(pair.row, 'account') : ''),
        transfer_amount: pair ? cell(pair.row, 'amount') : '',
        transfer_currency: pair ? cell(pair.row, 'currency') : '',
      });
    } else if (role === 'initial') {
      push({ ...base, type: 'adjust' });
    } else {
      push({ ...base, category });
    }
  }
  // Зачисления без пары: именные — перевод с известным источником, безымянные —
  // перевод без второго кошелька (общий разбор отметит строку как проблемную).
  for (const list of incoming.values()) {
    for (const { row, line } of list) {
      const { counterparty } = monefyRole(cell(row, 'category'));
      const amount = cell(row, 'amount');
      push({
        date: cell(row, 'date'), type: 'transfer', wallet: counterparty || '', transfer_to: cell(row, 'account'),
        amount: `-${amount.replace(/^[-+]/, '')}`, transfer_amount: amount,
        transfer_currency: cell(row, 'currency'), note: cell(row, 'description'), _line: line,
      });
    }
  }
  return out;
}

// Строки таблицы → записи + список проблемных строк (номер, причина).
export function parseTableRows(source) {
  const rows = isMonefyRows(source) ? convertMonefyRows(source) : source;
  const filled = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (filled.length < 2) throw new Error('В таблице нет данных: нужна строка заголовков и хотя бы одна операция');

  const idx = {};
  filled[0].forEach((cell, i) => { const name = canonicalHeader(cell); if (name && !(name in idx)) idx[name] = i; });
  const missing = ['date', 'wallet', 'amount'].filter((c) => !(c in idx));
  if (missing.length) throw new Error(`Нет обязательных колонок: ${missing.join(', ')}`);

  const get = (row, col) => (col in idx ? String(row[idx[col]] ?? '').trim() : '');
  const body = filled.slice(1);
  const dateOrder = detectDateOrder(body.map((r) => get(r, 'date')));
  const decimal = detectDecimalSeparator(
    body.flatMap((r) => [get(r, 'amount'), get(r, 'transfer_amount'), get(r, 'paid_amount')]),
  );
  const num = (value) => parseAmount(value, decimal);
  const records = [];
  const problems = [];

  body.forEach((row, i) => {
    // Служебная колонка _line (после конвертации диалекта) хранит номер строки
    // исходного файла; иначе считаем сами (1 — заголовок).
    const line = Number(get(row, '_line')) || i + 2;
    const fail = (reason) => problems.push({ line, reason });
    const date = parseDate(get(row, 'date'), dateOrder);
    if (!date) return fail(`не распознана дата «${get(row, 'date')}»`);
    const amount = num(get(row, 'amount'));
    if (amount === null || amount === 0) return fail(`не распознана сумма «${get(row, 'amount')}»`);
    const wallet = get(row, 'wallet');
    const typeRaw = get(row, 'type').toLowerCase();
    if (typeRaw && !TYPES.has(typeRaw)) return fail(`неизвестный тип «${typeRaw}»`);
    const transferTo = get(row, 'transfer_to');
    if (typeRaw === 'transfer' && (!transferTo || !wallet)) return fail('перевод без пары: не найден второй кошелёк (transfer_to)');
    if (!wallet) return fail('не указан кошелёк');
    if (transferTo && transferTo.toLowerCase() === wallet.toLowerCase()) return fail('перевод в тот же кошелёк');
    const type = transferTo ? 'transfer' : typeRaw || (amount < 0 ? 'expense' : 'income');

    const category = get(row, 'category');
    if ((type === 'expense' || type === 'income') && !category) return fail('не указана категория');

    const transferAmountRaw = get(row, 'transfer_amount');
    const transferAmount = transferAmountRaw ? num(transferAmountRaw) : null;
    if (transferAmountRaw && !transferAmount) return fail(`не распознана сумма зачисления «${transferAmountRaw}»`);

    const paidAmountRaw = get(row, 'paid_amount');
    const paidAmount = paidAmountRaw ? num(paidAmountRaw) : null;
    const paidCurrency = normalizeCurrency(get(row, 'paid_currency'));
    if (paidAmountRaw && !paidAmount) return fail(`не распознана сумма оплаты «${paidAmountRaw}»`);
    if ((paidAmount && !paidCurrency) || (!paidAmount && paidCurrency)) return fail('paid_amount и paid_currency нужны вместе');

    const signed = type === 'expense' ? -Math.abs(amount) : type === 'income' ? Math.abs(amount) : amount;
    records.push({
      line,
      date,
      time: normalizeTime(get(row, 'time')),
      wallet,
      currency: normalizeCurrency(get(row, 'currency')),
      amount: type === 'transfer' ? -Math.abs(amount) : signed,
      category: type === 'expense' || type === 'income' ? category : '',
      transferTo,
      transferAmount: transferAmount ? Math.abs(transferAmount) : null,
      // Необязательная колонка (в шаблоне нет): валюта получателя при его создании.
      transferCurrency: normalizeCurrency(get(row, 'transfer_currency')),
      note: get(row, 'note'),
      tags: get(row, 'tags').split(',').map((s) => s.trim()).filter(Boolean),
      paidAmount: paidAmount ? Math.abs(paidAmount) : null,
      paidCurrency,
      type,
      raw: row.map((c) => String(c ?? '').trim()).join('\u001f'),
    });
    return undefined;
  });
  return { records, problems };
}

function normalizeCurrency(value) {
  const code = (value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

// "14:30" / "14:30:05" / "9:05" → "HH:MM:SS"; иначе пусто.
function normalizeTime(value) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value || '');
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}:${m[3] || '00'}`;
}

// --- Даты -------------------------------------------------------------------

const DATE_RE = /^\s*(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/;

// Порядок день/месяц: если где-то первая часть > 12 — это день (DMY), если
// вторая > 12 — месяц стоит первым (MDY). По умолчанию — DMY.
function detectDateOrder(values) {
  for (const v of values) {
    const m = DATE_RE.exec(v);
    if (!m || m[1].length === 4) continue;
    if (Number(m[1]) > 12) return 'dmy';
    if (Number(m[2]) > 12) return 'mdy';
  }
  return 'dmy';
}

// Дата → ISO YYYY-MM-DD или null, если не распознана.
export function parseDate(value, order = 'dmy') {
  const m = DATE_RE.exec(value || '');
  if (!m) return null;
  let year; let month; let day;
  if (m[1].length === 4) {
    [year, month, day] = [m[1], m[2], m[3]];
  } else if (order === 'mdy') {
    [month, day, year] = [m[1], m[2], m[3]];
  } else {
    [day, month, year] = [m[1], m[2], m[3]];
  }
  if (year.length === 2) year = `20${year}`;
  if (year.length !== 4 || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// --- Суммы ------------------------------------------------------------------

// Десятичный знак для всего файла по набору сумм. Одна и та же строка «1,250»
// значит 1250 при десятичной точке и 1,25 при десятичной запятой — по одной
// строке не понять, зато по всем строкам обычно видно: разделитель, за которым
// не три цифры, или встречающийся в числе дважды, выдаёт себя.
// Возвращает ',' | '.' | null (не удалось определить — разбираем построчно).
export function detectDecimalSeparator(values) {
  let comma = 0;
  let dot = 0;
  for (const raw of values) {
    const s = String(raw ?? '').replace(/[^\d.,]/g, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) return lastComma > lastDot ? ',' : '.';
    for (const [sep, other] of [[',', '.'], ['.', ',']]) {
      const parts = s.split(sep);
      if (parts.length === 2 && parts[1].length !== 3) { if (sep === ',') comma += 1; else dot += 1; }
      if (parts.length > 2) { if (other === ',') comma += 1; else dot += 1; }
    }
  }
  if (comma && !dot) return ',';
  if (dot && !comma) return '.';
  if (comma || dot) return null;

  // Только «одиночный разделитель + три цифры» (или без разделителя). Тысячный
  // разделитель требует группировки: «3000,000» им быть не может, а если
  // разделитель есть у КАЖДОЙ суммы — это фиксированные три знака после запятой
  // (при тысячных суммы меньше 1000 шли бы без разделителя).
  const seps = new Set();
  let all = true;
  let any = false;
  for (const raw of values) {
    const s = String(raw ?? '').replace(/[^\d.,]/g, '');
    if (!s) continue;
    any = true;
    const m = /^(\d+)([.,])(\d{3})$/.exec(s);
    if (!m) { all = false; continue; }
    seps.add(m[2]);
    if (m[1].length > 3) return m[2];
  }
  return any && all && seps.size === 1 ? [...seps][0] : null;
}

// «-1 234,56», «-1,234.56», «1234.5», «-500,00», «1 500 ₽» → число. Если
// десятичный знак известен (см. detectDecimalSeparator), другой разделитель —
// тысячный. Иначе: десятичный — последний из `,`/`.`; одиночный разделитель
// ровно перед тремя цифрами считаем тысячным («1,234»). null — если не число.
export function parseAmount(value, decimal = null) {
  let s = String(value ?? '').replace(/[^\d.,+-]/g, '');
  if (!s) return null;
  if (decimal) {
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    const isThousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
    s = isThousands ? parts.join('') : parts.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// --- План импорта -----------------------------------------------------------

// Чистая функция: что будет создано и какие операции добавлены. Ничего не
// пишет — результат показываем пользователю до подтверждения.
export function planTableImport(records, current, baseCurrency) {
  const walletByLower = new Map(current.wallets.map((w) => [w.name.toLowerCase(), w]));
  const categoryByLower = new Map(current.categories.map((c) => [c.name.toLowerCase(), c]));
  const tagSet = new Set(current.tags.map((t) => (typeof t === 'string' ? t : t.name)));
  const existingIds = new Set(current.transactions.map((t) => t.id));
  const problems = [];

  // Валюта нового кошелька — из первой строки, где она указана. Заранее: кошелёк
  // может впервые встретиться как получатель перевода, где своей валюты нет.
  const fileCurrency = new Map();
  const remember = (name, currency) => {
    const key = name.toLowerCase();
    if (currency && !fileCurrency.has(key)) fileCurrency.set(key, currency);
  };
  for (const r of records) {
    remember(r.wallet, r.currency);
    if (r.transferTo) remember(r.transferTo, r.transferCurrency);
  }
  const newWallets = new Map();
  const walletName = (name) => walletByLower.get(name.toLowerCase())?.name || newWallets.get(name.toLowerCase())?.name || name;
  const walletCurrency = (name) => {
    const key = name.toLowerCase();
    return walletByLower.get(key)?.currency || newWallets.get(key)?.currency || fileCurrency.get(key) || baseCurrency;
  };
  const ensureWallet = (name) => {
    const key = name.toLowerCase();
    if (!walletByLower.has(key) && !newWallets.has(key)) newWallets.set(key, { name, currency: walletCurrency(name) });
  };

  const categorySigns = new Map();
  const noteCategory = (name, amount) => {
    const key = name.toLowerCase();
    const entry = categorySigns.get(key) || { name, negative: false, positive: false };
    if (amount < 0) entry.negative = true; else entry.positive = true;
    categorySigns.set(key, entry);
  };
  const newTags = new Set();

  const seenRaw = new Map();
  const rowId = (r) => {
    const n = (seenRaw.get(r.raw) || 0) + 1;
    seenRaw.set(r.raw, n);
    return `import-${hash(`${r.raw}#${n}`)}`;
  };

  const transactions = [];
  let transfers = 0;

  for (const r of records) {
    ensureWallet(r.wallet);
    const currency = walletCurrency(r.wallet);
    if (r.currency && r.currency !== currency && !r.paidCurrency) {
      problems.push({ line: r.line, reason: `валюта ${r.currency} не совпадает с валютой кошелька «${walletName(r.wallet)}» (${currency}); для оплаты в чужой валюте заполните paid_amount и paid_currency` });
      continue;
    }
    for (const tag of r.tags) if (!tagSet.has(tag)) newTags.add(tag);
    const id = rowId(r);
    const base = {
      id, date: r.date, time: r.time, type: r.type, amount: r.amount, category: '',
      note: r.note, tags: r.tags, wallet: walletName(r.wallet), currency,
      origAmount: null, origCurrency: '', groupId: '',
    };

    if (r.type === 'transfer') {
      ensureWallet(r.transferTo);
      const inAmount = r.transferAmount ?? Math.abs(r.amount);
      const twin = {
        ...base, id: `${id}-in`, amount: inAmount, groupId: id,
        wallet: walletName(r.transferTo), currency: walletCurrency(r.transferTo),
      };
      transactions.push({ ...base, groupId: id }, twin);
      transfers += 1;
      continue;
    }

    if (r.paidAmount) {
      base.origAmount = r.paidAmount;
      base.origCurrency = r.paidCurrency;
      base.rate = Math.abs(r.amount) / r.paidAmount;
    }
    if (r.category) {
      noteCategory(r.category, r.amount);
      base.category = categoryByLower.get(r.category.toLowerCase())?.name || r.category;
    }
    transactions.push(base);
  }

  const fresh = transactions.filter((t) => !existingIds.has(t.id));
  const newCategories = [];
  for (const [key, entry] of categorySigns) {
    if (categoryByLower.has(key)) continue;
    const kind = entry.negative && entry.positive ? 'both' : entry.negative ? 'expense' : 'income';
    newCategories.push({ name: entry.name, kind });
  }

  return {
    newWallets: [...newWallets.values()],
    newCategories,
    newTags: [...newTags],
    transactions: fresh,
    transfers,
    duplicates: transactions.length - fresh.length,
    problems,
  };
}

// FNV-1a 32 бит, hex — стабильный короткий id по содержимому строки.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// --- Применение -------------------------------------------------------------

export async function applyTableImport(plan, backend) {
  for (const w of plan.newWallets) await backend.addWallet({ name: w.name, currency: w.currency, kind: 'cash' });
  for (const c of plan.newCategories) await backend.addCategory({ name: c.name, kind: c.kind });
  for (const name of plan.newTags) await backend.addTag(name);
  if (plan.transactions.length) await backend.addTransactions(plan.transactions);
  return {
    wallets: plan.newWallets.length,
    categories: plan.newCategories.length,
    tags: plan.newTags.length,
    transactions: plan.transactions.length,
    transfers: plan.transfers,
  };
}

// --- Шаблон -----------------------------------------------------------------

function exampleRows(cur) {
  return [
    ['2026-09-01', '09:30', 'Наличные', cur, -1500, 'Продукты', '', '', 'Магазин у дома', 'еда', '', '', ''],
    ['2026-09-05', '', 'Карта', cur, 80000, 'Зарплата', '', '', '', '', '', '', ''],
    ['2026-09-06', '', 'Карта', cur, -5000, '', 'Наличные', '', 'Снял в банкомате', '', '', '', ''],
    ['2026-09-07', '', 'Карта', cur, -2700, 'Кафе и рестораны', '', '', 'Ужин в поездке', 'отпуск, еда', 30, 'USD', ''],
    ['2026-09-10', '', 'Вклад', cur, 350, '', '', '', 'Проценты за месяц', '', '', '', 'interest'],
    ['2026-09-30', '', 'Наличные', cur, -120, '', '', '', 'Сверка с реальным остатком', '', '', '', 'adjust'],
  ];
}

const INSTRUCTIONS = [
  ['Как заполнять', ''],
  ['Заполняйте лист «Transactions»: одна строка = одна операция. Заголовки не переименовывайте, порядок колонок не важен, лишние колонки игнорируются.', ''],
  ['Кошельки, категории и теги создаются автоматически по именам из таблицы. Если имя совпадает с уже существующим (без учёта регистра), используется существующий.', ''],
  ['Сумма со знаком: расход отрицательный, доход положительный. Вид новой категории определяется по знакам её сумм.', ''],
  ['Перевод между кошельками — одна строка: wallet — откуда, transfer_to — куда, amount — сколько списано. Если зачислено другое количество (другая валюта, комиссия), укажите transfer_amount.', ''],
  ['Повторная загрузка того же файла безопасна: уже добавленные строки пропускаются. Изменённые строки будут добавлены как новые операции.', ''],
  ['Примеры в шаблоне можно удалить или заменить своими.', ''],
  ['', ''],
  ['Колонка', 'Описание'],
  ['date', 'Обязательно. Дата: 2026-09-01 или 01.09.2026.'],
  ['time', 'Время HH:MM. Нужно только для порядка операций внутри дня.'],
  ['wallet', 'Обязательно. Имя кошелька. Новый создаётся автоматически.'],
  ['currency', 'Код валюты (RUB, USD, EUR…). Используется при создании нового кошелька; иначе базовая валюта приложения.'],
  ['amount', 'Обязательно. Сумма в валюте кошелька со знаком: расход −, доход +.'],
  ['category', 'Категория расхода или дохода. Обязательна для расходов и доходов, для переводов пустая.'],
  ['transfer_to', 'Имя кошелька-получателя. Заполнено — значит строка является переводом.'],
  ['transfer_amount', 'Сколько зачислено на кошелёк-получатель. Пусто — столько же, сколько списано.'],
  ['note', 'Заметка к операции.'],
  ['tags', 'Теги через запятую.'],
  ['paid_amount', 'Если платили не в валюте кошелька: сумма в валюте оплаты (amount при этом — сколько списалось с кошелька).'],
  ['paid_currency', 'Код валюты оплаты. Заполняется вместе с paid_amount.'],
  ['type', 'Обычно пусто (определяется по знаку). Особые случаи: adjust — корректировка остатка, interest — начисленные проценты. Оба без категории.'],
];

// Шаблон .xlsx: лист с примерами + лист-инструкция.
export function downloadTemplateXlsx(baseCurrency) {
  const cur = baseCurrency || 'RUB';
  const blob = writeXlsx([
    { name: SHEET_NAME, rows: [COLUMNS, ...exampleRows(cur)], widths: [12, 8, 14, 10, 12, 20, 14, 16, 28, 16, 12, 13, 10], headerBold: true },
    { name: 'Инструкция', rows: INSTRUCTIONS, widths: [18, 110], wrap: true },
  ]);
  downloadBlob('freemoney-import-template.xlsx', blob);
}

export function downloadTemplateCsv(baseCurrency) {
  downloadFile('freemoney-import-template.csv', toCsv([COLUMNS, ...exampleRows(baseCurrency || 'RUB')]));
}
