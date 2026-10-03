// Раскладка кольца категорий главного экрана (см. components/CategoryRing.jsx).
//
// Кольцо фиксированного размера — его радиус всегда одна и та же доля ширины
// (R_FRAC), чтобы на любом экране оно выглядело одинаково; уменьшается, только
// если по высоте физически не помещается. Проценты — на самих сегментах (если
// влезают); подписи (иконка + название) — рядами у верхнего и нижнего края
// карточки, до 5 в ряду.
//
// Расстановка предсказуемая (без перебора поворотов): крупнейшая категория —
// справа (по центру у «3 часов»), вторая — напротив, слева; остальные делятся
// между нижней и верхней дугой поровну (и по числу, и по сумме — тогда вторая
// встаёт ровно слева), внутри дуги — по убыванию от крупных. Подписи нижней
// дуги — в нижнем ряду, верхней — в верхнем; ряды для подписей двух крупнейших
// выбираются так, чтобы ряды были поровну, а линии не пересекались.
// Выносные линии ломаные (до двух изломов, см. leader).

// Кольцо на главной: не больше RING_NAMED отдельных категорий (по числу цветов
// палитры) + «Другое». Категории раскладываются по убыванию, пока есть место и
// пока остаток больше RING_REST_SHARE; хвост из 1% и меньше дальше не делим.
const RING_NAMED = 8;
const RING_REST_SHARE = 0.01;

// [[name, value]] по убыванию → сколько категорий показать отдельно.
export function ringNamedCount(sorted, total) {
  let rest = total;
  for (let i = 0; i < sorted.length; i++) {
    if (i === RING_NAMED) return i; // мест (цветов) больше нет — остальное «Другое»
    if (sorted.length - i === 1) return sorted.length; // последняя — сама, не «Другое»
    if (rest <= total * RING_REST_SHARE) return i;
    rest -= sorted[i][1];
  }
  return sorted.length;
}

export const R_FRAC = 0.34; // радиус кольца — доля ширины (диаметр ≈ 68%)
const MAX_SHRINK = 0.25; // на сколько кольцо может уменьшиться ради названий (невысокие экраны)
export const INNER = 0.6; // внутренний радиус — доля внешнего (толщина под проценты)
const PAD_ANGLE = 0.02; // зазор между сегментами, рад
export const PER_ROW = 5;
export const NAME_LINE_H = 13; // высота строки названия в подписи
const STUB = 16; // радиальный отрезок линии от кольца (1-й излом)
const TAIL = 10; // прямой (вертикальный) вход линии в подпись (2-й излом)
const STRAIGHT = 12; // излом меньше этого угла, град, не делаем
const LEADER = 34; // минимальный зазор между рядом подписей и кольцом (под линию)
const CROSS_COST = 120; // штраф за пересечение двух выносных линий
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

// Расставить подписи ряда по x (порядок задан): ближе к желаемым, но не
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

// Ломаная линия к подписи с точкой крепления (lx, ly) — до двух изломов:
// от кольца строго по радиусу (STUB), затем к «хвосту» и прямо в подпись
// (TAIL; [dx, dy] — направление от подписи к кольцу). Излом пропускается,
// если линия и так идёт почти прямо. Если путь зашёл бы на кольцо (подпись «с другой стороны»),
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

// Порядок сегментов по часовой: [крупнейшая, ...нижняя дуга, вторая,
// ...верхняя дуга]. Остальные делятся между дугами поровну по числу и как можно
// ровнее по сумме (тогда вторая встаёт ровно напротив первой); внутри дуги —
// по убыванию (крупные ближе к крупнейшей / ко второй).
function arrange(list) {
  if (list.length < 3) return { order: list, down: [], up: [] };
  const [first, second, ...rest] = list;
  const cap = Math.ceil(rest.length / 2);
  const down = [];
  const up = [];
  let downSum = 0;
  let upSum = 0;
  for (const d of rest) {
    const toDown = up.length >= cap || (down.length < cap && downSum <= upSum);
    if (toDown) { down.push(d); downSum += d.value; } else { up.push(d); upSum += d.value; }
  }
  return { order: [first, ...down, second, ...up], down, up };
}

// Сегменты по часовой от угла start.
function slicesAt(data, total, start) {
  const pad = data.length > 1 ? PAD_ANGLE : 0;
  let a = start;
  return data.map((d) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const a0 = a + pad / 2;
    const a1 = Math.max(a0 + 0.004, a + sweep - pad / 2);
    a += sweep;
    return { ...d, percent: d.value / total, a0, a1, mid: (a0 + a1) / 2 };
  });
}

// Подписи рядов: каждый ряд слева направо по желаемому x (под своим сегментом),
// затем ломаные линии; стоимость — изломы, длина, обходы кольца, пересечения.
function placeRows(topItems, bottomItems, g) {
  let cost = 0;
  const labels = [];
  for (const [items, top] of [[topItems, true], [bottomItems, false]]) {
    const placed = items
      .map((s) => ({ s, top, y: top ? g.topY : g.botY, x: polar(g.cx, g.cy, g.R, s.mid)[0] }))
      .sort((a, b) => a.x - b.x);
    spread(placed, g.slot, g.slot / 2, g.w - g.slot / 2);
    for (const p of placed) {
      const dir = top ? [0, 1] : [0, -1];
      p.a = leader(p.s, p.x, p.y + dir[1] * (g.labelH / 2 + 3), g, dir);
      cost += 0.3 * p.a.bend + 0.02 * p.a.len + DETOUR_COST * p.a.detour;
    }
    labels.push(...placed);
  }
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
// влезает в одну строку слота; см. CategoryRing). palette — цвета по месту на
// кольце: по часовой стрелке в порядке палитры (её порядок подобран так, что
// соседние — и последний с первым — хорошо различимы), «Другое» (other) —
// otherColor.
export function layoutRing(data, w, h, { nameLines = 1, palette = ['#888'], otherColor = '#64748b' } = {}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total || w < 100 || h < 80) return null;

  const fixedR = w * R_FRAC;
  const modes = MODES.flatMap((m) => {
    if (!m.name) return [m];
    const one = { ...m, nameLines: 1 };
    return nameLines > 1 ? [{ ...m, h: m.h + NAME_LINE_H * (nameLines - 1), nameLines }, one] : [one];
  });
  const radiusFor = (m) => Math.min(fixedR, (h - 2 * (m.h + LEADER)) / 2);
  // Первая подпись, при которой кольцо остаётся своего размера (допускаем
  // уменьшение на MAX_SHRINK, чтобы не терять названия на невысоких экранах);
  // иначе — самая компактная, а кольцо меньше (только на совсем низких экранах).
  const mode = modes.find((m) => radiusFor(m) >= fixedR * (1 - MAX_SHRINK)) || modes[modes.length - 1];
  const R = Math.max(30, radiusFor(mode));
  const g = {
    w, cx: w / 2, cy: h / 2, R, mode,
    r0: R * INNER,
    labelH: mode.h,
    slot: w / PER_ROW,
    // ряды — у верхнего и нижнего края (как можно дальше от кольца)
    topY: mode.h / 2 + EDGE,
    botY: h - mode.h / 2 - EDGE,
  };

  const { order, down, up } = arrange(data);
  // крупнейшая — по центру справа (угол 0)
  let k = 0;
  const slices = slicesAt(order, total, -(data[0].value / total) * Math.PI).map((sl) => ({
    ...sl,
    color: sl.other ? otherColor : palette[k++ % palette.length],
  }));
  const byName = new Map(slices.map((s) => [s.name, s]));
  const downS = down.map((d) => byName.get(d.name));
  const upS = up.map((d) => byName.get(d.name));
  const big = slices.filter((s) => s.name === data[0].name || (data[1] && s.name === data[1].name));

  // Подписи двух крупнейших — в тот ряд, где лучше (ряды поровну, ≤ PER_ROW).
  let best = null;
  for (let mask = 0; mask < 1 << big.length; mask++) {
    const top = [...upS, ...big.filter((_, i) => mask & (1 << i))];
    const bottom = [...downS, ...big.filter((_, i) => !(mask & (1 << i)))];
    if (top.length > PER_ROW || bottom.length > PER_ROW) continue;
    const v = placeRows(top, bottom, g);
    const cost = v.cost + 15 * Math.abs(top.length - bottom.length);
    if (!best || cost < best.cost - 1e-6) best = { ...v, cost };
  }
  return { ...g, slices, labels: best.labels };
}
