// Финансовые расчёты над операциями. Суммы операций — в валюте их кошелька.

export function isIncome(t) {
  return t.type === 'income';
}
export function isExpense(t) {
  return t.type === 'expense';
}
// Реальный доход/расход (переводы между кошельками сюда не входят).
export function isRealFlow(t) {
  return t.type === 'income' || t.type === 'expense';
}

import { monthKey } from './format';

// Укрупнённый тип операции: expense | income | transfer | adjust.
export function txKind(t) {
  if (t.type.startsWith('transfer')) return 'transfer';
  if (t.type.startsWith('adjust')) return 'adjust';
  return t.type;
}

// Проверка операции по набору фильтров (пустой массив = без ограничения).
// tags — совпадение по любому из выбранных.
export function matchesFilters(t, f) {
  if (f.types?.length && !f.types.includes(txKind(t))) return false;
  if (f.categories?.length && !f.categories.includes(t.category)) return false;
  if (f.wallets?.length && !f.wallets.includes(t.wallet)) return false;
  if (f.tags?.length && !(t.tags || []).some((x) => f.tags.includes(x))) return false;
  if (f.from && t.date < f.from) return false;
  if (f.to && t.date > f.to) return false;
  return true;
}

// Ряд доход/расход по дням или месяцам. toDisplay(t) -> сумма в валюте показа.
export function buildTimeSeries(transactions, granularity, toDisplay) {
  const map = new Map();
  for (const t of transactions) {
    if (!isIncome(t) && !isExpense(t)) continue;
    const key = granularity === 'day' ? t.date : monthKey(t.date);
    if (!key) continue;
    const value = toDisplay(t);
    if (value == null) continue;
    if (!map.has(key)) map.set(key, { key, income: 0, expense: 0 });
    const bucket = map.get(key);
    if (isIncome(t)) bucket.income += value;
    else bucket.expense += value;
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

// Ряд расходов по категориям во времени (для стек-графика).
// topCategories — категории, показываемые отдельно; остальные идут в «Другое».
export function buildCategoryTimeSeries(transactions, granularity, toDisplay, topCategories) {
  const topSet = new Set(topCategories);
  const map = new Map();
  for (const t of transactions) {
    if (!isExpense(t)) continue;
    const key = granularity === 'day' ? t.date : monthKey(t.date);
    if (!key) continue;
    const value = toDisplay(t);
    if (value == null) continue;
    if (!map.has(key)) map.set(key, { key });
    const bucket = map.get(key);
    const name = t.category || 'Без категории';
    const bucketKey = topSet.has(name) ? name : 'Другое';
    bucket[bucketKey] = (bucket[bucketKey] || 0) + value;
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

// Суммы расходов по категориям (для выбора топа и цветов).
export function expenseTotalsByCategory(transactions, toDisplay) {
  const map = new Map();
  for (const t of transactions) {
    if (!isExpense(t)) continue;
    const value = toDisplay(t);
    if (value == null) continue;
    const name = t.category || 'Без категории';
    map.set(name, (map.get(name) || 0) + value);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

// Баланс кошелька в его валюте.
// adjust_in / adjust_out — корректировки реального баланса (не доход/расход).
export function walletBalance(transactions, walletId) {
  let balance = 0;
  for (const t of transactions) {
    if (t.wallet !== walletId) continue;
    if (t.type === 'income' || t.type === 'transfer_in' || t.type === 'adjust_in') balance += t.amount;
    else if (t.type === 'expense' || t.type === 'transfer_out' || t.type === 'adjust_out') balance -= t.amount;
  }
  return balance;
}
