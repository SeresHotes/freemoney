import { describe, expect, it } from 'vitest';
import { R_FRAC, layoutRing, ringNamedCount } from './ringLayout';

const mk = (pairs) => pairs.map(([name, value]) => ({ name, value }));

describe('layoutRing', () => {
  const big = mk([['Жильё', 30000], ['Продукты', 12000], ['Кафе', 5400], ['Одежда', 4200], ['Транспорт', 3100], ['Развлечения', 2500], ['Спорт', 2000], ['Другое', 5500]]);

  it('кольцо фиксированного размера — доля ширины, независимо от данных', () => {
    const a = layoutRing(big, 306, 520);
    const b = layoutRing(mk([['Жильё', 1], ['Еда', 1]]), 306, 520);
    expect(a.R).toBeCloseTo(306 * R_FRAC);
    expect(b.R).toBeCloseTo(306 * R_FRAC);
  });

  it('сегменты — строго по убыванию по часовой', () => {
    const g = layoutRing(big, 306, 520);
    expect(g.slices.map((s) => s.name)).toEqual(big.map((d) => d.name));
    for (let i = 1; i < g.slices.length; i++) expect(g.slices[i].a0).toBeGreaterThan(g.slices[i - 1].a0);
  });

  it('одна крупная категория: линии не обходят кольцо, подписи поровну', () => {
    const g = layoutRing(big, 306, 520);
    expect(g.labels.every((l) => l.a.detour === 0)).toBe(true);
    const top = g.labels.filter((l) => l.top).length;
    expect(Math.abs(top - g.labels.length / 2)).toBeLessThanOrEqual(1);
  });

  it('10 категорий — 5 сверху и 5 снизу, линии не обходят кольцо', () => {
    const g = layoutRing(mk(Array.from({ length: 10 }, (_, i) => [`c${i}`, 1000 - i * 30])), 306, 520);
    expect(g.labels.filter((l) => l.top)).toHaveLength(5);
    expect(g.labels.every((l) => l.a.detour === 0)).toBe(true);
  });

  it('детерминирована', () => {
    const data = mk([['Жильё', 90000], ['Продукты', 4000], ['Другое', 6000]]);
    const a = layoutRing(data, 306, 520);
    const b = layoutRing(data, 306, 520);
    expect(a.labels.map((l) => [l.s.name, l.x, l.top])).toEqual(b.labels.map((l) => [l.s.name, l.x, l.top]));
  });

  it('низкий экран — кольцо меньше, но всё помещается', () => {
    const g = layoutRing(big, 306, 260);
    expect(g.R).toBeLessThan(306 * R_FRAC);
    expect(g.topY - g.labelH / 2).toBeGreaterThanOrEqual(-0.5);
    expect(g.botY + g.labelH / 2).toBeLessThanOrEqual(260.5);
  });

  it('одна категория — полное кольцо', () => {
    const g = layoutRing(mk([['Жильё', 100]]), 306, 520);
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

describe('layoutRing: обход кольца', () => {
  it('шесть мелких подряд — линия обходит кольцо, а не идёт насквозь', () => {
    const g = layoutRing(
      mk([['Study', 18800], ['House', 13100], ['Sub', 13100], ['Food', 2850], ['Cafe', 2280], ['Sports', 1710], ['Transport', 1140], ['Sths', 1140], ['Coffee', 570], ['Другое', 1700]]),
      504,
      520,
    );
    const dist = ([x1, y1], [x2, y2]) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const t = Math.max(0, Math.min(1, ((g.cx - x1) * dx + (g.cy - y1) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(g.cx - (x1 + t * dx), g.cy - (y1 + t * dy));
    };
    expect(g.labels.some((l) => l.a.detour > 0)).toBe(true);
    for (const l of g.labels) {
      const pts = l.a.points;
      // после радиального отрезка ни один отрезок не заходит на кольцо
      for (let i = 1; i < pts.length - 1; i++) expect(dist(pts[i], pts[i + 1])).toBeGreaterThan(g.R);
    }
  });
});
