// Импорт выгрузки Monefy (CSV) и файлов по нашему шаблону того же формата.
//
// Формат файла Monefy («Экспорт в файл» в настройках приложения):
//   date, account, category, amount, currency, converted amount, currency, description
// Разделитель полей (`,` `;` таб), десятичный знак (`.` или `,`) и формат даты
// зависят от настроек экспорта и локали устройства — всё это определяем сами.
//
// Правила сопоставления:
//   • account  → кошелёк по имени; отсутствующие создаются в валюте из колонки currency.
//   • category → категория по имени; отсутствующие создаются, вид — по знаку сумм.
//   • Категории вида `To 'Счёт'` / `From 'Счёт'` — переводы между счетами. Две
//     строки одного перевода (списание и зачисление) склеиваются в одну пару.
//   • «Initial balance» → корректировка баланса (adjust) без категории.
//   • id операции детерминированный (хэш строки), поэтому повторный импорт того
//     же файла не плодит дубликаты.

import { parseCsv, detectDelimiter, downloadFile, toCsv } from '../utils/csv';

const TEMPLATE_COLUMNS = ['date', 'account', 'category', 'amount', 'currency', 'converted amount', 'currency', 'description'];

// Категории Monefy, обозначающие начальный остаток счёта (а не операцию).
const INITIAL_BALANCE_NAMES = new Set(['initial balance', 'начальный баланс']);

// Разбор строки файла: «Дата,Счёт,Категория,Сумма,Валюта,...,Описание».
// Возвращает записи-строки без привязки к текущим данным.
export function parseMonefyCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(clean);
  const rows = parseCsv(clean, delimiter).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) throw new Error('Файл пустой');

  const idx = headerIndex(rows[0]);
  if (idx.date < 0 || idx.account < 0 || idx.amount < 0) {
    throw new Error('Не похоже на выгрузку Monefy: нет колонок date / account / amount');
  }

  const dateOrder = detectDateOrder(rows.slice(1).map((r) => r[idx.date] || ''));
  const records = [];
  let unparsed = 0;
  for (const row of rows.slice(1)) {
    const date = parseDate(row[idx.date], dateOrder);
    const amount = parseAmount(row[idx.amount]);
    const account = (row[idx.account] || '').trim();
    if (!date || amount === null || amount === 0 || !account) { unparsed += 1; continue; }
    records.push({
      date,
      account,
      category: (row[idx.category] || '').trim(),
      amount,
      currency: normalizeCurrency(row[idx.currency]),
      description: (row[idx.description] || '').trim(),
      raw: row.join('\u001f'),
    });
  }
  return { records, unparsed };
}

function headerIndex(header) {
  const lower = header.map((h) => h.trim().toLowerCase());
  const find = (name) => lower.indexOf(name);
  return {
    date: find('date'),
    account: find('account'),
    category: find('category'),
    amount: find('amount'),
    currency: find('currency'),
    description: find('description'),
  };
}

function normalizeCurrency(value) {
  const code = (value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

// --- Даты -------------------------------------------------------------------

const DATE_RE = /^\s*(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/;

// Порядок день/месяц: если в какой-то строке первая часть > 12 — это день (DMY),
// если вторая > 12 — месяц стоит первым (MDY). По умолчанию — DMY (как у Monefy).
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
function parseDate(value, order) {
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

// «-1 234,56», «-1,234.56», «1234.5», «-500,00» → число. Десятичный знак —
// последний из `,`/`.`; одиночный разделитель перед ровно тремя цифрами
// считаем разделителем тысяч («1,234»). null — если не число.
export function parseAmount(value) {
  let s = String(value ?? '').replace(/[\s '’]/g, '');
  if (!s) return null;
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

// Категория перевода: `To 'Счёт'` / `From 'Счёт'` (Monefy) — имя счёта в кавычках.
// Локализованные префиксы («Перевод на 'Счёт'») не перечисляем: считаем строку
// переводом, если префикс To/From либо имя в кавычках — один из счетов файла.
const QUOTED_RE = /^[^'«"]*['«"](.+)['»"]\s*$/;

function transferTarget(category, accounts) {
  const m = QUOTED_RE.exec(category || '');
  if (!m) return null;
  const target = m[1].trim();
  const isEnglish = /^(to|from)\s/i.test(category);
  return isEnglish || accounts.has(target.toLowerCase()) ? target : null;
}

// Строит план: что будет создано и какие операции добавлены. Чистая функция —
// ничего не пишет, чтобы показать пользователю предпросмотр до подтверждения.
export function planMonefyImport(records, current, baseCurrency) {
  const walletByLower = new Map(current.wallets.map((w) => [w.name.toLowerCase(), w]));
  const categoryByLower = new Map(current.categories.map((c) => [c.name.toLowerCase(), c]));
  const existingIds = new Set(current.transactions.map((t) => t.id));

  // Валюта счёта — из его собственных строк (первая непустая). Нужна заранее:
  // счёт может впервые встретиться как цель перевода, где своей валюты нет.
  const accountCurrency = new Map();
  for (const r of records) {
    const key = r.account.toLowerCase();
    if (r.currency && !accountCurrency.has(key)) accountCurrency.set(key, r.currency);
  }

  const newWallets = new Map(); // lower → { name, currency }
  const walletName = (name) => walletByLower.get(name.toLowerCase())?.name || newWallets.get(name.toLowerCase())?.name || name;
  const walletCurrency = (name) => {
    const key = name.toLowerCase();
    return walletByLower.get(key)?.currency || newWallets.get(key)?.currency || accountCurrency.get(key) || baseCurrency;
  };
  const ensureWallet = (name) => {
    const key = name.toLowerCase();
    if (!walletByLower.has(key) && !newWallets.has(key)) newWallets.set(key, { name, currency: walletCurrency(name) });
  };

  const categorySigns = new Map(); // lower → { name, negative, positive }
  const noteCategory = (name, amount) => {
    const key = name.toLowerCase();
    const entry = categorySigns.get(key) || { name, negative: false, positive: false };
    if (amount < 0) entry.negative = true; else entry.positive = true;
    categorySigns.set(key, entry);
  };

  const seenRaw = new Map();
  const rowId = (r) => {
    const n = (seenRaw.get(r.raw) || 0) + 1;
    seenRaw.set(r.raw, n);
    return `monefy-${hash(`${r.raw}#${n}`)}`;
  };

  const accounts = new Set(records.map((r) => r.account.toLowerCase()));
  const transactions = [];
  const pendingOut = new Map(); // date|from|to → leg
  const pendingIn = new Map();
  let transfers = 0;

  const baseTx = (r, id) => ({
    id, date: r.date, time: '', category: '', note: r.description, tags: [],
    wallet: walletName(r.account), currency: walletCurrency(r.account),
    origAmount: null, origCurrency: '', groupId: '',
  });

  for (const r of records) {
    ensureWallet(r.account);
    const id = rowId(r);
    const target = transferTarget(r.category, accounts);

    if (target) {
      ensureWallet(target);
      const isOut = r.amount < 0;
      const from = isOut ? r.account : target;
      const to = isOut ? target : r.account;
      const key = `${r.date}|${from.toLowerCase()}|${to.toLowerCase()}`;
      const leg = { ...baseTx(r, id), type: 'transfer', amount: r.amount, target };
      const mine = isOut ? pendingOut : pendingIn;
      const other = isOut ? pendingIn : pendingOut;
      const match = takeFirst(other, key);
      if (match) {
        const groupId = isOut ? id : match.id;
        transactions.push(strip({ ...match, groupId }), strip({ ...leg, groupId }));
        transfers += 1;
      } else {
        pushPending(mine, key, leg);
      }
      continue;
    }

    if (INITIAL_BALANCE_NAMES.has(r.category.toLowerCase())) {
      transactions.push({ ...baseTx(r, id), type: 'adjust', amount: r.amount, note: r.description || 'Начальный баланс' });
      continue;
    }

    const category = r.category || 'Прочее';
    noteCategory(category, r.amount);
    transactions.push({
      ...baseTx(r, id),
      type: r.amount < 0 ? 'expense' : 'income',
      amount: r.amount,
      category: categoryByLower.get(category.toLowerCase())?.name || category,
    });
  }

  // Ноги переводов без пары (вторая строка не нашлась) — достраиваем вторую
  // ногу на ту же сумму, чтобы перевод остался цельным.
  for (const leg of [...pendingOut.values(), ...pendingIn.values()].flat()) {
    const isOut = leg.amount < 0;
    const twin = {
      ...leg, id: `${leg.id}-pair`, amount: -leg.amount,
      wallet: walletName(leg.target), currency: walletCurrency(leg.target),
    };
    const groupId = isOut ? leg.id : twin.id;
    transactions.push(strip({ ...leg, groupId }), strip({ ...twin, groupId }));
    transfers += 1;
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
    transactions: fresh,
    transfers,
    duplicates: transactions.length - fresh.length,
  };
}

function pushPending(map, key, leg) {
  const list = map.get(key) || [];
  list.push(leg);
  map.set(key, list);
}

function takeFirst(map, key) {
  const list = map.get(key);
  if (!list?.length) return null;
  const leg = list.shift();
  if (!list.length) map.delete(key);
  return leg;
}

// Убрать служебное поле target перед записью.
function strip({ target, ...tx }) {
  return tx;
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

// Записать план в хранилище. Возвращает счётчики созданного.
export async function applyMonefyImport(plan, backend) {
  for (const w of plan.newWallets) {
    await backend.addWallet({ name: w.name, currency: w.currency, kind: 'cash', rate: 0 });
  }
  for (const c of plan.newCategories) {
    await backend.addCategory({ name: c.name, kind: c.kind });
  }
  if (plan.transactions.length) await backend.addTransactions(plan.transactions);
  return {
    wallets: plan.newWallets.length,
    categories: plan.newCategories.length,
    transactions: plan.transactions.length,
    transfers: plan.transfers,
  };
}

// --- Шаблон -----------------------------------------------------------------

// Пустой файл в формате Monefy с примерами строк — для ручного заполнения в
// Excel / Google Sheets и переноса данных из любых других приложений.
export function downloadImportTemplate(baseCurrency) {
  const cur = baseCurrency || 'RUB';
  const rows = [
    TEMPLATE_COLUMNS,
    ['2026-09-01', 'Наличные', 'Продукты', '-1500.00', cur, '-1500.00', cur, 'Магазин у дома'],
    ['2026-09-05', 'Карта', 'Зарплата', '80000.00', cur, '80000.00', cur, ''],
    ['2026-09-06', 'Карта', "To 'Наличные'", '-5000.00', cur, '-5000.00', cur, 'Снял наличные'],
    ['2026-09-06', 'Наличные', "From 'Карта'", '5000.00', cur, '5000.00', cur, 'Снял наличные'],
  ];
  downloadFile('freemoney-import-template.csv', toCsv(rows));
}
