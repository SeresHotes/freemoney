import { useEffect, useMemo, useRef, useState } from 'react';
import { arcPath, fmtPercent, layoutRing } from '../utils/ringLayout';

// Кольцо расходов по категориям для главного экрана (в духе Monefy): крупная
// иконка, название и процент у каждого сегмента, рядами сверху и снизу.
// Раскладка (поворот, порядок, ряды, размер кольца) — utils/ringLayout.js.
// Тап по сегменту/подписи — onSelect(item).
// data: [{ name, value, icon, color }]; center: { expense, income }.

const NAME_FS = 11;
const PCT_FS = 12.5;

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

  const g = useMemo(() => layoutRing(data, size.w, size.h), [data, size.w, size.h]);

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
              onClick={() => onSelect?.(s)}
            >
              <title>{`${s.name}: ${formatValue(s.value)} (${fmtPercent(s.percent)})`}</title>
            </path>
          ))}
          {g.labels.map(({ s, a, x, ay }) => (
            <line key={`l-${s.name}`} x1={a.px} y1={a.py} x2={x} y2={ay} stroke={s.color} strokeWidth="1.2" />
          ))}
          {g.labels.map(({ s, x, y }) => {
            const top = y - g.labelH / 2;
            const { mode } = g;
            return (
              <g key={s.name} className="ring__label" onClick={() => onSelect?.(s)}>
                <title>{`${s.name}: ${formatValue(s.value)}`}</title>
                {/* прозрачная подложка — чтобы тап попадал не только в буквы */}
                <rect x={x - g.slot / 2} y={top} width={g.slot} height={g.labelH} fill="transparent" />
                {mode.inline ? (
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="central">
                    <tspan fontSize={mode.icon}>{s.icon}</tspan>
                    <tspan fontSize={PCT_FS} className="ring__pct" fill={s.color} dx="3">
                      {fmtPercent(s.percent)}
                    </tspan>
                  </text>
                ) : (
                  <>
                    <text x={x} y={top + mode.icon / 2 + 1} textAnchor="middle" dominantBaseline="central" fontSize={mode.icon}>
                      {s.icon}
                    </text>
                    {mode.name && (
                      <text x={x} y={top + mode.icon + 9} textAnchor="middle" dominantBaseline="central" fontSize={NAME_FS} className="ring__name">
                        {fitText(s.name, g.slot - 4, NAME_FS)}
                      </text>
                    )}
                    <text x={x} y={top + g.labelH - 7} textAnchor="middle" dominantBaseline="central" fontSize={PCT_FS} className="ring__pct" fill={s.color}>
                      {fmtPercent(s.percent)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {g && center && (
        <div
          className="ring__center"
          style={{ width: g.r0 * 2, height: g.r0 * 2, '--ring-fs': `${Math.min(22, Math.max(12, g.r0 * 0.2))}px` }}
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
