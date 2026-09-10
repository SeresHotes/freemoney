// Генерация PNG-скриншотов для PWA-манифеста (богатый диалог установки Chrome).
// Нужны два form_factor: 'wide' (desktop) и обычный/narrow (mobile).
// Мокап повторяет экран «Главная» в палитре приложения (см. src/index.css).
// Запуск: npm run screenshots
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Палитра из src/index.css
const C = {
  bg: '#0f172a',
  surface: '#1e293b',
  surface2: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  accent: '#60a5fa',
  income: '#34d399',
  expense: '#f87171',
};
const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Пилюля-чип: подложка + текст.
function chip(x, y, w, h, fill, color, text, size) {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>
    <text x="${x + w / 2}" y="${y + h / 2 + size * 0.35}" font-family="${FONT}"
          font-size="${size}" font-weight="600" text-anchor="middle" fill="${color}">${esc(text)}</text>`;
}

// Донат: три сегмента расходов по категориям.
function donut(cx, cy, r) {
  const stroke = 42;
  const circ = 2 * Math.PI * r;
  // доли сегментов
  const segs = [
    { frac: 0.42, color: '#60a5fa' },
    { frac: 0.31, color: '#f472b6' },
    { frac: 0.27, color: '#fbbf24' },
  ];
  let offset = 0;
  let arcs = '';
  for (const s of segs) {
    const len = s.frac * circ;
    arcs += `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}"
              stroke-width="${stroke}" stroke-dasharray="${len} ${circ - len}"
              stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
  }
  return arcs;
}

// Нижняя навигация (без emoji — librsvg не рендерит цветные emoji надёжно).
function navbar(width, top, height) {
  const items = ['Главная', 'Операции', 'Кошельки', 'Статистика', 'Ещё'];
  const step = width / items.length;
  let out = `<rect x="0" y="${top}" width="${width}" height="${height}" fill="${C.surface}"/>
    <rect x="0" y="${top}" width="${width}" height="2" fill="${C.surface2}"/>`;
  items.forEach((label, i) => {
    const cx = step * i + step / 2;
    const active = i === 0;
    const col = active ? C.accent : C.muted;
    out += `
      <circle cx="${cx}" cy="${top + height * 0.34}" r="7" fill="${col}"/>
      <text x="${cx}" y="${top + height * 0.72}" font-family="${FONT}" font-size="20"
            text-anchor="middle" fill="${col}" font-weight="${active ? 600 : 400}">${esc(label)}</text>`;
  });
  return out;
}

// --- Mobile 1080×1920 -------------------------------------------------------
function mobileSvg() {
  const W = 1080;
  const H = 1920;
  const pad = 60;
  const cw = W - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>

  <text x="${pad}" y="140" font-family="${FONT}" font-size="66" font-weight="700" fill="${C.text}">FreeMoney</text>
  <text x="${pad}" y="196" font-family="${FONT}" font-size="34" fill="${C.muted}">Общий капитал</text>

  <!-- Карточка баланса -->
  <rect x="${pad}" y="240" width="${cw}" height="300" rx="24" fill="${C.surface}"/>
  <text x="${pad + 40}" y="380" font-family="${FONT}" font-size="90" font-weight="700" fill="${C.text}">248 500 ₽</text>
  ${chip(pad + 40, 430, 300, 74, 'rgba(52,211,153,0.15)', C.income, '↑ 62 000 ₽', 34)}
  ${chip(pad + 360, 430, 300, 74, 'rgba(248,113,113,0.15)', C.expense, '↓ 43 200 ₽', 34)}

  <!-- Кошельки -->
  ${chip(pad, 590, 440, 96, C.surface2, C.text, 'Карта · 236 500 ₽', 34)}
  ${chip(pad + 470, 590, 350, 96, C.surface2, C.text, 'Наличные · 12 000 ₽', 32)}

  <!-- Действия -->
  <rect x="${pad}" y="730" width="${(cw - 30) / 2}" height="110" rx="22" fill="none" stroke="${C.expense}" stroke-width="3"/>
  <text x="${pad + (cw - 30) / 4}" y="800" font-family="${FONT}" font-size="42" font-weight="600" text-anchor="middle" fill="${C.expense}">− Расход</text>
  <rect x="${pad + (cw - 30) / 2 + 30}" y="730" width="${(cw - 30) / 2}" height="110" rx="22" fill="${C.income}"/>
  <text x="${pad + (cw - 30) * 0.75 + 30}" y="800" font-family="${FONT}" font-size="42" font-weight="600" text-anchor="middle" fill="${C.bg}">+ Доход</text>

  <!-- Расходы за месяц -->
  <text x="${pad}" y="960" font-family="${FONT}" font-size="40" font-weight="600" fill="${C.text}">Расходы за месяц (RUB)</text>
  ${donut(pad + 190, 1200, 150)}
  <text x="${pad + 190}" y="1188" font-family="${FONT}" font-size="30" text-anchor="middle" fill="${C.muted}">Расход</text>
  <text x="${pad + 190}" y="1232" font-family="${FONT}" font-size="44" font-weight="700" text-anchor="middle" fill="${C.text}">43 200 ₽</text>

  ${[
    ['Продукты', '18 400 ₽', '#60a5fa'],
    ['Транспорт', '13 300 ₽', '#f472b6'],
    ['Кафе', '11 500 ₽', '#fbbf24'],
  ]
    .map(([name, val, col], i) => {
      const y = 1120 + i * 70;
      const lx = pad + 470;
      return `<circle cx="${lx}" cy="${y - 12}" r="14" fill="${col}"/>
        <text x="${lx + 34}" y="${y}" font-family="${FONT}" font-size="36" fill="${C.text}">${esc(name)}</text>
        <text x="${W - pad}" y="${y}" font-family="${FONT}" font-size="36" text-anchor="end" fill="${C.muted}">${esc(val)}</text>`;
    })
    .join('')}

  ${navbar(W, H - 160, 160)}
</svg>`;
}

// --- Wide 1600×900 (desktop) ------------------------------------------------
function wideSvg() {
  const W = 1600;
  const H = 900;
  const colGap = 48;
  const left = 80;
  const colW = (W - left * 2 - colGap) / 2;
  const rightX = left + colW + colGap;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>

  <text x="${left}" y="96" font-family="${FONT}" font-size="52" font-weight="700" fill="${C.text}">FreeMoney</text>
  <text x="${left}" y="140" font-family="${FONT}" font-size="26" fill="${C.muted}">Учёт доходов и расходов — данные в ваших Google Таблицах</text>

  <!-- Левая колонка: баланс + кошельки + действия -->
  <rect x="${left}" y="180" width="${colW}" height="240" rx="22" fill="${C.surface}"/>
  <text x="${left + 36}" y="248" font-family="${FONT}" font-size="30" fill="${C.muted}">Общий капитал</text>
  <text x="${left + 36}" y="332" font-family="${FONT}" font-size="72" font-weight="700" fill="${C.text}">248 500 ₽</text>
  ${chip(left + 36, 360, 250, 60, 'rgba(52,211,153,0.15)', C.income, '↑ 62 000 ₽', 28)}
  ${chip(left + 300, 360, 250, 60, 'rgba(248,113,113,0.15)', C.expense, '↓ 43 200 ₽', 28)}

  ${chip(left, 452, 320, 78, C.surface2, C.text, 'Карта · 236 500 ₽', 28)}
  ${chip(left + 344, 452, 300, 78, C.surface2, C.text, 'Наличные · 12 000 ₽', 26)}

  <rect x="${left}" y="562" width="${(colW - 24) / 2}" height="92" rx="18" fill="none" stroke="${C.expense}" stroke-width="3"/>
  <text x="${left + (colW - 24) / 4}" y="618" font-family="${FONT}" font-size="34" font-weight="600" text-anchor="middle" fill="${C.expense}">− Расход</text>
  <rect x="${left + (colW - 24) / 2 + 24}" y="562" width="${(colW - 24) / 2}" height="92" rx="18" fill="${C.income}"/>
  <text x="${left + (colW - 24) * 0.75 + 24}" y="618" font-family="${FONT}" font-size="34" font-weight="600" text-anchor="middle" fill="${C.bg}">+ Доход</text>

  <!-- Правая колонка: расходы за месяц -->
  <rect x="${rightX}" y="180" width="${colW}" height="474" rx="22" fill="${C.surface}"/>
  <text x="${rightX + 36}" y="240" font-family="${FONT}" font-size="32" font-weight="600" fill="${C.text}">Расходы за месяц (RUB)</text>
  ${donut(rightX + 190, 430, 130)}
  <text x="${rightX + 190}" y="420" font-family="${FONT}" font-size="26" text-anchor="middle" fill="${C.muted}">Расход</text>
  <text x="${rightX + 190}" y="462" font-family="${FONT}" font-size="40" font-weight="700" text-anchor="middle" fill="${C.text}">43 200 ₽</text>
  ${[
    ['Продукты', '18 400 ₽', '#60a5fa'],
    ['Транспорт', '13 300 ₽', '#f472b6'],
    ['Кафе', '11 500 ₽', '#fbbf24'],
  ]
    .map(([name, val, col], i) => {
      const y = 360 + i * 64;
      const lx = rightX + 330;
      return `<circle cx="${lx}" cy="${y - 10}" r="12" fill="${col}"/>
        <text x="${lx + 28}" y="${y}" font-family="${FONT}" font-size="27" fill="${C.text}">${esc(name)}</text>
        <text x="${rightX + colW - 32}" y="${y}" font-family="${FONT}" font-size="27" text-anchor="end" fill="${C.muted}">${esc(val)}</text>`;
    })
    .join('')}

  ${navbar(W, H - 120, 120)}
</svg>`;
}

const targets = [
  { name: 'screenshot-mobile.png', svg: mobileSvg() },
  { name: 'screenshot-wide.png', svg: wideSvg() },
];

for (const t of targets) {
  const out = join(root, 'public', t.name);
  await sharp(Buffer.from(t.svg)).png().toFile(out);
  console.log(`✓ ${out}`);
}
