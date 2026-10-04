import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, DEFAULT_ICON } from '../api/defaults';
import { EMOJI_PALETTE } from './emoji';
import { SERVICE_ICONS, artKey, ensureArt, getArt } from './emojiArt';
import { migrateIcon } from './legacyIcons';

const icons = [DEFAULT_ICON, ...DEFAULT_CATEGORIES.map((c) => c.icon), ...EMOJI_PALETTE, ...SERVICE_ICONS];

describe('рисовки эмодзи', () => {
  it('до загрузки — undefined, после — рисовка', async () => {
    expect(getArt('flat', '🍔')).toBeUndefined();
    await ensureArt('flat', ['🍔']);
    const a = getArt('flat', '🍔');
    expect(a.tint).toBe(false);
    expect(a.art[2]).toMatch(/^<[a-z]/);
  });

  it('базовые и популярные иконки есть в Fluent High Contrast и Flat', async () => {
    for (const style of ['hc', 'flat']) {
      await ensureArt(style, icons);
      const missing = icons.filter((e) => !getArt(style, e)).map(artKey);
      expect(missing, style).toEqual([]);
    }
  });

  it('EmojiOne Monotone дорисовывает недостающие стилем Fluent HC', async () => {
    await ensureArt('mono', icons);
    for (const e of icons) expect(getArt('mono', e), e).toBeTruthy();
  });

  it('стиль «Системные эмодзи» рисовок не грузит', async () => {
    await ensureArt('native', ['🍔']);
    expect(getArt('native', '🍔')).toBeNull();
  });
});

describe('иконки lucide:… → эмодзи', () => {
  it('известные — в аналог, неизвестные — в метку, эмодзи — как есть', () => {
    expect(migrateIcon('lucide:shopping-cart')).toBe('🛒');
    expect(migrateIcon('lucide:whatever')).toBe('🏷️');
    expect(migrateIcon('🦄')).toBe('🦄');
  });
});
