import { describe, it, expect } from 'vitest';
import { signedDelta, walletBalance, txKind, isIncome, isExpense, lastEntryCurrency } from './finance';

describe('signedDelta', () => {
  it('новый формат: возвращает знаковый amount', () => {
    expect(signedDelta({ type: 'expense', amount: -30 })).toBe(-30);
    expect(signedDelta({ type: 'income', amount: 40 })).toBe(40);
    expect(signedDelta({ type: 'transfer', amount: -50 })).toBe(-50);
    expect(signedDelta({ type: 'adjust', amount: 5 })).toBe(5);
    expect(signedDelta({ type: 'interest', amount: -3 })).toBe(-3);
  });
  it('старый формат: знак из типа при положительном amount', () => {
    expect(signedDelta({ type: 'expense', amount: 30 })).toBe(-30);
    expect(signedDelta({ type: 'transfer_out', amount: 50 })).toBe(-50);
    expect(signedDelta({ type: 'transfer_in', amount: 50 })).toBe(50);
    expect(signedDelta({ type: 'interest_out', amount: 3 })).toBe(-3);
  });
});

describe('walletBalance', () => {
  const txs = [
    { wallet: 'A', type: 'income', amount: 100 },
    { wallet: 'A', type: 'expense', amount: -30 },
    { wallet: 'A', type: 'transfer', amount: -20 },   // перевод из A
    { wallet: 'B', type: 'transfer', amount: 20 },     // перевод в B
    { wallet: 'A', type: 'adjust', amount: 5 },
    { wallet: 'A', type: 'interest', amount: -3 },
  ];
  it('суммирует знаковые вклады по кошельку', () => {
    expect(walletBalance(txs, 'A')).toBe(100 - 30 - 20 + 5 - 3);
    expect(walletBalance(txs, 'B')).toBe(20);
  });
  it('корректно считает и на старом формате', () => {
    const legacy = [
      { wallet: 'A', type: 'income', amount: 100 },
      { wallet: 'A', type: 'expense', amount: 30 },      // старый: положительный
      { wallet: 'A', type: 'transfer_out', amount: 20 },  // старый
    ];
    expect(walletBalance(legacy, 'A')).toBe(100 - 30 - 20);
  });
});

describe('txKind / isIncome / isExpense', () => {
  it('txKind укрупняет старые и новые типы', () => {
    expect(txKind({ type: 'transfer_out' })).toBe('transfer');
    expect(txKind({ type: 'transfer' })).toBe('transfer');
    expect(txKind({ type: 'adjust_in' })).toBe('adjust');
    expect(txKind({ type: 'expense' })).toBe('expense');
  });
  it('isIncome/isExpense по типу', () => {
    expect(isIncome({ type: 'income' })).toBe(true);
    expect(isExpense({ type: 'expense' })).toBe(true);
    expect(isIncome({ type: 'transfer' })).toBe(false);
  });
});

describe('lastEntryCurrency', () => {
  const txs = [
    { type: 'expense', wallet: 'Карта', currency: 'RUB', origCurrency: 'USD', date: '2026-10-20', time: '10:00:00' },
    { type: 'expense', wallet: 'Карта', currency: 'RUB', origCurrency: '', date: '2026-10-01', time: '10:00:00' },
    { type: 'income', wallet: 'Карта', currency: 'RUB', origCurrency: '', date: '2026-10-22', time: '10:00:00' },
    { type: 'expense', wallet: 'Нал', currency: 'GEL', origCurrency: 'USD', date: '2026-10-23', time: '10:00:00', deleted: true },
  ];
  it('берёт валюту ввода последней операции этого типа', () => {
    expect(lastEntryCurrency(txs, 'Карта', 'expense')).toBe('USD');
    expect(lastEntryCurrency(txs, 'Карта', 'income')).toBe('RUB');
  });
  it('нет операций (или только удалённые) — пусто', () => {
    expect(lastEntryCurrency(txs, 'Нал', 'expense')).toBe('');
    expect(lastEntryCurrency(txs, 'Другой', 'expense')).toBe('');
  });
});
