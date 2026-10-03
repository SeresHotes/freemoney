// Общая палитра и логика выбора топ-категорий для графиков.
// Прежняя палитра (Tailwind 400), без почти одинаковых пар: зелёный и фуксия
// убраны, изумрудный заменён салатовым (был похож на бирюзовый). Порядок важен:
// на кольце главной цвета идут по часовой в этом порядке, и соседние (включая
// последний с первым) хорошо различимы — ΔE ≥ 27, при дальтонизме ≥ 16.9;
// похожие пары (красный/розовый, синий/фиолетовый) рядом не стоят.
// Больше 8 категорий — в «Другое» (девятый цвет совпал бы с первым).
export const CATEGORY_COLORS = [
  '#60a5fa', '#f87171', '#22d3ee', '#fbbf24',
  '#f472b6', '#a3e635', '#a78bfa', '#fb923c',
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
