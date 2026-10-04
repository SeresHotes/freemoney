// Раскладка кольца категорий главного экрана (см. components/CategoryRing.jsx).
//
// Подписи (иконка + название) — в 14 местах по периметру вокруг кольца, сеткой
// 4×5 (как в Monefy): 4 сверху (два угла и два между ними), 4 снизу, по 3 слева
// и справа. У «Другого» подписи нет — только сектор.
//
// Категория привязывается к своему сектору (своя дуга и линия к подписи),
// только если место подписи не слишком далеко по кругу от сектора: направление
// на подпись из центра уходит за дугу сектора не больше чем на MAX_GAP. Если
// так разместить все не получается — самая маленькая из привязанных уходит в
// «Другое», и так, пока не получится. Отвязанная категория на кольце — часть
// сектора «Другое», но её подпись (иконка, название, процент) остаётся на
// свободном месте — без линии, ближе к «Другому», пока места хватает.
// Подписи привязанных — с сохранением кругового порядка сегментов.
//
// Поиск: порядок сегментов по кругу (любой) и поворот кольца; места подписям —
// с сохранением кругового порядка (линии не пересекаются), оптимально
// динамикой. Старт — несколько порядков × все повороты, затем обмены пар
// сегментов, пока стоимость падает. Детерминированно.
// Выносные линии ломаные (до двух изломов, см. leader).

export const SLOTS = 14; // мест под подписи (сетка 4×5 по периметру)
export const MAX_GAP = 30; // град: подпись дальше от своего сектора — категория уходит в «Другое»
// «Другое» — только сектор (без подписи); иконка — для центра при удержании
export const OTHER = { name: 'Другое', icon: '📦', other: true };

export const R_FRAC = 0.36; // радиус кольца — доля ширины, не больше
const MAX_SHRINK = 0.3; // на сколько кольцо может уменьшиться ради названий (невысокие экраны)
export const INNER = 0.6; // внутренний радиус — доля внешнего (толщина под проценты)
const PAD_ANGLE = 0.02; // зазор между сегментами, рад
export const NAME_LINE_H = 13; // высота строки названия в подписи
const SIDE_FRAC = 0.18; // ширина боковой колонки подписей — доля ширины
const SIDE_MIN = 60;
const SIDE_MAX = 84;
const SIDE_GAP = 10; // зазор между боковой колонкой и кольцом (под линию)
const V_GAP = 22; // зазор между верхним/нижним рядом и кольцом (под линию)
const ROW_GAP = 2; // зазор между подписями в боковой колонке
const ASPECT = 1.15; // сетка подписей по высоте — до ASPECT своей ширины (высокие экраны)
const STUB = 16; // радиальный отрезок линии от кольца (только для обхода кольца)
const BEND_ANGLE = 25; // град: линия отходит от кольца не круче к радиусу — иначе излом
const BEND_AT = 0.5; // излом — на такой доле прямого пути от кольца до подписи
const BLOCK_FRAC = 1; // линия не заходит в круг чужой подписи (доля его радиуса)
const STAY_COST = 6; // цена переезда подписи с прошлого места (≈ отрыв 15° вместо 0°)
const BLOCKED_GAP = 90; // град: «отрыв» места, к которому линия прошла бы через чужую подпись
const SEED_ROTATIONS = 24; // повороты для стартовых порядков (шаг 15°)
const ROT_STEPS = [-8, 0, 8]; // подстройка поворота при обменах, град
const MAX_ITER = 10; // шагов улучшения обменами, не больше
const EDGE = 2; // отступ подписей от края
// Подпись: иконка и название (1–2 строки); если по высоте тесно — две строки
// с иконкой поменьше, затем одна строка, затем без названия, на совсем низких
// экранах — с иконкой поменьше.
const SMALL_ICON = 36;
const MODES = [
  { h: 66, icon: 46, name: true },
  { h: 48, icon: 44, name: false },
  { h: 30, icon: 26, name: false },
];

// Ширина боковой колонки подписей (уже, чем верх/низ) — под неё переносится название.
export const sideWidth = (w) => Math.min(SIDE_MAX, Math.max(SIDE_MIN, w * SIDE_FRAC));

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

// Линия к подписи — не больше одного излома. Подпись (весь слот) считается
// кругом с центром (lx, ly) и радиусом rad: линия идёт к ближайшей точке этого
// круга (целится в центр и останавливается на краю). Прямая, если она отходит
// от кольца не круче BEND_ANGLE к радиусу; иначе первый отрезок — ровно под
// BEND_ANGLE к радиусу (в сторону подписи), примерно до середины пути, а
// оттуда — прямо к подписи. Если второму отрезку мешает кольцо, излом
// отодвигается дальше по лучу. Только если и так нельзя (подпись «за
// кольцом») — обход кольца по дуге. points — вершины; detour — точки обхода.
function leader(s, lx, ly, rad, g) {
  return leaderAt(ringPoint(s, Math.atan2(ly - g.cy, lx - g.cx)), lx, ly, rad, g);
}

// Откуда на кольце выходит линия к подписи в направлении ang: ближайшая к нему
// точка дуги сектора (чуть отступив от краёв). → { t, want }.
function ringPoint(s, ang) {
  const want = near(ang, s.mid);
  const m = Math.min(0.03, (s.a1 - s.a0) / 3);
  return { t: Math.min(s.a1 - m, Math.max(s.a0 + m, want)), want };
}

function leaderAt({ t, want }, lx, ly, rad, g) {
  const [ax, ay] = polar(g.cx, g.cy, g.R, t);
  // ближайшая к точке p точка круга подписи
  const edge = ([px, py]) => {
    const d = Math.hypot(lx - px, ly - py) || 1;
    const k = Math.max(0, d - rad) / d;
    return [px + (lx - px) * k, py + (ly - py) * k];
  };
  const end = edge([ax, ay]);
  const len = Math.hypot(end[0] - ax, end[1] - ay);
  const [ux, uy] = [Math.cos(t), Math.sin(t)]; // радиус наружу
  const angle = Math.acos(Math.max(-1, Math.min(1, ((lx - ax) * ux + (ly - ay) * uy) / (Math.hypot(lx - ax, ly - ay) || 1)))) / DEG;
  if (angle <= BEND_ANGLE) return { points: [[ax, ay], end], len, detour: 0 };
  // луч под BEND_ANGLE к радиусу, повёрнутый в сторону подписи
  const side = Math.sign(ux * (ly - ay) - uy * (lx - ax)) || 1;
  const r = t + side * BEND_ANGLE * DEG;
  const clear = (p) => distToSegment(g.cx, g.cy, ...p, ...edge(p)) >= g.R + 2;
  for (let k = BEND_AT; k <= 2; k += 0.25) {
    const bend = [ax + Math.cos(r) * len * k, ay + Math.sin(r) * len * k];
    // излом не внутри круга подписи
    if (Math.hypot(lx - bend[0], ly - bend[1]) > rad && clear(bend)) return { points: [[ax, ay], bend, edge(bend)], len, detour: 0 };
  }
  // Обход по дуге радиуса rw в сторону подписи (кратчайшим путём). Шаг —
  // такой, чтобы хорда между соседними точками не срезала край кольца.
  const rw = g.R + STUB + 6;
  const points = [[ax, ay], polar(g.cx, g.cy, g.R + STUB, t)];
  const step = 2 * Math.acos((g.R + 2) / rw) * 0.9 * Math.sign(want - t || 1);
  let a = t;
  let detour = 0;
  while (detour < 24 && !clear(points[points.length - 1])) {
    a += step;
    points.push(polar(g.cx, g.cy, rw, a));
    detour++;
  }
  points.push(edge(points[points.length - 1]));
  return { points, len, detour };
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


// Отрыв подписи от её сектора по кругу, град: направление на подпись из центра
// кольца против дуги сектора (0 — подпись прямо «напротив» сектора).
function arcGap(s, ang) {
  const a = near(ang, (s.a0 + s.a1) / 2);
  return (a < s.a0 ? s.a0 - a : a > s.a1 ? a - s.a1 : 0) / DEG;
}

// Цена места для подписи: резко растёт с отрывом (в сумме это почти «самый
// большой отрыв»), чуть-чуть — отклонение от середины сектора (линии короче).
// Плюс STAY_COST, если в прошлый раз (memory) подпись стояла на другом месте.
function slotCost(s, slot, memory) {
  const gap = fitGap(s, slot);
  const was = memory?.slots?.[s.name];
  const moved = was && was !== slot.id ? STAY_COST : 0;
  return (gap / 10) ** 4 + 0.05 * gap + 0.002 * Math.abs(near(slot.ang, s.mid) - s.mid) / DEG + moved;
}

// Отрыв подписи на месте slot от сектора s, град; если линия к ней прошла бы
// через чужую подпись — как будто подпись слишком далеко (BLOCKED_GAP).
function fitGap(s, slot) {
  const { t } = ringPoint(s, slot.ang);
  const k = ((Math.round(t / DEG) % 360) + 360) % 360;
  return slot.blocked[k] ? BLOCKED_GAP : arcGap(s, slot.ang);
}

// Места подписям с сохранением кругового порядка: сегменты (по часовой) →
// места (по часовой, slots отсортированы по углу), минимум суммы slotCost.
// Динамика по (сегмент, место) для каждого места первого сегмента.
// → { cost, pick: [индекс места для каждого сегмента] }.
function assignSlots(slices, slots, bound = Infinity, memory = null) {
  const n = slices.length;
  const m = slots.length;
  const c = slices.map((s) => slots.map((t) => slotCost(s, t, memory)));
  let best = { cost: Infinity, pick: null };
  const span = m - n; // запас мест
  for (let o = 0; o < m; o++) {
    // dp[i][p]: сегменты 0..i, сегмент i — на месте o + i + p (p — сколько мест пропущено)
    const dp = [];
    const from = [];
    for (let i = 0; i < n; i++) {
      dp.push(new Float64Array(span + 1));
      from.push(new Int8Array(span + 1));
      let run = Infinity;
      let runAt = 0;
      for (let p = 0; p <= span; p++) {
        if (i > 0 && dp[i - 1][p] < run) {
          run = dp[i - 1][p];
          runAt = p;
        }
        const own = c[i][(o + i + p) % m];
        if (i === 0) dp[i][p] = p === 0 ? own : Infinity;
        else dp[i][p] = run + own;
        from[i][p] = runAt;
      }
    }
    let end = 0;
    for (let p = 1; p <= span; p++) if (dp[n - 1][p] < dp[n - 1][end]) end = p;
    const cost = dp[n - 1][end];
    if (cost < best.cost && cost < bound) {
      const pick = new Array(n);
      for (let i = n - 1, p = end; i >= 0; i--) {
        pick[i] = (o + i + p) % m;
        p = from[i][p];
      }
      best = { cost, pick };
    }
  }
  return best;
}

// Геометрия: кольцо и 14 мест для подписей (сетка 4×5 по периметру).
// Режим подписи — первый, при котором боковые колонки не налезают по высоте и
// кольцо почти своего размера; иначе самый компактный.
function frame(w, h, nameLines) {
  const modes = MODES.flatMap((m) => {
    if (!m.name) return [m];
    const one = { ...m, nameLines: 1 };
    if (nameLines < 2) return [one];
    const two = { ...m, h: m.h + NAME_LINE_H, nameLines: 2 };
    return [two, { ...two, icon: SMALL_ICON, h: two.h - (m.icon - SMALL_ICON) }, one];
  });
  const sideW = sideWidth(w);
  const cx = w / 2;
  const cy = h / 2;
  const fixedR = Math.min(w * R_FRAC, h * R_FRAC, cx - EDGE - sideW - SIDE_GAP);
  const fit = (mode) => {
    const R = Math.min(fixedR, cy - EDGE - mode.h - V_GAP);
    // боковые колонки — вплотную к кольцу, но не дальше края
    const colX = Math.max(EDGE + sideW / 2, cx - R - SIDE_GAP - sideW / 2);
    const lo = Math.max(R + V_GAP + mode.h / 2, 2 * (mode.h + ROW_GAP)); // полувысота сетки
    const hi = cy - EDGE - mode.h / 2;
    const halfH = Math.min(hi, Math.max(lo, (cx - colX) * ASPECT));
    return { mode, R, colX, halfH, ok: lo <= hi && R >= fixedR * (1 - MAX_SHRINK) };
  };
  const f = modes.map(fit).find((x) => x.ok) || fit(modes[modes.length - 1]);
  const { mode, colX, halfH } = f;
  const R = Math.max(24, f.R);
  const d = (w - 2 * colX) / 3; // шаг верхнего/нижнего ряда
  const xs = [colX, colX + d, colX + 2 * d, w - colX];
  const ys = [0, 1, 2, 3, 4].map((j) => cy - halfH + (j * halfH) / 2);
  const slots = [];
  // угол места — по его центру (линия целится в центр слота)
  // id — позиция в сетке «столбец,строка»: одинакова на любом экране (для памяти мест)
  const add = (x, y, side, sw, id) => slots.push({ id, x, y, side, w: sw, ang: Math.atan2(y - cy, x - cx) });
  xs.forEach((x, i) => {
    const corner = i === 0 || i === 3;
    const sw = corner ? Math.min(sideW, d - 6) : d - 6;
    add(x, ys[0], corner ? 'corner' : 'top', sw, `${i},0`);
    add(x, ys[4], corner ? 'corner' : 'bottom', sw, `${i},4`);
  });
  ys.slice(1, 4).forEach((y, j) => {
    add(xs[0], y, 'left', sideW, `0,${j + 1}`);
    add(xs[3], y, 'right', sideW, `3,${j + 1}`);
  });
  slots.sort((a, b) => a.ang - b.ang);
  // слот для линии — круг вокруг центра подписи (касается её верха и низа)
  const g = { w, h, cx, cy, R, r0: R * INNER, mode, labelH: mode.h, labelR: mode.h / 2 + 2, slots };
  // Для каждого места и каждой точки кольца (шаг 1°): проходит ли линия оттуда
  // через другую подпись (её круг, чуть меньший) или в обход кольца.
  const hit = g.labelR * BLOCK_FRAC;
  for (const slot of slots) {
    slot.blocked = new Uint8Array(360);
    for (let k = 0; k < 360; k++) {
      const t = k * DEG;
      const { points, detour } = leaderAt({ t, want: near(slot.ang, t) }, slot.x, slot.y, g.labelR, g);
      slot.blocked[k] = detour > 0 || slots.some((o) => o !== slot && points.slice(1).some((p, i) => distToSegment(o.x, o.y, ...points[i], ...p) < hit)) ? 1 : 0;
    }
  }
  return g;
}

// Лучшая раскладка этих сегментов: порядок по кругу + поворот + места подписей.
// memory — прошлая раскладка: её порядок и поворот — первый старт поиска, а
// переезд подписи с прошлого места стоит STAY_COST.
function search(list, total, g, doSearch, memory) {
  const evaluate = (order, rot, bound) => {
    const slices = slicesAt(order, total, rot);
    // у «Другого» подписи нет — места только привязанным категориям
    const named = slices.filter((sl) => !sl.other);
    const { cost, pick } = assignSlots(named, g.slots, bound, memory);
    return { cost, pick, slices, named, order, rot };
  };
  const bestRot = (order, rots, bound = Infinity) => {
    let best = null;
    for (const rot of rots) {
      const v = evaluate(order, rot, best ? Math.min(best.cost, bound) : bound);
      if (!best || v.cost < best.cost - 1e-9) best = v;
    }
    return best;
  };
  const fullRots = Array.from({ length: SEED_ROTATIONS }, (_, i) => (i / SEED_ROTATIONS) * Math.PI * 2);
  const nearRots = (r) => ROT_STEPS.map((dd) => r + dd * DEG);
  let best = null;
  const seeds = doSearch ? seedOrders(list) : [list];
  // прошлый порядок: известные — как были, новые — в конце (крупные первыми)
  if (memory?.order) {
    const pos = new Map(memory.order.map((name, i) => [name, i]));
    const known = list.filter((d) => pos.has(d.name)).sort((a, b) => pos.get(a.name) - pos.get(b.name));
    seeds.unshift([...known, ...list.filter((d) => !pos.has(d.name))]);
  }
  seeds.forEach((order, i) => {
    const rots = i === 0 && memory?.order ? [memory.rot, ...fullRots] : fullRots;
    const v = bestRot(order, rots, best ? best.cost : Infinity);
    if (!best || v.cost < best.cost - 1e-9) best = v;
  });
  const n = list.length;
  for (let iter = 0; doSearch && iter < MAX_ITER; iter++) {
    let improved = null;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const order = [...best.order];
        [order[i], order[j]] = [order[j], order[i]];
        const bound = (improved ?? best).cost - 0.01;
        const v = bestRot(order, nearRots(best.rot), bound);
        if (v.pick && v.cost < bound) improved = v;
      }
    }
    if (!improved) break;
    best = improved;
  }
  return best;
}

// Подписи на выбранных местах и линии к ним.
function placeLabels(best, g) {
  return best.named.map((s, i) => {
    const t = g.slots[best.pick[i]];
    return { s, x: t.x, y: t.y, side: t.side, w: t.w, gap: fitGap(s, t), a: leader(s, t.x, t.y, g.labelR, g) };
  });
}

// data — все категории [{ name, value, icon, color? }]; nameLines — сколько
// строк отвести под название (2 — если какое-то не влезает в одну, см.
// CategoryRing). Мелкие, которым не нашлось места рядом с сектором, —
// в «Другое» ({ ...OTHER, value, items }). Цвет сегмента — свой цвет категории
// (d.color); у кого его нет — по месту на кольце, по часовой в порядке palette;
// «Другое» — otherColor.
// Кэш раскладок: листание месяцев туда-обратно не пересчитывает поиск заново.
const cache = new Map();
const CACHE_SIZE = 40;

export function layoutRing(data, w, h, opts = {}) {
  const key = JSON.stringify([data.map((d) => [d.name, d.value, d.color || '']), Math.round(w), Math.round(h), opts.nameLines, opts.palette, opts.otherColor, opts.search, opts.memory]);
  if (cache.has(key)) return cache.get(key);
  const result = computeLayout(data, w, h, opts);
  cache.set(key, result);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return result;
}

function computeLayout(data, w, h, { nameLines = 1, palette = ['#888'], otherColor = '#64748b', search: doSearch = true, memory = null } = {}) {
  const sorted = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((sum, d) => sum + d.value, 0);
  if (!total || w < 100 || h < 80) return null;
  const g = frame(w, h, nameLines);

  // Сколько категорий привязать к секторам: сначала сколько влезает по местам
  // (все — или SLOTS, остальное — «Другое»), затем меньше — пока все подписи
  // не окажутся рядом со своими секторами (двоичным поиском: с ростом k
  // разместить только труднее).
  const N = sorted.length;
  const tried = new Map();
  const attempt = (k) => {
    if (!tried.has(k)) {
      const rest = sorted.slice(k);
      const list = rest.length ? [...sorted.slice(0, k), { ...OTHER, value: rest.reduce((sum, d) => sum + d.value, 0), items: rest }] : sorted;
      const v = search(list, total, g, doSearch, memory);
      v.maxGap = Math.max(...v.named.map((sl, i) => fitGap(sl, g.slots[v.pick[i]])));
      tried.set(k, v);
    }
    return tried.get(k);
  };
  const uniq = Array.from({ length: Math.min(N, SLOTS) }, (_, i) => i + 1);
  let lo = 0; // uniq[lo] подходит (k = 1: одна подпись — всегда)
  let hi = uniq.length - 1;
  if (attempt(uniq[hi]).maxGap <= MAX_GAP) lo = hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (attempt(uniq[mid]).maxGap <= MAX_GAP) lo = mid;
    else hi = mid;
  }
  const best = attempt(uniq[lo]);
  const other = best.slices.find((sl) => sl.other);
  // отвязанные (из «Другого») — на свободные места, крупные — ближе к «Другому»
  const used = new Set(best.pick);
  const free = g.slots
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => !used.has(i))
    .sort((p, q) => Math.abs(near(p.t.ang, other?.mid ?? 0) - (other?.mid ?? 0)) - Math.abs(near(q.t.ang, other?.mid ?? 0) - (other?.mid ?? 0)));
  // отвязанные, чьё прошлое место свободно, — туда же
  const items = other?.items ?? [];
  const detached = [];
  for (const d of items) {
    const at = free.findIndex(({ t }) => t.id === memory?.slots?.[d.name]);
    if (at >= 0) detached.push({ d, t: free.splice(at, 1)[0].t });
  }
  for (const d of items) {
    if (!free.length) break;
    if (!detached.some((x) => x.d === d)) detached.push({ d, t: free.shift().t });
  }

  // цвета — свои у категории; иначе по месту на кольце, по часовой от первого сегмента
  let k = 0;
  const color = new Map(best.order.map((d) => [d.name, d.other ? otherColor : d.color || palette[k++ % palette.length]]));
  for (const { d } of detached) color.set(d.name, d.color || palette[k++ % palette.length]);
  for (const sl of best.slices) sl.color = color.get(sl.name);
  const labels = placeLabels(best, g);
  // подписи отвязанных — без линии (gap и a — null)
  for (const { d, t } of detached) {
    const s = { ...d, percent: d.value / total, color: color.get(d.name), detached: true };
    labels.push({ s, x: t.x, y: t.y, side: t.side, w: t.w, gap: null, a: null });
  }
  // память для следующего раза: порядок секторов, поворот и места подписей
  const remember = {
    order: best.order.map((d) => d.name),
    rot: best.rot,
    slots: Object.fromEntries(labels.map((l) => [l.s.name, g.slots.find((t) => t.x === l.x && t.y === l.y).id])),
  };
  return { ...g, slices: best.slices, labels, maxGap: Math.max(0, ...labels.map((l) => l.gap ?? 0)), shown: best.slices.length, memory: remember };
}
