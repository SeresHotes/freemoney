import { describe, expect, it } from 'vitest';
import { layoutRing, ringNamedCount } from './ringLayout';

const mk = (pairs) => pairs.map(([name, value]) => ({ name, value }));
const maxDev = (g) => Math.max(...g.labels.map((l) => l.a.dev));

describe('layoutRing', () => {
  it('одна крупная категория: линии не по касательной (≥20°), подписи поровну', () => {
    const g = layoutRing(
      mk([['Жильё', 30000], ['Продукты', 12000], ['Кафе', 5400], ['Одежда', 4200], ['Транспорт', 3100], ['Развлечения', 2500], ['Спорт', 2000], ['Другое', 5500]]),
      306,
      430,
    );
    expect(maxDev(g)).toBeLessThanOrEqual(70);
    const top = g.labels.filter((l) => l.top).length;
    expect(Math.abs(top - (g.labels.length - top))).toBeLessThanOrEqual(1);
  });

  it('10 равных категорий — 5 сверху и 5 снизу', () => {
    const g = layoutRing(mk(Array.from({ length: 10 }, (_, i) => [`c${i}`, 1000 - i * 30])), 306, 430);
    expect(g.labels.filter((l) => l.top)).toHaveLength(5);
    expect(maxDev(g)).toBeLessThanOrEqual(70);
  });

  it('детерминирована и при равенстве ставит крупнейшую вниз', () => {
    const data = mk([['Жильё', 90000], ['Продукты', 4000], ['Другое', 6000]]);
    const a = layoutRing(data, 306, 430);
    const b = layoutRing(data, 306, 430);
    expect(a.labels.map((l) => [l.s.name, l.x, l.top])).toEqual(b.labels.map((l) => [l.s.name, l.x, l.top]));
    expect(a.labels.find((l) => l.s.name === 'Жильё').top).toBe(false);
  });

  it('одна категория — полное кольцо', () => {
    const g = layoutRing(mk([['Жильё', 100]]), 306, 430);
    expect(g.slices).toHaveLength(1);
    expect(g.labels).toHaveLength(1);
  });
});

describe('ringNamedCount', () => {
  const sum = (s) => s.reduce((a, [, v]) => a + v, 0);
  const count = (vals) => {
    const sorted = vals.map((v, i) => [`c${i}`, v]);
    return ringNamedCount(sorted, sum(sorted));
  };

  it('мало категорий — все отдельно, без «Другого»', () => {
    expect(count([90000, 4000, 2500, 1500, 1200, 800])).toBe(6);
  });

  it('10 категорий — все 10 помещаются', () => {
    expect(count([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])).toBe(10);
  });

  it('больше 10 — 9 отдельно + «Другое»', () => {
    expect(count([30, 12, 5.4, 4.2, 3.1, 2.5, 2, 1.8, 1.5, 0.9, 0.7, 0.6])).toBe(9);
  });

  it('хвост ≤1% не раскладывается', () => {
    // остаток после двух первых: 0.5 + 0.4 = 0.9% — «Другое»
    expect(count([90, 9.1, 0.5, 0.4])).toBe(2);
  });
});
