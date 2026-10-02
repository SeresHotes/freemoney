import { useEffect, useRef, useState } from 'react';

// Кольцо расходов по категориям для главного экрана (в духе Monefy).
// Кольцо — почти на всю ширину; подписи (иконка, название, процент) стоят
// рядами СВЕРХУ и СНИЗУ от него — вертикального места на телефоне много, а
// ширину не тратим на текст по бокам. От подписи к сегменту — выносная линия.
// Если по высоте места мало — подпись сжимается до «иконка процент».
// Кольцо поворачивается так, чтобы подписи делились между рядами поровну и
// стояли ближе к своим сегментам. Тап по сегменту/подписи — onSelect(item).
// data: [{ name, value, icon, color }] по убыванию; center: { expense, income }.

const PAD_ANGLE = 0.025; // зазор между сегментами, рад
const ROTATIONS = 72; // перебор поворотов кольца с шагом 5°
const LEADER = 16; // зазор между рядом подписей и кольцом (под линию)
const MODES = {
  // полная подпись: иконка / название / процент
  full: { h: 46, minSlot: 58 },
  // сжатая: «иконка процент» в одну строку
  compact: { h: 20, minSlot: 44 },
};

const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];

// Сегмент кольца от угла a0 до a1 (рад, по часовой, 0 — направо).
function arcPath(cx, cy, r0, r1, a0, a1) {
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

// Разнести подписи ряда по горизонтали: не ближе step друг к другу и в
// пределах [lo, hi]. items отсортированы по желаемому x.
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

const fmtPercent = (p) => (p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);

// Точная ширина текста шрифтом страницы (canvas), с запасным приближением.
let measureCtx;
function textWidth(text, fontSize) {
  if (measureCtx === undefined) {
    measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  }
  if (!measureCtx) return text.length * fontSize * 0.56;
  measureCtx.font = `${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
  return measureCtx.measureText(text).width;
}

// Обрезать текст с «…», чтобы он влез в maxW.
function fitText(text, maxW, fontSize) {
  if (textWidth(text, fontSize) <= maxW) return text;
  let n = text.length - 1;
  while (n > 1 && textWidth(`${text.slice(0, n).trimEnd()}…`, fontSize) > maxW) n--;
  return `${text.slice(0, n).trimEnd()}…`;
}

// Разложить сегменты и подписи при повороте кольца rot (рад).
function place(data, total, geo, rot) {
  const { cx, cy, R, w, slot, perRow, topY, botY } = geo;
  const pad = data.length > 1 ? PAD_ANGLE : 0;
  let a = -Math.PI / 2 + rot;
  const slices = data.map((d) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const a0 = a + pad / 2;
    const a1 = Math.max(a0 + 0.004, a + sweep - pad / 2);
    a += sweep;
    return { ...d, percent: d.value / total, a0, a1, mid: (a0 + a1) / 2 };
  });

  let cost = 0;
  const labels = [];
  for (const top of [true, false]) {
    const row = slices
      .filter((s) => (Math.sin(s.mid) < 0) === top)
      .map((s) => {
        const [ax, ay] = polar(cx, cy, R, s.mid);
        return { s, top, ax, ay, want: ax, x: ax, y: top ? topY : botY };
      })
      .sort((p, q) => p.want - q.want);
    if (row.length > perRow) cost += 1e5 * (row.length - perRow);
    spread(row, slot, slot / 2, w - slot / 2);
    // штраф: сдвиг подписи от сегмента и длина выносной линии
    for (const p of row) cost += Math.abs(p.x - p.want) + 0.5 * Math.abs(p.y - p.ay);
    labels.push(...row);
  }
  return { slices, labels, cost };
}

function layout(data, w, h) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total || w < 100 || h < 80) return null;

  // Радиус: по ширине — почти во всю; по высоте — за вычетом рядов подписей.
  const radiusFor = (m) => Math.min(w / 2 - 10, (h - 2 * (MODES[m].h + LEADER)) / 2);
  const mode = radiusFor('full') >= Math.max(64, radiusFor('compact') * 0.7) ? 'full' : 'compact';
  const { h: labelH, minSlot } = MODES[mode];
  const R = Math.max(30, radiusFor(mode));
  const cx = w / 2;
  const cy = h / 2;
  const perRow = Math.max(2, Math.floor(w / minSlot));
  const slot = Math.min(w / perRow, 96);
  // ряды подписей — вплотную к кольцу (лишняя высота остаётся снаружи)
  const topY = cy - R - LEADER - labelH / 2;
  const botY = cy + R + LEADER + labelH / 2;
  const geo = { cx, cy, R, w, slot, perRow, topY, botY };

  let best = null;
  for (let i = 0; i < ROTATIONS; i++) {
    const v = place(data, total, geo, (i / ROTATIONS) * Math.PI * 2);
    if (!best || v.cost < best.cost - 0.5) best = v;
  }
  return { ...geo, r0: R * 0.64, mode, labelH, ...best };
}

// Точка крепления выносной линии — край подписи, обращённый к кольцу.
const attachY = (p, g) => (p.top ? p.y + g.labelH / 2 + 2 : p.y - g.labelH / 2 - 2);

// Конец линии на кольце — ближайшая к подписи точка внешнего края сегмента
// (а не середина дуги): линии короче и не пересекают кольцо.
function anchorPoint(p, g) {
  const { a0, a1 } = p.s;
  let t = Math.atan2(attachY(p, g) - g.cy, p.x - g.cx);
  const mid = (a0 + a1) / 2;
  while (t < mid - Math.PI) t += Math.PI * 2;
  while (t > mid + Math.PI) t -= Math.PI * 2;
  return polar(g.cx, g.cy, g.R, Math.min(a1, Math.max(a0, t)));
}

export default function CategoryRing({ data, center, formatValue, onSelect }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = layout(data, size.w, size.h);

  return (
    <div className="ring" ref={ref}>
      {g && (
        <svg width={size.w} height={size.h} className="ring__svg" role="img" aria-label="Расходы по категориям">
          {/* Линии — под кольцом: если линия задевает край, её перекрывает сегмент. */}
          {g.labels.map((p) => {
            const [ax, ay] = anchorPoint(p, g);
            return (
              <line
                key={`l-${p.s.name}`}
                x1={ax}
                y1={ay}
                x2={p.x}
                y2={attachY(p, g)}
                stroke={p.s.color}
                strokeWidth="1"
                opacity="0.7"
              />
            );
          })}
          {g.slices.map((s) => (
            <path
              key={s.name}
              d={arcPath(g.cx, g.cy, g.r0, g.R, s.a0, s.a1)}
              fill={s.color}
              className="ring__slice"
              onClick={() => onSelect?.(s)}
            >
              <title>{`${s.name}: ${formatValue(s.value)} (${fmtPercent(s.percent)})`}</title>
            </path>
          ))}
          {g.labels.map(({ s, x, y }) => (
            <g key={s.name} className="ring__label" onClick={() => onSelect?.(s)}>
              <title>{`${s.name}: ${formatValue(s.value)}`}</title>
              {/* прозрачная подложка — чтобы тап попадал не только в буквы */}
              <rect x={x - g.slot / 2} y={y - g.labelH / 2} width={g.slot} height={g.labelH} fill="transparent" />
              {g.mode === 'full' ? (
                <text x={x} textAnchor="middle">
                  <tspan x={x} y={y - 9} fontSize="16">{s.icon}</tspan>
                  <tspan x={x} y={y + 7} fontSize="10.5" className="ring__name">
                    {fitText(s.name, g.slot - 4, 10.5)}
                  </tspan>
                  <tspan x={x} y={y + 20} fontSize="11.5" className="ring__pct" fill={s.color}>
                    {fmtPercent(s.percent)}
                  </tspan>
                </text>
              ) : (
                <text x={x} y={y + 4} textAnchor="middle" fontSize="11.5">
                  <tspan>{s.icon} </tspan>
                  <tspan className="ring__pct" fill={s.color}>{fmtPercent(s.percent)}</tspan>
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      {g && center && (
        <div
          className="ring__center"
          style={{ width: g.r0 * 2, height: g.r0 * 2, '--ring-fs': `${Math.min(22, Math.max(11, g.r0 * 0.22))}px` }}
        >
          <span className="donut__label">Расходы</span>
          <span className="donut__expense">{formatValue(center.expense)}</span>
          {g.r0 > 52 && (
            <>
              <span className="donut__label">Доходы</span>
              <span className="donut__income">{formatValue(center.income)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
