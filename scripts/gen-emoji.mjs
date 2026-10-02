// Генерация полного набора эмодзи для выбора иконки категории.
// Источник — emojibase-data (devDependency): русские и английские названия и теги,
// чтобы поиск работал на обоих языках. Результат — src/utils/emojiData.json,
// грузится лениво (отдельный чанк), только когда открыт пикер.
// Запуск: npm run emoji
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(readFileSync(join(root, 'node_modules', 'emojibase-data', p), 'utf8'));

// Эмодзи новее этой версии многие устройства ещё рисуют «квадратиками».
const MAX_VERSION = 14;
// Короткие русские названия групп для вкладок пикера (emojibase-группы по номеру).
const GROUPS = [
  { id: 0, name: 'Смайлы', icon: '😀' },
  { id: 1, name: 'Люди', icon: '👋' },
  { id: 3, name: 'Природа', icon: '🐾' },
  { id: 4, name: 'Еда', icon: '🍔' },
  { id: 5, name: 'Места', icon: '✈️' },
  { id: 6, name: 'Досуг', icon: '⚽' },
  { id: 7, name: 'Предметы', icon: '💡' },
  { id: 8, name: 'Символы', icon: '❤️' },
  { id: 9, name: 'Флаги', icon: '🏳️' },
];

const ru = load('ru/data.json');
const en = new Map(load('en/data.json').map((e) => [e.hexcode, e]));

const words = (e) => [e?.label, ...(e?.tags || [])].filter(Boolean).join(' ').toLowerCase().split(/\s+/);
// emojibase отдаёт fully-qualified форму с VS16 (U+FE0F) даже там, где символ
// и так эмодзи по умолчанию (☕️). Убираем лишний VS16, чтобы иконка совпадала
// с той, что уже лежит в данных (☕), — иначе выбранная не подсвечивается.
const canon = (s) => s.replace(/(\p{Emoji_Presentation})\uFE0F/gu, '$1');

const byGroup = new Map(GROUPS.map((g) => [g.id, []]));
for (const e of [...ru].sort((a, b) => a.order - b.order)) {
  if (!byGroup.has(e.group) || e.version > MAX_VERSION) continue;
  const keywords = [...new Set([...words(e), ...words(en.get(e.hexcode))])].join(' ');
  // [эмодзи, «название|ключевые слова»]: название — для подсказки, всё вместе — для поиска.
  byGroup.get(e.group).push([canon(e.emoji), `${e.label}|${keywords}`]);
}

const data = GROUPS.map((g) => ({ name: g.name, icon: g.icon, items: byGroup.get(g.id) }));
writeFileSync(join(root, 'src', 'utils', 'emojiData.json'), JSON.stringify(data));
console.log(`✓ ${data.reduce((n, g) => n + g.items.length, 0)} эмодзи`);
