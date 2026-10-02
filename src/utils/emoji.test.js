import { describe, expect, it } from 'vitest';
import data from './emojiData.json';
import { EMOJI_PALETTE, extractEmoji, searchEmoji } from './emoji';

const all = new Set(data.flatMap((g) => g.items.map(([e]) => e)));

describe('emojiData', () => {
  it('содержит все иконки популярной палитры (в том же написании)', () => {
    for (const e of EMOJI_PALETTE) expect(all.has(e)).toBe(true);
  });
});

describe('searchEmoji', () => {
  it('ищет по-русски и по-английски', () => {
    expect(searchEmoji(data, 'кофе').map((r) => r.emoji)).toContain('☕');
    expect(searchEmoji(data, 'coffee').map((r) => r.emoji)).toContain('☕');
    expect(searchEmoji(data, 'тележка').map((r) => r.emoji)).toContain('🛒');
  });
  it('не различает ё/е и регистр', () => {
    expect(searchEmoji(data, 'ЖЕЛТ').length).toBeGreaterThan(0);
  });
  it('название с начала — выше', () => {
    expect(searchEmoji(data, 'кошка')[0].label.toLowerCase().startsWith('кошка')).toBe(true);
  });
  it('пустой запрос — пусто', () => {
    expect(searchEmoji(data, '  ')).toEqual([]);
  });
});

describe('extractEmoji', () => {
  it('берёт первый эмодзи из ввода', () => {
    expect(extractEmoji('🍕')).toBe('🍕');
    expect(extractEmoji(' 👨‍👩‍👧 ')).toBe('👨‍👩‍👧');
    expect(extractEmoji('🇷🇺')).toBe('🇷🇺');
  });
  it('обычный текст — не эмодзи', () => {
    expect(extractEmoji('кофе')).toBeNull();
    expect(extractEmoji('')).toBeNull();
  });
});
