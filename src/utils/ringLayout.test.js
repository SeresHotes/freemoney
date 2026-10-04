import { describe, expect, it } from 'vitest';
import { MAX_GAP, OTHER, R_FRAC, SLOTS, layoutRing } from './ringLayout';

const mk = (vals) => vals.map((value, i) => ({ name: `c${i}`, value }));
const sum = (a) => a.reduce((s, x) => s + x, 0);

// Экраны: обычный телефон, маленький, высокий, широкий (десктоп).
const SCREENS = [[360, 383], [320, 300], [412, 560], [600, 420]];
// Разные распределения: поровну, по убыванию, одна крупная на 70/78/90%, две крупных.
const CASES = {
  ровно12: Array(12).fill(10),
  ровно14: Array(14).fill(10),
  ровно16: Array(16).fill(10),
  убывание: [30, 15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0.5, 0.3],
  крупная70: [70, 5, 4, 4, 3, 3, 3, 2, 2, 1.5, 1.5, 1],
  крупная78: [91500, 5800, 4700, 3500, 3500, 3500, 2350, 1200, 600, 400, 300],
  крупная76: [91500, 5800, 4700, 3500, 3500, 3500, 2350, 1200, 600, 400, 300, 1500, 1000, 560.24],
  крупная90: [90, 3, 2, 1, 1, 1, 1, 0.5, 0.5],
  две40и30: [40, 30, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1],
};

describe('layoutRing: какие категории на кольце', () => {
  it('14 категорий поровну — все 14 отдельно, без «Другого»', () => {
    const g = layoutRing(mk(CASES.ровно14), 360, 383);
    expect(g.slices).toHaveLength(14);
    expect(g.slices.some((s) => s.other)).toBe(false);
  });

  it('больше 14 — 14 категорий + «Другое» с суммой остальных; у «Другого» подписи нет', () => {
    const g = layoutRing(mk(CASES.ровно16), 360, 383);
    expect(g.slices).toHaveLength(SLOTS + 1);
    const other = g.slices.find((s) => s.other);
    expect(other.name).toBe(OTHER.name);
    expect(other.items).toHaveLength(2);
    expect(other.value).toBe(20);
    expect(g.labels).toHaveLength(SLOTS);
    expect(g.labels.some((l) => l.s.other)).toBe(false);
  });

  it('отвязанные категории — в секторе «Другое», но их иконки на свободных местах, без линии', () => {
    const g = layoutRing(mk(CASES.крупная70), 360, 383);
    const other = g.slices.find((s) => s.other);
    const detached = g.labels.filter((l) => l.s.detached);
    expect(detached.length).toBe(other.items.length); // мест хватает всем
    for (const l of detached) {
      expect(l.a).toBeNull();
      expect(other.items.map((d) => d.name)).toContain(l.s.name);
      expect(l.s.percent).toBeCloseTo(l.s.value / 100);
    }
    // каждая категория видна подписью (12 категорий ≤ 14 мест), «Другое» — без подписи
    expect(g.labels).toHaveLength(12);
    expect(g.labels.some((l) => l.s.other)).toBe(false);
  });

  it('мало категорий — все отдельно, сколько есть', () => {
    for (const vals of [[100], [60, 40], [50, 30, 20]]) {
      const g = layoutRing(mk(vals), 360, 383);
      expect(g.slices).toHaveLength(vals.length);
      expect(g.labels).toHaveLength(vals.length);
    }
  });

  it('одна категория на 70% — мелкие, которым не нашлось места рядом, уходят в «Другое»', () => {
    const g = layoutRing(mk(CASES.крупная70), 360, 383);
    const other = g.slices.find((s) => s.other);
    expect(other).toBeTruthy();
    expect(g.slices.length).toBeLessThan(CASES.крупная70.length);
    expect(g.maxGap).toBeLessThanOrEqual(MAX_GAP);
  });

  for (const [w, h] of SCREENS) {
    for (const [name, vals] of Object.entries(CASES)) {
      for (const nameLines of [1, 2]) {
        it(`${name}, ${w}×${h}, строк ${nameLines}: каждая подпись не дальше MAX_GAP от сектора, в «Другом» — самые мелкие`, () => {
          const g = layoutRing(mk(vals), w, h, { nameLines });
          expect(g.slices.filter((s) => !s.other).length).toBeLessThanOrEqual(SLOTS);
          expect(g.labels.length).toBeLessThanOrEqual(SLOTS);
          expect(g.maxGap).toBeLessThanOrEqual(MAX_GAP);
          // каждая подпись — на своём месте сетки, места не повторяются
          expect(new Set(g.labels.map((l) => `${l.x},${l.y}`)).size).toBe(g.labels.length);
          // всё на месте: сумма сохраняется, «Другое» — не из одной категории
          expect(sum(g.slices.map((s) => s.value))).toBeCloseTo(sum(vals));
          const other = g.slices.find((s) => s.other);
          if (other) {
            const named = g.slices.filter((s) => !s.other);
            expect(Math.min(...named.map((s) => s.value))).toBeGreaterThanOrEqual(Math.max(...other.items.map((d) => d.value)));
          }
          // подписи — в пределах карточки
          for (const l of g.labels) {
            expect(l.x - l.w / 2).toBeGreaterThanOrEqual(-0.5);
            expect(l.x + l.w / 2).toBeLessThanOrEqual(w + 0.5);
            expect(l.y - g.labelH / 2).toBeGreaterThanOrEqual(-0.5);
            expect(l.y + g.labelH / 2).toBeLessThanOrEqual(h + 0.5);
          }
          // линии не обходят кольцо и без лишних изломов (прямая или излом у подписи)
          for (const l of g.labels.filter((x) => x.a)) {
            expect(l.a.detour).toBe(0);
            expect(l.a.points.length).toBeLessThanOrEqual(3);
          }
        });
      }
    }
  }
});

describe('layoutRing: места подписей', () => {
  it('сетка 4×5 по периметру: сверху и снизу по 4 (с углами), по бокам по 3', () => {
    const g = layoutRing(mk(CASES.ровно12), 360, 383);
    expect(g.slots).toHaveLength(SLOTS);
    const count = (side) => g.slots.filter((t) => t.side === side).length;
    expect(count('top') + count('bottom')).toBe(4);
    expect(count('corner')).toBe(4);
    expect(count('left')).toBe(3);
    expect(count('right')).toBe(3);
  });

  it('подписи идут по кругу в том же порядке, что и сегменты (линии не пересекаются)', () => {
    for (const vals of Object.values(CASES)) {
      const g = layoutRing(mk(vals), 360, 383);
      const ang = g.labels.filter((l) => l.a).map((l) => Math.atan2(l.y - g.cy, l.x - g.cx));
      // по часовой от первой подписи — углы только растут (один полный оборот)
      let turns = 0;
      if (ang.length < 2) continue;
      for (let i = 1; i <= ang.length; i++) {
        let d = ang[i % ang.length] - ang[i - 1];
        while (d <= 0) d += Math.PI * 2;
        turns += d;
      }
      expect(turns).toBeCloseTo(Math.PI * 2, 5);
    }
  });

  it('все сегменты подряд, по разу', () => {
    const g = layoutRing(mk(CASES.убывание), 360, 383);
    for (let i = 1; i < g.slices.length; i++) expect(g.slices[i].a0).toBeGreaterThan(g.slices[i - 1].a0);
    expect(new Set(g.slices.map((s) => s.name)).size).toBe(g.slices.length);
  });

  it('размер кольца не зависит от данных', () => {
    const a = layoutRing(mk(CASES.убывание), 360, 383);
    const b = layoutRing(mk([1, 1]), 360, 383);
    expect(a.R).toBeCloseTo(b.R);
    expect(a.R).toBeLessThanOrEqual(360 * R_FRAC);
  });

  it('детерминирована', () => {
    const a = layoutRing(mk(CASES.крупная70), 360, 383, { search: true, nameLines: 1 });
    const b = layoutRing(mk(CASES.крупная70), 360, 383, { nameLines: 1 });
    expect(a.labels.map((l) => [l.s.name, l.x, l.y])).toEqual(b.labels.map((l) => [l.s.name, l.x, l.y]));
  });

  it('низкий экран — подписи компактнее, но всё помещается', () => {
    const g = layoutRing(mk(CASES.убывание), 320, 260);
    for (const l of g.labels) {
      expect(l.y - g.labelH / 2).toBeGreaterThanOrEqual(-0.5);
      expect(l.y + g.labelH / 2).toBeLessThanOrEqual(260.5);
    }
  });
});

describe('layoutRing: цвета', () => {
  it('без своего цвета — по палитре, соседние разные; «Другое» — серое', () => {
    const palette = ['#a', '#b', '#c', '#d', '#e', '#f', '#g', '#h'];
    const g = layoutRing(mk([30, 20, 12, 10, 8, 6, 5, 4, 1, 1, 1, 1, 1, 1, 1, 1]), 360, 383, { palette, otherColor: '#gray' });
    expect(g.slices.find((s) => s.other).color).toBe('#gray');
    const colors = g.slices.filter((s) => !s.other).map((s) => s.color);
    for (let i = 1; i < colors.length; i++) expect(colors[i]).not.toBe(colors[i - 1]);
  });

  it('свой цвет категории важнее палитры', () => {
    const data = [{ name: 'Жильё', value: 5, color: '#123456' }, { name: 'Еда', value: 3 }];
    const g = layoutRing(data, 360, 383, { palette: ['#a', '#b'], otherColor: '#gray' });
    const byName = Object.fromEntries(g.slices.map((s) => [s.name, s.color]));
    expect(byName['Жильё']).toBe('#123456');
    expect(byName['Еда']).toBe('#a');
  });
});
