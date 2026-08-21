// Общая палитра и логика выбора топ-категорий для графиков.
export const CATEGORY_COLORS = [
  '#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa',
  '#f472b6', '#22d3ee', '#fb923c', '#4ade80', '#e879f9',
];
export const OTHER_COLOR = '#64748b';
export const TOP_CATEGORIES = 8;

// totals — [{name, value}] по убыванию. Возвращает список топ-имён и серии с цветами.
export function buildCategorySeries(totals) {
  const top = totals.slice(0, TOP_CATEGORIES).map((c) => c.name);
  const series = top.map((name, i) => ({ name, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  if (totals.length > TOP_CATEGORIES) series.push({ name: 'Другое', color: OTHER_COLOR });
  return { top, series };
}
