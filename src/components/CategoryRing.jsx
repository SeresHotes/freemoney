import { useEffect, useRef, useState } from 'react';

// Кольцо расходов по категориям для главного экрана (как в Monefy): у каждого
// сегмента снаружи подпись «иконка + название» и процент, с выносной линией.
// Подписи раскладываются по двум колонкам (слева/справа) без наложений; если
// по высоте не хватает места на две строки — подпись в одну строку
// «иконка процент». Кольцо поворачивается так, чтобы подписи легли ровнее.
// Тап по подписи или сегменту — onSelect(name).
// data: [{ name, value, icon }] по убыванию; center: { expense, income }.

const TWO_LINE_H = 30; // высота двухстрочной подписи, px
const ONE_LINE_H = 17;
const FONT = 11.5;
const PAD_ANGLE = 0.025; // зазор между сегментами, рад

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

// Разнести подписи одной стороны по вертикали: не ближе step друг к другу и в
// пределах [top, bottom]. items отсортированы по желаемому y.
function spread(items, step, top, bottom) {
  for (let i = 0; i < items.length; i++) {
    const min = i === 0 ? top : items[i - 1].y + step;
    if (items[i].y < min) items[i].y = min;
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const max = i === items.length - 1 ? bottom : items[i + 1].y - step;
    if (items[i].y > max) items[i].y = max;
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

// Обрезать название с «…», чтобы «иконка + название» влезли в maxW.
function fitName(icon, name, maxW, fontSize) {
  const full = `${icon} ${name}`;
  if (textWidth(full, fontSize) <= maxW) return full;
  let n = name.length - 1;
  while (n > 1 && textWidth(`${icon} ${name.slice(0, n).trimEnd()}…`, fontSize) > maxW) n--;
  return `${icon} ${name.slice(0, n).trimEnd()}…`;
}

// Разложить сегменты и подписи при повороте кольца rot (рад).
function place(data, total, colors, geo, rot) {
  const { cx, cy, R, h } = geo;
  const pad = data.length > 1 ? PAD_ANGLE : 0;
  let a = -Math.PI / 2 + rot;
  const slices = data.map((d, i) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const a0 = a + pad / 2;
    const a1 = Math.max(a0 + 0.004, a + sweep - pad / 2);
    a += sweep;
    return { ...d, color: colors[i % colors.length], percent: d.value / total, a0, a1, mid: (a0 + a1) / 2 };
  });

  const right = slices.filter((s) => Math.cos(s.mid) >= 0);
  const left = slices.filter((s) => Math.cos(s.mid) < 0);
  const maxSide = Math.max(right.length, left.length);
  const twoLine = maxSide * TWO_LINE_H <= h;
  const step = twoLine ? TWO_LINE_H : Math.max(13, Math.min(ONE_LINE_H, h / maxSide));

  let cost = twoLine ? 0 : 2000;
  const labels = [];
  for (const [side, items] of [[1, right], [-1, left]]) {
    const placed = items
      .map((s) => ({ s, side, want: cy + (R + 10) * Math.sin(s.mid) }))
      .sort((p, q) => p.want - q.want);
    for (const p of placed) p.y = p.want;
    spread(placed, step, step / 2, h - step / 2);
    // штраф — насколько подписи пришлось сдвинуть от их сегментов
    for (const p of placed) cost += Math.abs(p.y - p.want);
    labels.push(...placed);
  }
  return { slices, labels, twoLine, cost };
}

const ROTATIONS = 72; // перебор поворотов кольца с шагом 5°

function layout(data, colors, w, h) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total || w < 100 || h < 80) return null;

  // Колонке подписей — ширину под самое длинное название (но не больше 30%
  // ширины): чем короче названия, тем крупнее кольцо.
  const longest = Math.max(...data.map((d) => textWidth(`${d.icon} ${d.name}`, FONT)));
  const labelW = Math.max(60, Math.min(longest + 4, w * 0.3));
  const gap = 14; // место под выносную линию
  const R = Math.max(36, Math.min(h / 2 - 6, (w - 2 * (labelW + gap)) / 2));
  const geo = { cx: w / 2, cy: h / 2, R, h };

  // Кольцо можно повернуть как угодно — выбираем поворот, при котором подписи
  // делятся между сторонами поровну и стоят ближе всего к своим сегментам
  // (иначе одна крупная категория сгоняет все мелкие подписи на одну сторону).
  let best = null;
  for (let i = 0; i < ROTATIONS; i++) {
    const v = place(data, total, colors, geo, (i / ROTATIONS) * Math.PI * 2);
    if (!best || v.cost < best.cost - 0.5) best = v;
  }

  // Колонка подписи — от выносной линии до края контейнера.
  const labelMax = w / 2 - R - gap - 2;
  return { ...geo, r0: R * 0.62, gap, labelMax, ...best };
}

export default function CategoryRing({ data, colors, center, formatValue, onSelect }) {
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

  const g = layout(data, colors, size.w, size.h);

  return (
    <div className="ring" ref={ref}>
      {g && (
        <svg width={size.w} height={size.h} className="ring__svg" role="img" aria-label="Расходы по категориям">
          {g.slices.map((s) => (
            <path
              key={s.name}
              d={arcPath(g.cx, g.cy, g.r0, g.R, s.a0, s.a1)}
              fill={s.color}
              className="ring__slice"
              onClick={() => onSelect?.(s.name)}
            >
              <title>{`${s.name}: ${formatValue(s.value)} (${fmtPercent(s.percent)})`}</title>
            </path>
          ))}
          {g.labels.map(({ s, side, y }) => {
            const [ex, ey] = polar(g.cx, g.cy, g.R + 2, s.mid);
            const elbowX = g.cx + side * (g.R + g.gap * 0.55);
            const tx = g.cx + side * (g.R + g.gap);
            const anchor = side > 0 ? 'start' : 'end';
            return (
              <g key={s.name} className="ring__label" onClick={() => onSelect?.(s.name)}>
                <polyline
                  points={`${ex},${ey} ${elbowX},${y} ${tx - side * 3},${y}`}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1"
                  opacity="0.7"
                />
                {g.twoLine ? (
                  <text x={tx} textAnchor={anchor} fontSize={FONT}>
                    <tspan x={tx} y={y - 3} className="ring__name">
                      {fitName(s.icon, s.name, g.labelMax, FONT)}
                    </tspan>
                    <tspan x={tx} y={y + 11} className="ring__pct" fill={s.color}>
                      {fmtPercent(s.percent)}
                    </tspan>
                  </text>
                ) : (
                  <text x={tx} y={y + 4} textAnchor={anchor} fontSize={FONT - 1}>
                    <tspan className="ring__name">{s.icon} </tspan>
                    <tspan className="ring__pct" fill={s.color}>{fmtPercent(s.percent)}</tspan>
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {g && center && (
        <div
          className="ring__center"
          style={{ width: g.r0 * 2, height: g.r0 * 2, '--ring-fs': `${Math.min(20, Math.max(11, g.r0 * 0.24))}px` }}
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
