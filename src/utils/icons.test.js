import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, DEFAULT_ICON } from '../api/defaults';
import { EMOJI_TO_LUCIDE, isLucide, lucide, lucideSvg, migrateIcon } from './icons';

describe('иконки Lucide', () => {
  it('базовые категории и замены эмодзи рисуются без догрузки полного набора', () => {
    const icons = [DEFAULT_ICON, ...DEFAULT_CATEGORIES.map((c) => c.icon), ...Object.values(EMOJI_TO_LUCIDE).map(lucide)];
    for (const icon of icons) {
      expect(isLucide(icon)).toBe(true);
      expect(lucideSvg(icon), icon).toMatch(/^<(path|circle|rect|line|polyline|polygon|ellipse)/);
    }
  });
  it('эмодзи прежней палитры меняются на Lucide, остальные — как есть', () => {
    expect(migrateIcon('🛒')).toBe('lucide:shopping-cart');
    expect(migrateIcon('🦄')).toBe('🦄');
    expect(migrateIcon('lucide:tag')).toBe('lucide:tag');
  });
});
