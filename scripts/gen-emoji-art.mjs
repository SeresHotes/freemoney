// Генерация «рисовок» эмодзи для иконок категорий: эмодзи в данных остаётся
// эмодзи (🍔), а рисуется выбранным набором SVG. Источники — пакеты Iconify
// (devDependencies): Fluent Emoji High Contrast, Fluent Emoji Flat (MIT),
// EmojiOne Monotone (CC BY 4.0). Набор эмодзи — тот же, что в пикере
// (src/utils/emojiData.json, см. gen-emoji.mjs).
// Результат — src/utils/emojiArt/:
//   index.json        — эмодзи → номер группы пикера (маленький, в основном бандле);
//   <стиль>-<N>.json  — { эмодзи: [ширина, высота, тело svg] } по группам;
//                       грузятся лениво, только нужные группы выбранного стиля.
// Ключ эмодзи — без вариационного селектора U+FE0F (artKey в utils/emojiArt.js).
// Запуск: npm run emoji-art (после npm run emoji, если менялся набор).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => JSON.parse(readFileSync(join(root, 'node_modules', p), 'utf8'));
const out = join(root, 'src', 'utils', 'emojiArt');

const key = (e) => e.replace(/️/g, '');
const hex = (e) => [...key(e)].map((c) => c.codePointAt(0).toString(16)).join('-');
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’'".:,!()&*#]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const groups = JSON.parse(readFileSync(join(root, 'src', 'utils', 'emojiData.json'), 'utf8'));
// Иконки служебных строк (операции без категории, «Другое») — не только из пикера.
const EXTRA = ['🤝', '📈', '⚖️', '📦', '🏷️'];
const emojiGroup = new Map();
groups.forEach((g, i) => g.items.forEach(([e]) => { if (!emojiGroup.has(key(e))) emojiGroup.set(key(e), i); }));
for (const e of EXTRA) if (!emojiGroup.has(key(e))) console.warn('⚠ служебный эмодзи не в пикере:', e);

// Имена эмодзи (en) из emojibase — для наборов без таблицы символов (EmojiOne).
const en = new Map(nm('emojibase-data/en/data.json').map((e) => [key(e.emoji), e]));

const STYLES = {
  hc: 'fluent-emoji-high-contrast',
  flat: 'fluent-emoji-flat',
  mono: 'emojione-monotone',
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.json'), JSON.stringify(Object.fromEntries(emojiGroup)));

for (const [style, pkg] of Object.entries(STYLES)) {
  const set = nm(`@iconify-json/${pkg}/icons.json`);
  let chars = {};
  try { chars = nm(`@iconify-json/${pkg}/chars.json`); } catch { /* нет таблицы символов */ }
  const byHex = new Map(Object.entries(chars).map(([h, n]) => [h.split('-').filter((x) => x !== 'fe0f').join('-'), n]));
  const icon = (name) => set.icons[name] || (set.aliases?.[name] && set.icons[set.aliases[name].parent]);
  const files = groups.map(() => ({}));
  let hit = 0;
  let bytes = 0;
  for (const [k, gi] of emojiGroup) {
    const e = en.get(k);
    const names = [byHex.get(hex(k)), e && slug(e.label), ...(e?.shortcodes || []).map(slug)].filter(Boolean);
    const name = names.find(icon);
    if (!name) continue;
    const ic = icon(name);
    if (ic.left || ic.top) console.warn(`⚠ ${pkg}/${name}: смещённый viewBox`);
    files[gi][k] = [ic.width || set.width || 16, ic.height || set.height || 16, ic.body];
    hit += 1;
    bytes += ic.body.length;
  }
  files.forEach((f, gi) => writeFileSync(join(out, `${style}-${gi}.json`), JSON.stringify(f)));
  console.log(`✓ ${style}: ${hit} из ${emojiGroup.size}, ${Math.round(bytes / 1024)} КБ`);
}
