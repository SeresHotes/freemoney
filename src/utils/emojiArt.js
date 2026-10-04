// Рисовки эмодзи для иконок категорий. В данных иконка — обычный эмодзи (🍔),
// а рисуется выбранным стилем (настройка iconStyle). Данные — src/utils/emojiArt/
// (генератор scripts/gen-emoji-art.mjs): по файлу на группу пикера, грузятся
// лениво — только группы, где есть нужные эмодзи, и только выбранного стиля.
import groupIndex from './emojiArt/index.json';

// tint — одноцветный стиль: рисуется цветом категории (currentColor).
// fallback — стиль, которым дорисовываются эмодзи, отсутствующие в наборе.
export const ICON_STYLES = {
  hc: { label: 'Контурные (Fluent)', tint: true },
  mono: { label: 'Гравюра (EmojiOne)', tint: true, fallback: 'hc' },
  flat: { label: 'Цветные (Fluent Flat)', tint: false },
  native: { label: 'Системные эмодзи', tint: true },
};
export const DEFAULT_ICON_STYLE = 'hc';
export const iconStyleOf = (v) => (ICON_STYLES[v] ? v : DEFAULT_ICON_STYLE);

// Иконки служебных строк (операции без категории, «Другое» на кольце).
export const SERVICE_ICONS = ['🤝', '📈', '⚖️', '📦', '🏷️'];

export const artKey = (emoji) => (emoji || '').replace(/️/g, '');

const loaders = import.meta.glob('./emojiArt/*-*.json', { import: 'default' });
const loaded = new Map(); // `${style}-${group}` → Promise<{ эмодзи: [w, h, body] }>
const art = new Map(); // `${style}:${key}` → [w, h, body] | null (нет в наборе)

function loadGroup(style, group) {
  const id = `${style}-${group}`;
  if (!loaded.has(id)) {
    const load = loaders[`./emojiArt/${id}.json`];
    const p = (load ? load() : Promise.resolve({})).then((data) => {
      for (const [k, v] of Object.entries(data)) art.set(`${style}:${k}`, v);
      return data;
    }).catch((e) => {
      loaded.delete(id);
      throw e;
    });
    loaded.set(id, p);
  }
  return loaded.get(id);
}

// Стили, которыми рисуется эмодзи в стиле style: сам стиль и его запасной.
const chain = (style) => (style === 'native' ? [] : [style, ICON_STYLES[style].fallback].filter(Boolean));

// Загрузить рисовки для списка эмодзи (без ошибок наружу — тогда будет системный эмодзи).
export async function ensureArt(style, emojis) {
  const groups = new Set(emojis.map((e) => groupIndex[artKey(e)]).filter((g) => g != null));
  await Promise.all(chain(style).flatMap((s) => [...groups].map((g) => loadGroup(s, g).catch(() => null))));
}

// Рисовка эмодзи: { art: [w, h, body], tint } | null — если загружено и есть в наборе.
// undefined — ещё не загружено (надо ensureArt).
export function getArt(style, emoji) {
  const k = artKey(emoji);
  const group = groupIndex[k];
  for (const s of chain(style)) {
    if (group == null) return null;
    if (!loaded.has(`${s}-${group}`)) return undefined;
    const a = art.get(`${s}:${k}`);
    if (a) return { art: a, tint: ICON_STYLES[s].tint };
  }
  return null;
}
