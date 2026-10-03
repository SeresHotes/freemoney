// Раскладка кольца категорий главного экрана (см. components/CategoryRing.jsx).
//
// Кольцо фиксированного размера — его радиус всегда одна и та же доля ширины
// (R_FRAC), чтобы на любом экране оно выглядело одинаково; уменьшается, только
// если по высоте физически не помещается. Проценты — на самих сегментах (если
// влезают); подписи (иконка + название) — рядами сверху и снизу, до 5 в ряду.
//
// Сегменты идут строго по убыванию по часовой стрелке («Другое» — последним).
// Выносные линии ломаные: короткий отрезок строго по радиусу (линия всегда
// выходит из кольца под прямым углом), затем — к подписи. Поворот кольца и то,
// какие подряд идущие категории уходят в верхний ряд, подбираются перебором:
// линии не должны пересекаться и обходить кольцо (это крайний случай — если
// подписи иначе не разложить), подписи — делиться между рядами поровну; при
// равенстве крупнейшая категория начинается сверху.

// Кольцо на главной: не больше RING_SLOTS подписей (по 5 сверху и снизу).
// Категории раскладываются по убыванию, пока есть место и пока остаток больше
// RING_REST_SHARE; хвост из 1% и меньше дальше не делим — это «Другое».
const RING_SLOTS = 10;
const RING_REST_SHARE = 0.01;

// [[name, value]] по убыванию → сколько категорий показать отдельно.
export function ringNamedCount(sorted, total) {
  let rest = total;
  for (let i = 0; i < sorted.length; i++) {
    const left = sorted.length - i; // ещё не разложено (вместе с текущей)
    if (left === 1) return sorted.length; // последняя — сама, не «Другое»
    if (i === RING_SLOTS - 1 || rest <= total * RING_REST_SHARE) return i;
    rest -= sorted[i][1];
  }
  return sorted.length;
}

export const R_FRAC = 0.34; // радиус кольца — доля ширины (диаметр ≈ 68%)
const MAX_SHRINK = 0.15; // на сколько кольцо может уменьшиться ради названий
export const INNER = 0.6; // внутренний радиус — доля внешнего (толщина под проценты)
const PAD_ANGLE = 0.02; // зазор между сегментами, рад
const ROTATIONS = 72; // перебор поворотов с шагом 5°
export const PER_ROW = 5;
export const NAME_LINE_H = 13; // высота строки названия в подписи
const STUB = 9; // радиальный отрезок линии от кольца
const LEADER = 24; // зазор между рядом подписей и кольцом (под линию)
const CROSS_COST = 120; // штраф за пересечение двух выносных линий
const DETOUR_COST = 150; // за каждую точку обхода кольца (обход — крайний случай)
// Подпись: иконка и название (1–2 строки); если по высоте тесно — без названия.
const MODES = [
  { h: 46, icon: 26, name: true },
  { h: 30, icon: 24, name: false },
];

const DEG = Math.PI / 180;
const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];

// Сегмент кольца от угла a0 до a1 (рад, по часовой, 0 — направо).
export function arcPath(cx, cy, r0, r1, a0, a1) {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    // Полное кольцо — двумя половинами (одна дуга в 360° не рисуется).
    const m = a0 + Math.PI;
    return `${arcPath(cx, cy, r0, r1, a0, m)} ${arcPath(cx, cy, r0, r1, m, a0 + Math.PI * 2)}`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1);
  const [x3, y3] = polar(cx, cy, r0, a0);
  return `M${x0},${y0}A${r1},${r1} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 ${large} 0 ${x3},${y3}Z`;
}

// Расставить подписи ряда по x (порядок задан): ближе к желаемым x, но не
// ближе step друг к другу и в пределах [lo, hi].
function spread(items, step, lo, hi) {
  for (let i = 0; i < items.length; i++) {
    const min = i === 0 ? lo : items[i - 1].x + step;
    if (items[i].x < min) items[i].x = min;
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const max = i === items.length - 1 ? hi : items[i + 1].x - step;
    if (items[i].x > max) items[i].x = max;
  }
}

// Угол a, приведённый к окрестности ref (±π).
function near(a, ref) {
  let t = a;
  while (t < ref - Math.PI) t += Math.PI * 2;
  while (t > ref + Math.PI) t -= Math.PI * 2;
  return t;
}

export const fmtPercent = (p) => (p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);

// Расстояние от точки (px, py) до отрезка (x1, y1)–(x2, y2).
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Пересекаются ли отрезки p1–p2 и p3–p4 (строго, без общих концов).
function crosses(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d1 = (x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3);
  const d2 = (x4 - x3) * (y2 - y3) - (y4 - y3) * (x2 - x3);
  const d3 = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  const d4 = (x2 - x1) * (y4 - y1) - (y2 - y1) * (x4 - x1);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// Ломаная линия к подписи с точкой крепления (lx, ly): точка на сегменте,
// ближайшая по направлению к подписи, → радиальный отрезок наружу → подпись.
// Если прямой путь к подписи зашёл бы на кольцо (подпись «с другой стороны»),
// линия огибает кольцо снаружи по точкам на радиусе R + STUB. points — вершины
// ломаной; detour — сколько точек обхода понадобилось; bend — излом, град.
function leader(s, lx, ly, g) {
  const want = near(Math.atan2(ly - g.cy, lx - g.cx), s.mid);
  const m = Math.min(0.03, (s.a1 - s.a0) / 3);
  const t = Math.min(s.a1 - m, Math.max(s.a0 + m, want));
  const [ax, ay] = polar(g.cx, g.cy, g.R, t);
  const [sx, sy] = polar(g.cx, g.cy, g.R + STUB, t);
  const points = [[ax, ay], [sx, sy]];
  const hits = (x, y) => distToSegment(g.cx, g.cy, x, y, lx, ly) < g.R + 2;
  let detour = 0;
  if (hits(sx, sy)) {
    // Обход по дуге радиуса rw в сторону подписи (кратчайшим путём). Шаг —
    // такой, чтобы хорда между соседними точками не срезала край кольца.
    const rw = g.R + STUB + 8;
    const step = 2 * Math.acos((g.R + 2) / rw) * 0.9 * Math.sign(want - t || 1);
    let a = t;
    points.push(polar(g.cx, g.cy, rw, a));
    for (let i = 0; i < 24 && hits(...points[points.length - 1]); i++) {
      a += step;
      points.push(polar(g.cx, g.cy, rw, a));
      detour++;
    }
  }
  const [px, py] = points[points.length - 1];
  points.push([lx, ly]);
  const len = Math.hypot(lx - sx, ly - sy) || 1;
  const cos = ((lx - sx) * Math.cos(t) + (ly - sy) * Math.sin(t)) / len;
  const bend = Math.acos(Math.max(-1, Math.min(1, cos))) / DEG;
  return { points, px, py, len, bend, detour };
}

// Сегменты при повороте rot: по часовой от угла rot.
function slicesAt(data, total, rot) {
  const pad = data.length > 1 ? PAD_ANGLE : 0;
  let a = rot;
  return data.map((d) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const a0 = a + pad / 2;
    const a1 = Math.max(a0 + 0.004, a + sweep - pad / 2);
    a += sweep;
    return { ...d, percent: d.value / total, a0, a1, mid: (a0 + a1) / 2 };
  });
}

// Подписи для разреза cut: сегменты по часовой начиная с cut — первые nTop в
// верхний ряд (слева направо), остальные в нижний (справа налево).
function placeLabels(slices, cut, nTop, g) {
  const n = slices.length;
  const seq = Array.from({ length: n }, (_, i) => slices[(cut + i) % n]);
  const rows = [
    { items: seq.slice(0, nTop), y: g.topY, top: true },
    { items: seq.slice(nTop).reverse(), y: g.botY, top: false },
  ];
  let cost = 0;
  const labels = [];
  for (const row of rows) {
    const placed = row.items.map((s) => ({ s, top: row.top, y: row.y, x: polar(g.cx, g.cy, g.R, s.mid)[0] }));
    spread(placed, g.slot, g.slot / 2, g.w - g.slot / 2);
    for (const p of placed) {
      p.ay = p.top ? p.y + g.labelH / 2 + 3 : p.y - g.labelH / 2 - 3;
      p.a = leader(p.s, p.x, p.ay, g);
      cost += 0.3 * p.a.bend + 0.02 * p.a.len + DETOUR_COST * p.a.detour;
    }
    labels.push(...placed);
  }
  for (let i = 0; i < labels.length; i++) {
    const p = labels[i].a;
    for (let j = i + 1; j < labels.length; j++) {
      const q = labels[j].a;
      if (crosses(p.px, p.py, labels[i].x, labels[i].ay, q.px, q.py, labels[j].x, labels[j].ay)) cost += CROSS_COST;
    }
  }
  return { labels, cost };
}

// nameLines — сколько строк отвести под название (2 — если какое-то название не
// влезает в одну строку слота; см. CategoryRing).
export function layoutRing(data, w, h, { nameLines = 1 } = {}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total || w < 100 || h < 80) return null;

  const n = data.length;
  const fixedR = w * R_FRAC;
  const modes = MODES.flatMap((m) => {
    if (!m.name) return [m];
    const one = { ...m, nameLines: 1 };
    return nameLines > 1 ? [{ ...m, h: m.h + NAME_LINE_H * (nameLines - 1), nameLines }, one] : [one];
  });
  const radiusFor = (m) => Math.min(fixedR, (h - 2 * (m.h + LEADER)) / 2);
  // Первая подпись, при которой кольцо остаётся своего размера (допускаем
  // уменьшение на MAX_SHRINK, чтобы не терять названия из-за пары пикселей);
  // иначе — самая компактная, а кольцо меньше (только на совсем низких экранах).
  const mode = modes.find((m) => radiusFor(m) >= fixedR * (1 - MAX_SHRINK)) || modes[modes.length - 1];
  const R = Math.max(30, radiusFor(mode));
  const cx = w / 2;
  const cy = h / 2;
  const g = {
    w, cx, cy, R, mode,
    r0: R * INNER,
    labelH: mode.h,
    slot: w / PER_ROW,
    // ряды — вплотную к кольцу (лишняя высота остаётся снаружи)
    topY: cy - R - LEADER - mode.h / 2,
    botY: cy + R + LEADER + mode.h / 2,
  };

  // Подписи поровну между рядами (перекос на одну — почти бесплатно; больший —
  // только если иначе линиям пришлось бы обходить кольцо).
  const half = n / 2;
  const splits = [];
  for (let k = Math.max(0, n - PER_ROW); k <= Math.min(PER_ROW, n); k++) splits.push(k);
  const splitCost = (k) => {
    const d = Math.abs(k - half);
    return 15 * Math.min(d, 1) + 300 * Math.max(0, d - 1);
  };

  let best = null;
  for (let i = 0; i < ROTATIONS; i++) {
    const rot = (i / ROTATIONS) * Math.PI * 2;
    const slices = slicesAt(data, total, -Math.PI / 2 + rot);
    // при равенстве — крупнейшая начинается сверху (как в обычной диаграмме)
    const rotCost = 0.2 * Math.abs(near(rot, 0)) / DEG;
    for (const nTop of splits) {
      for (let cut = 0; cut < n; cut++) {
        const v = placeLabels(slices, cut, nTop, g);
        const cost = v.cost + rotCost + splitCost(nTop);
        if (!best || cost < best.cost - 1e-6) best = { ...v, cost, slices };
      }
    }
  }
  return { ...g, slices: best.slices, labels: best.labels };
}
