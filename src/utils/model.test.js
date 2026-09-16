import { describe, it, expect } from 'vitest';
import { normalizeType, signedAmount, normalizeTx, isArchived, normalizeArchivable } from './model';

describe('normalizeType', () => {
  it('срезает суффикс направления', () => {
    expect(normalizeType('transfer_out')).toBe('transfer');
    expect(normalizeType('transfer_in')).toBe('transfer');
    expect(normalizeType('adjust_out')).toBe('adjust');
    expect(normalizeType('interest_in')).toBe('interest');
  });
  it('оставляет слитые типы и доход/расход как есть', () => {
    for (const t of ['expense', 'income', 'transfer', 'adjust', 'interest']) {
      expect(normalizeType(t)).toBe(t);
    }
  });
});

describe('signedAmount', () => {
  it('старый формат: положительный amount + тип задаёт знак', () => {
    expect(signedAmount('expense', 100)).toBe(-100);
    expect(signedAmount('income', 100)).toBe(100);
    expect(signedAmount('transfer_out', 50)).toBe(-50);
    expect(signedAmount('transfer_in', 50)).toBe(50);
    expect(signedAmount('adjust_out', 7)).toBe(-7);
    expect(signedAmount('interest_in', 3)).toBe(3);
  });
  it('новый формат: знаковый amount у слитых типов сохраняется', () => {
    expect(signedAmount('transfer', -50)).toBe(-50);
    expect(signedAmount('transfer', 50)).toBe(50);
    expect(signedAmount('adjust', -7)).toBe(-7);
    expect(signedAmount('interest', -3)).toBe(-3);
  });
  it('expense/income приводят к нужному знаку независимо от входного', () => {
    expect(signedAmount('expense', -100)).toBe(-100); // уже знаковый — не ломаем
    expect(signedAmount('income', 100)).toBe(100);
  });
});

describe('normalizeTx (идемпотентность)', () => {
  it('старый transfer_out → transfer со знаком', () => {
    const out = normalizeTx({ type: 'transfer_out', amount: 50 });
    expect(out.type).toBe('transfer');
    expect(out.amount).toBe(-50);
  });
  it('старый expense (положительный) → отрицательный', () => {
    expect(normalizeTx({ type: 'expense', amount: 30 }).amount).toBe(-30);
  });
  it('повторное применение ничего не меняет', () => {
    const once = normalizeTx({ type: 'transfer_out', amount: 50 });
    const twice = normalizeTx(once);
    expect(twice).toEqual(once);
    const exp1 = normalizeTx({ type: 'expense', amount: 30 });
    expect(normalizeTx(exp1)).toEqual(exp1);
  });
  it('сохраняет прочие поля', () => {
    const t = normalizeTx({ type: 'income', amount: 10, id: 'x', wallet: 'W', updatedAt: 5, deleted: true });
    expect(t).toMatchObject({ id: 'x', wallet: 'W', updatedAt: 5, deleted: true, amount: 10 });
  });
});

describe('archived', () => {
  it('isArchived понимает булев и старый строковый status', () => {
    expect(isArchived({ archived: true })).toBe(true);
    expect(isArchived({ archived: false })).toBe(false);
    expect(isArchived({ status: 'archived' })).toBe(true);
    expect(isArchived({ status: 'active' })).toBe(false);
    expect(isArchived({})).toBe(false);
  });
  it('normalizeArchivable проставляет archived и убирает status', () => {
    const w = normalizeArchivable({ name: 'W', status: 'archived', kind: 'cash' });
    expect(w.archived).toBe(true);
    expect(w.status).toBeUndefined();
    expect(w.name).toBe('W');
    expect(w.kind).toBe('cash');
  });
});
