// Цвет категории: хранится в самой категории (поле color, '#rrggbb') и рисует её
// на графиках и иконке. Палитра выбора — Tailwind 300–600 (72 цвета), в неё
// входят и хорошо различимые цвета графиков (CATEGORY_COLORS).
import { CATEGORY_COLORS } from './chartColors';

// Тона Tailwind по кругу спектра (+ нейтральный серый), по 4 оттенка: 300–600.
const HUES = {
  red: ['#fca5a5', '#f87171', '#ef4444', '#dc2626'],
  orange: ['#fdba74', '#fb923c', '#f97316', '#ea580c'],
  amber: ['#fcd34d', '#fbbf24', '#f59e0b', '#d97706'],
  yellow: ['#fde047', '#facc15', '#eab308', '#ca8a04'],
  lime: ['#bef264', '#a3e635', '#84cc16', '#65a30d'],
  green: ['#86efac', '#4ade80', '#22c55e', '#16a34a'],
  emerald: ['#6ee7b7', '#34d399', '#10b981', '#059669'],
  teal: ['#5eead4', '#2dd4bf', '#14b8a6', '#0d9488'],
  cyan: ['#67e8f9', '#22d3ee', '#06b6d4', '#0891b2'],
  sky: ['#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7'],
  blue: ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb'],
  indigo: ['#a5b4fc', '#818cf8', '#6366f1', '#4f46e5'],
  violet: ['#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed'],
  purple: ['#d8b4fe', '#c084fc', '#a855f7', '#9333ea'],
  fuchsia: ['#f0abfc', '#e879f9', '#d946ef', '#c026d3'],
  pink: ['#f9a8d4', '#f472b6', '#ec4899', '#db2777'],
  rose: ['#fda4af', '#fb7185', '#f43f5e', '#e11d48'],
  slate: ['#cbd5e1', '#94a3b8', '#64748b', '#475569'],
};
const SHADES = 4;
// Палитра — по строкам оттенков (каждый оттенок — 2 строки по 9 тонов), так в
// сетке видна радуга от светлых к тёмным.
export const PALETTE_COLUMNS = 9;
export const COLOR_PALETTE = Array.from({ length: SHADES }, (_, s) => Object.values(HUES).map((h) => h[s])).flat();
// Средние (400) тона — вторая очередь для случайного выбора после цветов графиков.
const MID_TONES = Object.values(HUES).map((h) => h[1]);

const HEX = /^#[0-9a-f]{6}$/i;
export const isColor = (v) => typeof v === 'string' && HEX.test(v);

// Случайный цвет для новой категории: сперва из ещё не занятых цветов графиков,
// потом из незанятых средних тонов, затем — всей палитры; если всё занято — любой.
export function pickColor(used = [], rnd = Math.random) {
  const taken = new Set(used.filter(isColor).map((c) => c.toLowerCase()));
  const pool = [CATEGORY_COLORS, MID_TONES, COLOR_PALETTE]
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
