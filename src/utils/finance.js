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

// Проверка операции по набору фильтров (пустой массив = без ограничения).
// tags — совпадение по любому из выбранных.
export function matchesFilters(t, f) {
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

// Баланс кошелька в его валюте.
export function walletBalance(transactions, walletId) {
  let balance = 0;
  for (const t of transactions) {
    if (t.wallet !== walletId) continue;
    if (t.type === 'income' || t.type === 'transfer_in') balance += t.amount;
    else if (t.type === 'expense' || t.type === 'transfer_out') balance -= t.amount;
  }
  return balance;
}
