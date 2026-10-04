import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS } from './chartColors';
import { COLOR_PALETTE, assignMissingColors, isColor, pickColor } from './categoryColors';

describe('COLOR_PALETTE', () => {
  it('72 разных цвета, включая цвета графиков', () => {
    expect(new Set(COLOR_PALETTE).size).toBe(72);
    for (const c of CATEGORY_COLORS) expect(COLOR_PALETTE).toContain(c);
    expect(COLOR_PALETTE.every(isColor)).toBe(true);
  });
});

describe('pickColor', () => {
  it('сначала берёт незанятые цвета графиков', () => {
    const used = CATEGORY_COLORS.slice(0, 7);
    expect(pickColor(used)).toBe(CATEGORY_COLORS[7]);
  });
  it('когда цвета графиков заняты — незанятые из палитры', () => {
    const c = pickColor(CATEGORY_COLORS);
    expect(COLOR_PALETTE).toContain(c);
    expect(CATEGORY_COLORS).not.toContain(c);
  });
  it('всё занято — любой из палитры', () => {
    expect(COLOR_PALETTE).toContain(pickColor(COLOR_PALETTE, () => 0.999));
  });
});

describe('assignMissingColors', () => {
  it('раздаёт цвета только категориям без цвета, без повторов', () => {
    const cats = [
      { id: 'a', color: CATEGORY_COLORS[0] },
      { id: 'b' },
      { id: 'c', color: 'не цвет' },
      { id: 'd', color: '' },
    ];
    const res = assignMissingColors(cats);
    expect(res.map((r) => r.id)).toEqual(['b', 'c', 'd']);
    const all = [CATEGORY_COLORS[0], ...res.map((r) => r.color)];
    expect(new Set(all).size).toBe(all.length);
    expect(res.every((r) => isColor(r.color))).toBe(true);
  });
});
