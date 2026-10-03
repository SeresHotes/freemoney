// Раскладка кольца категорий главного экрана (см. components/CategoryRing.jsx).
//
// Кольцо фиксированного размера — его радиус всегда одна и та же доля ширины
// (R_FRAC), чтобы на любом экране оно выглядело одинаково; уменьшается, только
// если по высоте физически не помещается. Проценты — на самих сегментах (если
// влезают); подписи (иконка + название) — рядами у верхнего и нижнего края
// карточки (до 5 в ряду) и, если рядом с кольцом есть место, колонками по бокам.
//
// Сегменты — по убыванию по часовой стрелке, если так подписи раскладываются
// хорошо; иначе — перестановка, где мелкие не сбиваются в кучу (см. orders).
// Выносные линии ломаные (до двух изломов, см. leader). Порядок, поворот
// кольца и то, какие подряд идущие категории уходят в верхний ряд, подбираются
// перебором:
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
const MAX_SHRINK = 0.25; // на сколько кольцо может уменьшиться ради названий (невысокие экраны)
export const INNER = 0.6; // внутренний радиус — доля внешнего (толщина под проценты)
const PAD_ANGLE = 0.02; // зазор между сегментами, рад
const ROTATIONS = 48; // перебор поворотов с шагом 7.5°
export const PER_ROW = 5;
export const NAME_LINE_H = 13; // высота строки названия в подписи
const STUB = 16; // радиальный отрезок линии от кольца (1-й излом)
const TAIL = 10; // вертикальный вход линии в подпись (2-й излом)
const STRAIGHT = 12; // излом меньше этого угла, град, не делаем
const LEADER = 34; // минимальный зазор между рядом подписей и кольцом (под линию)
const CROSS_COST = 120; // штраф за пересечение двух выносных линий
const SIDE_GAP = 8; // зазор между хвостом линии и боковой подписью
const MIN_COL_W = 48; // уже — боковые колонки не используем
const MAX_SIDE = 2; // подписей в боковой колонке, не больше
const SIDE_COST = 8; // небольшой «штраф» за подпись сбоку (там уже)
const EDGE = 2; // отступ рядов от края
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

// Расставить подписи ряда/колонки по координате key (порядок задан): ближе к
// желаемым, но не ближе step друг к другу и в пределах [lo, hi].
function spread(items, step, lo, hi, key = 'x') {
  for (let i = 0; i < items.length; i++) {
    const min = i === 0 ? lo : items[i - 1][key] + step;
    if (items[i][key] < min) items[i][key] = min;
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const max = i === items.length - 1 ? hi : items[i + 1][key] - step;
    if (items[i][key] > max) items[i][key] = max;
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

// Ломаная линия к подписи с точкой крепления (lx, ly) — до двух изломов:
// от кольца строго по радиусу (STUB), затем к «хвосту» и прямо в подпись
// (TAIL; [dx, dy] — направление от подписи к кольцу: снизу/сверху/сбоку). Излом пропускается, если линия и так идёт
// почти прямо. Если путь зашёл бы на кольцо (подпись «с другой стороны»),
// линия огибает кольцо снаружи по дуге. points — вершины; detour — точки
// обхода; bend — отклонение направления к подписи от радиуса, град.
function leader(s, lx, ly, g, [dx, dy]) {
  const want = near(Math.atan2(ly - g.cy, lx - g.cx), s.mid);
  const m = Math.min(0.03, (s.a1 - s.a0) / 3);
  const t = Math.min(s.a1 - m, Math.max(s.a0 + m, want));
  const [ax, ay] = polar(g.cx, g.cy, g.R, t);
  const [bx, by] = polar(g.cx, g.cy, g.R + STUB, t);
  const tail = [lx + dx * TAIL, ly + dy * TAIL];
  const angleTo = (x0, y0, x1, y1, ux, uy) => {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    return Math.acos(Math.max(-1, Math.min(1, ((x1 - x0) * ux + (y1 - y0) * uy) / len))) / DEG;
  };
  const bend = angleTo(ax, ay, tail[0], tail[1], Math.cos(t), Math.sin(t));
  // 1-й излом не нужен, если к хвосту и так почти по радиусу
  const points = bend < STRAIGHT ? [[ax, ay]] : [[ax, ay], [bx, by]];
  const [fx, fy] = points[points.length - 1];
  const hits = (x, y) => distToSegment(g.cx, g.cy, x, y, tail[0], tail[1]) < g.R + 2;
  let detour = 0;
  if (points.length > 1 && hits(fx, fy)) {
    // Обход по дуге радиуса rw в сторону подписи (кратчайшим путём). Шаг —
    // такой, чтобы хорда между соседними точками не срезала край кольца.
    const rw = g.R + STUB + 6;
    const step = 2 * Math.acos((g.R + 2) / rw) * 0.9 * Math.sign(want - t || 1);
    let a = t;
    points.push(polar(g.cx, g.cy, rw, a));
    for (let i = 0; i < 24 && hits(...points[points.length - 1]); i++) {
      a += step;
      points.push(polar(g.cx, g.cy, rw, a));
      detour++;
    }
  }
  // 2-й излом (прямой вход в подпись) не нужен, если линия и так почти прямо
  // входит в неё
  const [px, py] = points[points.length - 1];
  if (angleTo(px, py, lx, ly, -dx, -dy) >= STRAIGHT) points.push(tail);
  points.push([lx, ly]);
  return { points, stub: bend >= STRAIGHT, len: Math.hypot(lx - ax, ly - ay), bend, detour };
}

// Порядки сегментов, из которых выбирается лучший для раскладки: по убыванию
// (предпочтительный — «штраф» 0) и перестановки, где мелкие сегменты не
// сбиваются в кучу за крупными — тогда каждая подпись встаёт рядом со своим
// сегментом. [порядок, штраф].
function orders(list) {
  if (list.length < 4) return [[list, 0]];
  // вперемешку: крупный, мелкий, крупный, мелкий…
  const mixed = [];
  for (let i = 0, j = list.length - 1; i <= j; i++, j--) {
    mixed.push(list[i]);
    if (i !== j) mixed.push(list[j]);
  }
  // по бокам: две крупнейшие напротив друг друга, остальные поровну между ними
  const [a, b, ...rest] = list;
  const sides = [a, ...rest.filter((_, i) => i % 2 === 0), b, ...rest.filter((_, i) => i % 2 === 1)];
  // горкой: крупнейшая в середине, следующие по очереди по бокам
  const left = [];
  const right = [];
  list.forEach((d, i) => (i % 2 ? left : right).push(d));
  const mountain = [...left.reverse(), ...right];
  return [[list, 0], [mixed, 25], [sides, 25], [mountain, 25]];
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

// Подписи для разреза cut: сегменты по часовой начиная с cut раскладываются по
// сторонам в порядке обхода — верхний ряд (слева направо), правая колонка
// (сверху вниз), нижний ряд (справа налево), левая колонка (снизу вверх).
// counts — сколько подписей на каждую сторону.
// bound — стоимость лучшего уже найденного варианта: если этот хуже ещё до
// подсчёта пересечений, их не считаем (ускоряет перебор в разы).
function placeLabels(slices, cut, counts, g, bound = Infinity) {
  const n = slices.length;
  const seq = Array.from({ length: n }, (_, i) => slices[(cut + i) % n]);
  const take = (() => {
    let i = 0;
    return (k) => seq.slice(i, (i += k));
  })();
  const sides = [
    { kind: 'top', items: take(counts.top) },
    { kind: 'right', items: take(counts.right) },
    { kind: 'bottom', items: take(counts.bottom).reverse() },
    { kind: 'left', items: take(counts.left).reverse() },
  ];
  let cost = 0;
  const labels = [];
  for (const { kind, items } of sides) {
    if (!items.length) continue;
    const row = kind === 'top' || kind === 'bottom';
    const placed = items.map((s) => {
      const [ax, ay] = polar(g.cx, g.cy, g.R, s.mid);
      if (row) return { s, kind, top: kind === 'top', x: ax, y: kind === 'top' ? g.topY : g.botY };
      return { s, kind, top: null, x: kind === 'left' ? g.colW / 2 : g.w - g.colW / 2, y: ay };
    });
    if (row) spread(placed, g.slot, g.slot / 2, g.w - g.slot / 2);
    else spread(placed, g.labelH + 4, g.colTop + g.labelH / 2, g.colBot - g.labelH / 2, 'y');
    for (const p of placed) {
      // точка крепления — край подписи со стороны кольца; dir — к кольцу
      const dir = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] }[kind];
      const lx = row ? p.x : p.x + dir[0] * (g.colW / 2 + 2);
      const ly = row ? p.y + dir[1] * (g.labelH / 2 + 3) : p.y;
      p.a = leader(p.s, lx, ly, g, dir);
      cost += 0.3 * p.a.bend + 0.02 * p.a.len + DETOUR_COST * p.a.detour + (row ? 0 : SIDE_COST);
    }
    labels.push(...placed);
  }
  if (cost >= bound) return { labels, cost };
  // перекрещённые линии читаются плохо (сравниваем все отрезки, кроме
  // радиального у кольца — там линии и так расходятся)
  const segs = labels.map((l) => {
    const pts = l.a.stub ? l.a.points.slice(1) : l.a.points;
    return pts.slice(1).map((pt, i) => [pts[i], pt]);
  });
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (segs[i].some(([p1, p2]) => segs[j].some(([q1, q2]) => crosses(...p1, ...p2, ...q1, ...q2)))) cost += CROSS_COST;
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
  // Ряды — у верхнего и нижнего края (как можно дальше от кольца); колонки по
  // бокам — если рядом с кольцом есть место, между рядами.
  const topY = mode.h / 2 + EDGE;
  const botY = h - mode.h / 2 - EDGE;
  const colW = cx - R - STUB - SIDE_GAP;
  const colTop = topY + mode.h / 2 + 6;
  const colBot = botY - mode.h / 2 - 6;
  const maxSide = colW >= MIN_COL_W ? Math.max(0, Math.min(MAX_SIDE, Math.floor((colBot - colTop + 4) / (mode.h + 4)))) : 0;
  const g = {
    w, cx, cy, R, mode,
    r0: R * INNER,
    labelH: mode.h,
    slot: w / PER_ROW,
    topY, botY, colW, colTop, colBot,
  };

  // Подписи в рядах — поровну (перекос на одну — почти бесплатно; больший —
  // только если иначе линиям пришлось бы обходить кольцо). Колонки — по 0..maxSide.
  const combos = [];
  for (let left = 0; left <= maxSide; left++) {
    for (let right = 0; right <= maxSide; right++) {
      const rowsN = n - left - right;
      if (rowsN < 0) continue;
      for (let top = Math.max(0, rowsN - PER_ROW); top <= Math.min(PER_ROW, rowsN); top++) {
        const d = Math.abs(top - rowsN / 2);
        const splitCost = 15 * Math.min(d, 1) + 300 * Math.max(0, d - 1);
        combos.push([{ top, right, bottom: rowsN - top, left }, splitCost]);
      }
    }
  }

  let best = null;
  for (const [order, orderCost] of orders(data)) {
    for (let i = 0; i < ROTATIONS; i++) {
      const rot = (i / ROTATIONS) * Math.PI * 2;
      const slices = slicesAt(order, total, -Math.PI / 2 + rot);
      // при равенстве — первый сегмент начинается сверху (как в обычной диаграмме)
      const rotCost = 0.2 * Math.abs(near(rot, 0)) / DEG;
      for (const [counts, splitCost] of combos) {
        for (let cut = 0; cut < n; cut++) {
          const extra = orderCost + rotCost + splitCost;
          const v = placeLabels(slices, cut, counts, g, best ? best.cost - extra : Infinity);
          const cost = v.cost + extra;
          if (!best || cost < best.cost - 1e-6) best = { ...v, cost, slices };
        }
      }
    }
  }
  return { ...g, slices: best.slices, labels: best.labels };
}
