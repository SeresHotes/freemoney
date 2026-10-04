// Раскладка кольца категорий главного экрана (см. components/CategoryRing.jsx).
//
// Кольцо фиксированного размера — его радиус всегда одна и та же доля ширины
// (R_FRAC), чтобы на любом экране оно выглядело одинаково; уменьшается, только
// если по высоте физически не помещается. Проценты — на самих сегментах (если
// влезают); подписи (иконка + название) — рядами у верхнего и нижнего края
// карточки, до 5 в ряду.
//
// Расстановка — поиск, минимизирующий САМЫЙ БОЛЬШОЙ отрыв подписи от её
// сектора по кругу (насколько направление на подпись из центра уходит за дугу
// сектора: подпись справа у сектора слева — плохо): порядок сегментов по кругу
// (любой), поворот кольца и ряд каждой подписи. Старт — несколько порядков (по
// убыванию, вперемешку, по бокам, горкой) × все повороты, затем обмены пар
// сегментов, пока худший отрыв уменьшается. Вторично — средний отрыв, длина
// линий, пересечения и обходы кольца. Детерминированно.
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
const CROSS_COST = 15; // пересечение двух линий «стоит» как +15° к самому большому отрыву
const MEAN_WEIGHT = 0.3; // вес среднего отрыва (вторично к самому большому)
const LEN_WEIGHT = 0.01; // совсем немного — длина линий (при прочих равных — короче)
const SEED_ROTATIONS = 24; // повороты для стартовых порядков (шаг 15°)
const ROT_STEPS = [-10, 0, 10]; // подстройка поворота при обменах, град
const MAX_ITER = 25; // шагов улучшения обменами, не больше
const EDGE = 2; // отступ рядов от края
const DETOUR_COST = 60; // за каждую точку обхода кольца, ° (обход — крайний случай)
// Подпись: иконка и название (1–2 строки); если по высоте тесно — без названия,
// на совсем низких экранах — с иконкой поменьше.
const MODES = [
  { h: 66, icon: 46, name: true },
  { h: 48, icon: 44, name: false },
  { h: 30, icon: 26, name: false },
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

// Стартовые порядки сегментов для поиска (по часовой): по убыванию;
// «вперемешку» (крупная–мелкая); «по бокам» (две крупнейшие напротив, остальные
// поровну между ними); «горкой» (крупнейшая в середине, следующие по бокам).
function seedOrders(list) {
  if (list.length < 4) return [list];
  const mixed = [];
  for (let i = 0, j = list.length - 1; i <= j; i++, j--) {
    mixed.push(list[i]);
    if (i !== j) mixed.push(list[j]);
  }
  const [a, b, ...rest] = list;
  const sides = [a, ...rest.filter((_, i) => i % 2 === 0), b, ...rest.filter((_, i) => i % 2 === 1)];
  const left = [];
  const right = [];
  list.forEach((d, i) => (i % 2 ? left : right).push(d));
  return [list, mixed, sides, [...left.reverse(), ...right]];
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

// Насколько близко дуга сегмента подходит к верхнему / нижнему краю кольца
// (минимальный / максимальный sin на дуге).
function arcSinRange(s) {
  let lo = Math.min(Math.sin(s.a0), Math.sin(s.a1));
  let hi = Math.max(Math.sin(s.a0), Math.sin(s.a1));
  const has = (ang) => {
    const t = near(ang, (s.a0 + s.a1) / 2);
    return t >= s.a0 && t <= s.a1;
  };
  if (has(-Math.PI / 2)) lo = -1;
  if (has(Math.PI / 2)) hi = 1;
  return [lo, hi];
}

// Ряд для каждой подписи — тот, к которому её сегмент ближе (не больше PER_ROW
// в ряду: лишние переходят в другой ряд, начиная с тех, кому разница меньше).
function assignRows(slices) {
  const pref = slices.map((s) => {
    const [lo, hi] = arcSinRange(s);
    return { s, gain: 1 + lo - (1 - hi) }; // < 0 — ближе к верху
  });
  const top = pref.filter((p) => p.gain < 0);
  const bottom = pref.filter((p) => p.gain >= 0);
  const fix = (from, to, sign) => {
    from.sort((a, b) => sign * (a.gain - b.gain));
    while (from.length > PER_ROW) to.push(from.pop());
  };
  fix(top, bottom, -1);
  fix(bottom, top, 1);
  fix(top, bottom, -1);
  return [top.map((p) => p.s), bottom.map((p) => p.s)];
}

// Отрыв подписи от её сектора по кругу, град: направление на подпись из центра
// кольца против дуги сектора (0 — подпись прямо «напротив» сектора).
function arcGap(s, x, y, g) {
  const a = near(Math.atan2(y - g.cy, x - g.cx), (s.a0 + s.a1) / 2);
  return (a < s.a0 ? s.a0 - a : a > s.a1 ? a - s.a1 : 0) / DEG;
}

const polyLen = (pts) => pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

// Подписи рядов: каждый ряд слева направо по желаемому x (под своим сегментом),
// затем ломаные линии. Стоимость — САМЫЙ БОЛЬШОЙ отрыв подписи от её сектора
// по кругу (его и минимизируем), вторично — средний отрыв, чуть-чуть — длина
// линий, плюс штрафы за пересечения линий и обходы кольца.
function placeRows(topItems, bottomItems, g, bound = Infinity) {
  const labels = [];
  let detours = 0;
  for (const [items, top] of [[topItems, true], [bottomItems, false]]) {
    const placed = items
      .map((s) => ({ s, top, y: top ? g.topY : g.botY, x: polar(g.cx, g.cy, g.R, s.mid)[0] }))
      .sort((a, b) => a.x - b.x);
    spread(placed, g.slot, g.slot / 2, g.w - g.slot / 2);
    for (const p of placed) {
      const dir = top ? [0, 1] : [0, -1];
      p.a = leader(p.s, p.x, p.y + dir[1] * (g.labelH / 2 + 3), g, dir);
      p.len = polyLen(p.a.points);
      p.gap = arcGap(p.s, p.x, p.y, g);
      detours += p.a.detour;
    }
    labels.push(...placed);
  }
  const gaps = labels.map((l) => l.gap);
  const maxGap = Math.max(0, ...gaps);
  const m = labels.length || 1;
  const mean = gaps.reduce((a, b) => a + b, 0) / m;
  const meanLen = labels.reduce((a, l) => a + l.len, 0) / m;
  const base = maxGap + MEAN_WEIGHT * mean + LEN_WEIGHT * meanLen + DETOUR_COST * detours;
  // заведомо хуже лучшего — пересечения не считаем (ускоряет поиск в разы)
  if (base >= bound) return { labels, cost: base, maxGap };
  // пересечения (все отрезки, кроме радиального у кольца — там линии и так расходятся)
  const segs = labels.map((l) => {
    const pts = l.a.stub ? l.a.points.slice(1) : l.a.points;
    return pts.slice(1).map((pt, i) => [pts[i], pt]);
  });
  let crossings = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (segs[i].some(([p1, p2]) => segs[j].some(([q1, q2]) => crosses(...p1, ...p2, ...q1, ...q2)))) crossings++;
    }
  }
  return { labels, cost: base + CROSS_COST * crossings, maxGap };
}

// nameLines — сколько строк отвести под название (2 — если какое-то название не
// влезает в одну строку слота; см. CategoryRing). Цвет сегмента — собственный
// цвет категории (d.color); у кого его нет — по месту на кольце: по часовой
// стрелке в порядке palette (её порядок подобран так, что соседние — и
// последний с первым — хорошо различимы), «Другое» (other) — otherColor.
// Кэш раскладок: листание месяцев туда-обратно не пересчитывает поиск заново.
const cache = new Map();
const CACHE_SIZE = 40;

export function layoutRing(data, w, h, opts = {}) {
  const key = JSON.stringify([data.map((d) => [d.name, d.value, !!d.other, d.color || '']), Math.round(w), Math.round(h), opts.nameLines, opts.palette, opts.otherColor, opts.search]);
  if (cache.has(key)) return cache.get(key);
  const result = computeLayout(data, w, h, opts);
  cache.set(key, result);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return result;
}

function computeLayout(data, w, h, { nameLines = 1, palette = ['#888'], otherColor = '#64748b', search = true } = {}) {
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

  // Вариант = порядок сегментов + поворот (+ ряды подписей).
  const evaluate = (order, rot, rows, bound) => {
    const slices = slicesAt(order, total, rot);
    const [top, bottom] = rows ? rows(slices) : assignRows(slices);
    return { ...placeRows(top, bottom, g, bound), slices, order, rot };
  };
  const bestRot = (order, rots, bound = Infinity) => {
    let best = null;
    for (const rot of rots) {
      const v = evaluate(order, rot, null, best ? Math.min(best.cost, bound) : bound);
      if (!best || v.cost < best.cost - 1e-6) best = v;
    }
    return best;
  };
  const fullRots = Array.from({ length: SEED_ROTATIONS }, (_, i) => (i / SEED_ROTATIONS) * Math.PI * 2);
  const nearRots = (r) => ROT_STEPS.map((d) => r + d * DEG);

  // 1) стартовые порядки × все повороты; 2) улучшаем обменами пар сегментов
  // (с подстройкой поворота), пока самая длинная линия укорачивается.
  // search: false — только порядок по убыванию (для сравнения в тестах)
  let best = null;
  for (const order of search ? seedOrders(data) : [data]) {
    const v = bestRot(order, fullRots, best ? best.cost : Infinity);
    if (!best || v.cost < best.cost - 1e-6) best = v;
  }
  const n = data.length;
  for (let iter = 0; search && iter < MAX_ITER; iter++) {
    let improved = null;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const order = [...best.order];
        [order[i], order[j]] = [order[j], order[i]];
        const v = bestRot(order, nearRots(best.rot), (improved ?? best).cost);
        if (v.cost < (improved ?? best).cost - 0.2) improved = v;
      }
    }
    if (!improved) break;
    best = improved;
  }
  // 3) подпись — в другой ряд, если так лучше (не больше PER_ROW в ряду)
  for (let changed = search; changed; ) {
    changed = false;
    for (const l of best.labels) {
      const name = l.s.name;
      const curTop = best.labels.filter((x) => x.top).map((x) => x.s.name);
      const toTop = !l.top;
      const nextTop = toTop ? [...curTop, name] : curTop.filter((x) => x !== name);
      if (nextTop.length > PER_ROW || n - nextTop.length > PER_ROW) continue;
      const set = new Set(nextTop);
      const v = evaluate(best.order, best.rot, (sl) => [sl.filter((s) => set.has(s.name)), sl.filter((s) => !set.has(s.name))]);
      if (v.cost < best.cost - 0.2) {
        best = v;
        changed = true;
        break;
      }
    }
  }

  // цвета — свои у категории; иначе по месту на кольце, по часовой от первого сегмента
  let k = 0;
  const color = new Map(best.order.map((d) => [d.name, d.other ? otherColor : d.color || palette[k++ % palette.length]]));
  for (const sl of best.slices) sl.color = color.get(sl.name);
  return { ...g, slices: best.slices, labels: best.labels, maxGap: best.maxGap };
}
