import { describe, it, expect, vi, beforeEach } from 'vitest';

// Таблица в памяти вместо Google Sheets API.
const sheets = {};
vi.mock('./sheets', () => ({
  getValuesBatch: vi.fn(async (_id, ranges) => ranges.map((r) => sheets[r] || [])),
  clearValues: vi.fn(async (_id, range) => {
    const [, name, last] = range.match(/^(\w+)!A2:([A-Z]+)$/);
    const width = [...last].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    sheets[name] = (sheets[name] || []).map((row, i) => (i === 0 ? row : row.map((c, j) => (j < width ? '' : c))));
  }),
  updateValues: vi.fn(async (_id, range, values) => {
    const name = range.split('!')[0];
    const rows = sheets[name] || [];
    values.forEach((v, i) => {
      const cur = rows[i + 1] || [];
      rows[i + 1] = v.map((c, j) => c).concat(cur.slice(v.length));
    });
    sheets[name] = rows;
  }),
  getValues: vi.fn(), batchUpdateValues: vi.fn(), createSpreadsheet: vi.fn(),
  getSpreadsheetMeta: vi.fn(), addSheet: vi.fn(), listAppSpreadsheets: vi.fn(),
}));

const { fetchAllForSync, overwriteEntity, hydrateExtra } = await import('./store');

const CAT_HEAD = ['name', 'kind', 'archived', 'icon', 'id', 'order', 'updatedAt', 'deleted', 'color', 'budget'];

beforeEach(() => {
  for (const k of Object.keys(sheets)) delete sheets[k];
});

describe('store: колонки более новой схемы', () => {
  it('неизвестные колонки читаются в extra и пишутся обратно на свои строки', async () => {
    sheets.Categories = [
      CAT_HEAD,
      ['Еда', 'expense', '', '🍔', 'c1', '0', '2026-01-01 10:00:00', '', '#ff0000', '500'],
      ['Кафе', 'expense', '', '☕', 'c2', '1', '2026-01-01 10:00:00', '', '#00ff00', '200'],
    ];
    const { categories } = await fetchAllForSync('id');
    expect(categories.map((c) => c.extra)).toEqual([['500'], ['200']]);

    // Перезапись в другом порядке и с новой записью без extra: значения
    // неизвестной колонки не должны съехать на чужие строки.
    const fresh = { name: 'Такси', kind: 'expense', id: 'c3', order: 2, updatedAt: 0 };
    await overwriteEntity('id', 'categories', [categories[1], fresh, categories[0]]);
    const rows = sheets.Categories.slice(1);
    expect(rows.map((r) => [r[0], r[9] ?? ''])).toEqual([['Кафе', '200'], ['Такси', ''], ['Еда', '500']]);
    expect(sheets.Categories[0]).toEqual(CAT_HEAD);
  });

  it('hydrateExtra разбирает сохранённые ячейки, когда версия узнала колонку', () => {
    // Запись сохранила старая версия, знавшая 8 колонок (без color).
    const rec = { name: 'Еда', kind: 'expense', id: 'c1', order: 0, updatedAt: 1234, extra: ['#ff0000', '500'], extraFrom: 8 };
    const out = hydrateExtra('categories', rec);
    expect(out.color).toBe('#ff0000');
    expect(out.extra).toEqual(['500']);
    expect(out.extraFrom).toBe(9);
    expect(out.updatedAt).toBe(1234);
    expect(out.id).toBe('c1');
  });

  it('запись без extra не меняется', () => {
    const rec = { name: 'Еда', id: 'c1', updatedAt: 1 };
    expect(hydrateExtra('categories', rec)).toBe(rec);
  });
});
