// Цвет категории: хранится в самой категории (поле color, '#rrggbb') и рисует её
// на графиках и иконке. Палитра выбора — Tailwind 400: сначала хорошо различимые
// цвета графиков (CATEGORY_COLORS), затем дополнительные оттенки.
import { CATEGORY_COLORS } from './chartColors';

export const COLOR_PALETTE = [
  ...CATEGORY_COLORS,
  '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8',
  '#c084fc', '#e879f9', '#fb7185', '#facc15',
];

const HEX = /^#[0-9a-f]{6}$/i;
export const isColor = (v) => typeof v === 'string' && HEX.test(v);

// Случайный цвет для новой категории: сперва из ещё не занятых цветов графиков,
// потом из незанятых цветов палитры, и только если всё занято — любой.
export function pickColor(used = [], rnd = Math.random) {
  const taken = new Set(used.filter(isColor).map((c) => c.toLowerCase()));
  const pool = [CATEGORY_COLORS, COLOR_PALETTE]
    .map((list) => list.filter((c) => !taken.has(c)))
    .find((list) => list.length) || COLOR_PALETTE;
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}

// Категориям без цвета (старые данные) раздать цвета, не повторяя занятые.
// Возвращает [{ id, color }] только для тех, кому цвет назначен.
export function assignMissingColors(categories, rnd = Math.random) {
  const used = categories.map((c) => c.color).filter(isColor);
  const assigned = [];
  for (const c of categories) {
    if (isColor(c.color)) continue;
    const color = pickColor(used, rnd);
    used.push(color);
    assigned.push({ id: c.id, color });
  }
  return assigned;
}

// id SVG-фильтра тонировки иконки в цвет (см. components/CategoryTints.jsx).
export const tintId = (color) => `tint-${color.slice(1).toLowerCase()}`;
export const tintFilter = (color) => (isColor(color) ? `url(#${tintId(color)})` : undefined);
