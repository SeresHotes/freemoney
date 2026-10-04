import { describe, it, expect } from 'vitest';
import { dayHeading } from './format';

describe('dayHeading', () => {
  const today = '2026-10-04';
  it('сегодня и вчера', () => {
    expect(dayHeading('2026-10-04', today)).toBe('Сегодня');
    expect(dayHeading('2026-10-03', today)).toBe('Вчера');
    expect(dayHeading('2026-03-01', '2026-03-02')).toBe('Вчера');
    expect(dayHeading('2026-02-28', '2026-03-01')).toBe('Вчера');
  });
  it('прочие дни — «число месяц, день недели»', () => {
    expect(dayHeading('2026-10-02', today)).toBe('2 октября, пятница');
  });
  it('пустая дата', () => {
    expect(dayHeading('', today)).toBe('');
  });
});
