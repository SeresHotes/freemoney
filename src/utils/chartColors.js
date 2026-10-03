// Общая палитра и логика выбора топ-категорий для графиков.
// 8 хорошо различимых оттенков для тёмного фона (OKLCH L 0.48–0.67), проверены
// валидатором палитр (dataviz): соседние в этом порядке — и последний с первым,
// по кругу — различимы и при дальтонизме (ΔE ≥ 18), любые два — ΔE ≥ 14.8.
// Порядок важен: на кольце главной цвета идут по часовой в этом порядке.
// Больше 8 категорий — в «Другое» (девятый цвет совпал бы с первым).
export const CATEGORY_COLORS = [
  '#2071f3', '#098356', '#9c5eef', '#db2943',
  '#01a2c5', '#d37812', '#e051ba', '#879f18',
];
// «Другое» — светло-серый: заметно отличается от всех восьми.
export const OTHER_COLOR = '#cbd5e1';
export const TOP_CATEGORIES = 8;

// totals — [{name, value}] по убыванию. Возвращает список топ-имён и серии с цветами.
export function buildCategorySeries(totals) {
  const top = totals.slice(0, TOP_CATEGORIES).map((c) => c.name);
  const series = top.map((name, i) => ({ name, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  if (totals.length > TOP_CATEGORIES) series.push({ name: 'Другое', color: OTHER_COLOR });
  return { top, series };
}
