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
