// Финансовые расчёты над операциями. Суммы операций — в валюте их кошелька.

export function isIncome(t) {
  return t.type === 'income';
}
export function isExpense(t) {
  return t.type === 'expense';
}
// Долговой кошелёк-контрагент: положительный баланс — вам должны, отрицательный — должны вы.
export function isDebtWallet(w) {
  return w?.kind === 'debt';
}
// Реальный доход/расход (переводы между кошельками сюда не входят).
export function isRealFlow(t) {
  return t.type === 'income' || t.type === 'expense';
}

import { monthKey } from './format';
import { normalizeType, signedAmount } from './model';

// Укрупнённый тип операции: expense | income | transfer | adjust | interest.
export function txKind(t) {
  return normalizeType(t.type);
}

// Знаковый вклад операции в баланс кошелька (в его валюте). amount уже знаковый
// в новой модели; signedAmount дополнительно понимает старый формат (положительный
// amount + суффикс _in/_out), поэтому расчёт корректен и на немигрированных записях.
// Проценты (interest) — как корректировки: влияют на баланс, но это не доход/расход
// (в статистику потоков не попадают, категории не требуют).
export function signedDelta(t) {
  return signedAmount(t.type, t.amount);
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

// Ключ временного бакета: день (YYYY-MM-DD), месяц (YYYY-MM) или год (YYYY).
function timeBucketKey(date, granularity) {
  if (granularity === 'day') return date;
  if (granularity === 'year') return (date || '').slice(0, 4);
  return monthKey(date);
}

// Ряд доход/расход по дням или месяцам. toDisplay(t) -> сумма в валюте показа.
export function buildTimeSeries(transactions, granularity, toDisplay) {
  const map = new Map();
  for (const t of transactions) {
    if (!isIncome(t) && !isExpense(t)) continue;
    const key = timeBucketKey(t.date, granularity);
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
    const key = timeBucketKey(t.date, granularity);
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

// Баланс кошелька в его валюте. Корректировки (adjust) и проценты (interest)
// тоже влияют на баланс, но это не доход/расход — знак берётся из amount.
export function walletBalance(transactions, walletName) {
  let balance = 0;
  for (const t of transactions) {
    if (t.wallet !== walletName) continue;
    balance += signedDelta(t);
  }
  return balance;
}

// Хронологический ключ операции (дата + время) для сортировки в пределах кошелька.
function txOrderKey(t) {
  return `${t.date} ${t.time || '00:00'}`;
}

// Баланс кошелька на момент orderKey (все операции с ключом <= orderKey), кроме
// операции excludeId. Нужен для «сколько было денег на тот момент» — база
// начисления процентов и хронология долгов.
export function walletBalanceAsOf(transactions, walletName, orderKey, excludeId) {
  let balance = 0;
  for (const t of transactions) {
    if (t.wallet !== walletName || t.id === excludeId) continue;
    if (txOrderKey(t) > orderKey) continue;
    balance += signedDelta(t);
  }
  return balance;
}

// Баланс долгового кошелька ДО указанной операции (по хронологии) — нужен, чтобы
// понять, растёт долг по модулю (дал/взял) или гасится (возврат/погашение).
export function debtBalanceBefore(transactions, walletName, beforeTx) {
  return walletBalanceAsOf(transactions, walletName, txOrderKey(beforeTx), beforeTx.id);
}

// Человеческая подпись операции долга. cashOut — деньги ушли из моего кошелька
// (кошелёк→долг); balBefore — баланс долгового кошелька до операции.
export function debtRowLabel(cashOut, balBefore) {
  if (cashOut) return balBefore < 0 ? 'Погашение долга' : 'Дал в долг';
  return balBefore > 0 ? 'Возврат долга' : 'Взял в долг';
}
