// Раскладка кольца категорий главного экрана (см. components/CategoryRing.jsx).
//
// Подписи (крупная иконка, название, процент) стоят в фиксированных слотах:
// ряд сверху и ряд снизу кольца, до 5 в ряду; кольцо — между рядами, на всю
// доступную ширину. Размеры шрифтов фиксированные; если по высоте тесно, сперва
// убирается название, затем подпись сжимается в одну строку «иконка процент».
//
// Сегменты идут по часовой стрелке по убыванию («Другое» — последним), а если
// так линии получаются плохими — «по бокам» (sides) или «горкой» (mountain).
// Поворот кольца и то, какие подряд идущие категории уходят в верхний ряд, подбираются
// перебором так, чтобы каждая выносная линия отходила от кольца наружу под
// углом не меньше MIN_ANGLE к касательной (никаких линий «по касательной» и
// за кольцом) и линии по возможности не пересекались; подписи делятся поровну (больший перекос, чем на одну, — только
// если иначе линию не провести), при необходимости кольцо чуть уменьшается; при равенстве — самая крупная
// категория внизу по центру.

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

const PAD_ANGLE = 0.02; // зазор между сегментами, рад
const ROTATIONS = 72; // перебор поворотов с шагом 5°
const MIN_ANGLE = 20; // минимальный угол линии к касательной кольца, град
const PER_ROW = 5;
const CROSS_COST = 120; // штраф за пересечение двух выносных линий
const LEADER = 20; // зазор между рядом подписей и кольцом (под линию)
const MIN_R = 80; // меньше — пробуем более компактные подписи
// Варианты подписи: высота, размер иконки; name — есть ли строка с названием,
// inline — «иконка процент» в одну строку.
const MODES = [
  { h: 56, icon: 26, name: true },
  { h: 44, icon: 24, name: false },
  { h: 22, icon: 16, inline: true },
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

// Лучшая точка крепления линии на сегменте для подписи с точкой (lx, ly):
// по возможности линия идёт по радиусу; dev — отклонение линии от радиуса
// (90° — по касательной).
function anchor(s, lx, ly, g) {
  const want = near(Math.atan2(ly - g.cy, lx - g.cx), s.mid);
  const m = Math.min(0.03, (s.a1 - s.a0) / 3);
  const t = Math.min(s.a1 - m, Math.max(s.a0 + m, want));
  const [px, py] = polar(g.cx, g.cy, g.R, t);
  const vx = lx - px;
  const vy = ly - py;
  const len = Math.hypot(vx, vy) || 1;
  const cos = (vx * Math.cos(t) + vy * Math.sin(t)) / len;
  return { px, py, dev: Math.acos(Math.max(-1, Math.min(1, cos))) / DEG, len };
}

// Пересекаются ли отрезки p1–p2 и p3–p4 (строго, без общих концов).
function crosses(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d1 = (x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3);
  const d2 = (x4 - x3) * (y2 - y3) - (y4 - y3) * (x2 - x3);
  const d3 = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  const d4 = (x2 - x1) * (y4 - y1) - (y2 - y1) * (x4 - x1);
  return d1 * d2 < 0 && d3 * d4 < 0;
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

// Подписи для поворота rot и разреза cut: слайсы по часовой начиная с cut —
// первые nTop в верхний ряд (слева направо), остальные в нижний (справа налево).
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
      p.a = anchor(p.s, p.x, p.ay, g);
      cost += p.a.dev + 0.02 * p.a.len;
      if (p.a.dev > 90 - MIN_ANGLE) cost += 1000 + 20 * (p.a.dev - (90 - MIN_ANGLE));
    }
    labels.push(...placed);
  }
  // перекрещённые линии читаются плохо
  for (let i = 0; i < labels.length; i++) {
    const p = labels[i];
    for (let j = i + 1; j < labels.length; j++) {
      const q = labels[j];
      if (crosses(p.a.px, p.a.py, p.x, p.ay, q.a.px, q.a.py, q.x, q.ay)) cost += CROSS_COST;
    }
  }
  return { labels, cost };
}

// Масштабы радиуса, которые пробуем: кольцо во всю ширину красивее, но тогда
// крайние подписи стоят прямо над его боками и к боковым сегментам линия
// идёт почти по касательной. Если правило MIN_ANGLE так не выполнить —
// кольцо чуть уменьшается.
const R_SCALES = [1, 0.9, 0.8, 0.72];

// Порядок «горкой»: крупнейшая в середине, следующие — по очереди по бокам,
// мелкие — напротив крупной. Мелкие сегменты тогда не сбиваются в кучу за
// несколькими крупными подряд.
function mountain(list) {
  const left = [];
  const right = [];
  list.forEach((d, i) => (i % 2 ? left : right).push(d));
  return [...left.reverse(), ...right];
}

// Порядок «по бокам»: у боков кольца (3 и 9 часов) линия из верхнего/нижнего
// ряда подходит почти по касательной, поэтому туда ставим две крупнейшие
// категории — к большому сегменту линию можно провести с любого его края.
// Остальные делятся между верхней и нижней дугой поровну (и по числу, и по
// сумме), по убыванию слева направо сверху и справа налево снизу.
function sides(list) {
  if (list.length < 4) return list;
  const [a, b, ...rest] = list;
  const up = [];
  const down = [];
  let upSum = 0;
  let downSum = 0;
  for (const d of rest) {
    const toUp = up.length < down.length || (up.length === down.length && upSum <= downSum);
    if (toUp) { up.push(d); upSum += d.value; } else { down.push(d); downSum += d.value; }
  }
  return [a, ...up, b, ...down];
}

export function layoutRing(data, w, h) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total || w < 100 || h < 80) return null;

  const n = data.length;
  const radiusFor = (m) => Math.min(w / 2 - 4, (h - 2 * (m.h + LEADER)) / 2);
  const mode = MODES.find((m) => radiusFor(m) >= MIN_R) || MODES[MODES.length - 1];
  const maxR = Math.max(30, radiusFor(mode));
  const cx = w / 2;
  const cy = h / 2;
  // Сколько подписей сверху: поровну (перекос на одну — почти бесплатно).
  // Больший перекос дорог и выбирается, только если иначе линию не провести
  // (например, все мелкие сегменты в узком секторе рядом с огромным).
  const half = n / 2;
  const splits = [];
  for (let k = Math.max(0, n - PER_ROW); k <= Math.min(PER_ROW, n); k++) splits.push(k);
  const splitCost = (k) => {
    const d = Math.abs(k - half);
    return 15 * Math.min(d, 1) + 300 * Math.max(0, d - 1);
  };

  // По убыванию по часовой — привычнее; остальные — если с ними линии лучше.
  const orders = [[data, 0], [sides(data), 30], [mountain(data), 40]];

  let best = null;
  for (const scale of R_SCALES) {
    const R = maxR * scale;
    const g = {
      w, cx, cy, R, mode,
      labelH: mode.h,
      slot: w / PER_ROW,
      // ряды — вплотную к кольцу (лишняя высота остаётся снаружи)
      topY: cy - R - LEADER - mode.h / 2,
      botY: cy + R + LEADER + mode.h / 2,
    };
    for (const [order, orderCost] of orders) {
      for (let i = 0; i < ROTATIONS; i++) {
        const slices = slicesAt(order, total, (i / ROTATIONS) * Math.PI * 2);
        // при равенстве — крупнейшая категория внизу по центру (детерминированно)
        const big = slices.find((x) => x.name === data[0].name);
        const biggestOff = Math.abs(near(big.mid, Math.PI / 2) - Math.PI / 2) / DEG;
        for (const nTop of splits) {
          for (let cut = 0; cut < n; cut++) {
            const v = placeLabels(slices, cut, nTop, g);
            const cost = v.cost + orderCost + 0.3 * biggestOff + splitCost(nTop);
            if (!best || cost < best.cost - 1e-6) best = { ...v, cost, slices, g };
          }
        }
      }
    }
    // нашёлся вариант без линий «по касательной» — меньше кольцо не делаем
    if (best.cost < 1000) break;
  }
  return { ...best.g, r0: best.g.R * 0.66, slices: best.slices, labels: best.labels };
}

