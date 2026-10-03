import { useEffect, useMemo, useRef, useState } from 'react';
import { NAME_LINE_H, PER_ROW, arcPath, fmtPercent, layoutRing } from '../utils/ringLayout';

// Кольцо расходов по категориям для главного экрана (в духе Monefy): проценты
// на самих сегментах, подписи (иконка + название) рядами сверху и снизу,
// ломаные выносные линии.
// Раскладка (поворот, порядок, ряды, размер кольца) — utils/ringLayout.js.
// Тап по сегменту/подписи — onSelect(item).
// data: [{ name, value, icon, color }]; center: { expense, income }.

const NAME_FS = 11;
const PCT_FS = 12.5;
const RING_PCT_FS = 12; // процент на сегменте

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

const NAME_FS_MIN = 9.5;
const SLACK = 1.12; // на сколько строка может выйти за свою ширину (зазор между подписями)

// Разбить название на строки (до maxLines) по словам в ширину maxW. Слово,
// которое не влезает целиком, — сперва чуть меньшим шрифтом, затем переносом
// с дефисом; «…» — только если не помогло и это. → { lines, fontSize }.
function wrapName(name, maxW, maxLines) {
  const words = name.split(/\s+/).filter(Boolean);
  let fontSize = NAME_FS;
  const longest = () => Math.max(...words.map((wd) => textWidth(wd, fontSize)));
  while (fontSize > NAME_FS_MIN && longest() > maxW) fontSize -= 0.5;

  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || textWidth(next, fontSize) <= maxW) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);

  // Длинное слово: чуть-чуть не влезает — оставляем целым (у соседей есть запас);
  // сильно — переносим с дефисом, если есть свободная строка и на каждой
  // части остаётся хотя бы 3 буквы.
  for (let i = 0; i < lines.length && lines.length < maxLines; i++) {
    const line = lines[i];
    if (textWidth(line, fontSize) <= maxW * SLACK) continue;
    let n = line.length - 3;
    while (n >= 3 && textWidth(`${line.slice(0, n)}-`, fontSize) > maxW) n--;
    if (n >= 3) lines.splice(i, 1, `${line.slice(0, n)}-`, line.slice(n));
  }

  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    lines.splice(0, lines.length, ...head, lines.slice(maxLines - 1).join(' '));
  }
  return { lines: lines.map((l) => fitText(l, maxW * SLACK, fontSize)), fontSize };
}

// Ширина, доступная подписи: до середины расстояния к соседям в ряду и до края.
function labelWidths(labels, w) {
  const widths = new Map();
  for (const top of [true, false]) {
    const row = labels.filter((l) => l.top === top).sort((a, b) => a.x - b.x);
    row.forEach((l, i) => {
      const left = i > 0 ? l.x - row[i - 1].x : 2 * l.x;
      const right = i < row.length - 1 ? row[i + 1].x - l.x : 2 * (w - l.x);
      widths.set(l, Math.min(left, right) - 6);
    });
  }
  return widths;
}

// Процент на сегменте: по центру толщины кольца, если влезает по дуге и толщине.
function ringPercent(s, g) {
  const text = fmtPercent(s.percent);
  const rm = (g.r0 + g.R) / 2;
  const arc = (s.a1 - s.a0) * rm;
  if (g.R - g.r0 < RING_PCT_FS + 4 || arc < textWidth(text, RING_PCT_FS) + 8) return null;
  return { text, x: g.cx + rm * Math.cos(s.mid), y: g.cy + rm * Math.sin(s.mid) };
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

  // Вторая строка под название — только если какое-то не влезает в одну строку
  // обычного слота (иначе зря отнимали бы высоту у кольца).
  const nameLines = useMemo(() => {
    const slotW = size.w / PER_ROW - 6;
    return data.some((d) => textWidth(d.name, NAME_FS) > slotW) ? 2 : 1;
  }, [data, size.w]);
  const g = useMemo(() => layoutRing(data, size.w, size.h, { nameLines }), [data, size.w, size.h, nameLines]);
  const widths = useMemo(() => (g ? labelWidths(g.labels, size.w) : new Map()), [g, size.w]);
  const onRing = useMemo(() => new Map(g ? g.slices.map((s) => [s.name, ringPercent(s, g)]) : []), [g]);

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
          {g.slices.map((s) => {
            const pct = onRing.get(s.name);
            return pct ? (
              <text
                key={`p-${s.name}`}
                x={pct.x}
                y={pct.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={RING_PCT_FS}
                className="ring__pct-on"
              >
                {pct.text}
              </text>
            ) : null;
          })}
          {/* Ломаная: от кольца строго по радиусу, затем к подписи (при нужде — в обход кольца). */}
          {g.labels.map(({ s, a }) => (
            <polyline
              key={`l-${s.name}`}
              points={a.points.map((pt) => pt.join(',')).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          ))}
          {g.labels.map((l) => {
            const { s, x, y } = l;
            const top = y - g.labelH / 2;
            const { mode } = g;
            const name = mode.name ? wrapName(s.name, widths.get(l) ?? g.slot - 6, mode.nameLines) : null;
            // процент в подписи — только если на сегменте он не поместился
            const pctHere = onRing.get(s.name) ? null : fmtPercent(s.percent);
            const lastY = (i, all) => top + mode.icon + 9 + NAME_LINE_H * (i + (mode.nameLines - all.length) / 2);
            return (
              <g key={s.name} className="ring__label" onClick={() => onSelect?.(s)}>
                <title>{`${s.name}: ${formatValue(s.value)} (${fmtPercent(s.percent)})`}</title>
                {/* прозрачная подложка — чтобы тап попадал не только в буквы */}
                <rect x={x - g.slot / 2} y={top} width={g.slot} height={g.labelH} fill="transparent" />
                {/* процент, не влезший на сегмент, — рядом с иконкой (там есть место) */}
                <text x={x} y={top + mode.icon / 2 + 1} textAnchor="middle" dominantBaseline="central" fontSize={mode.icon}>
                  {s.icon}
                  {pctHere && (
                    <tspan fontSize={PCT_FS} className="ring__pct" fill={s.color} dx="2">
                      {pctHere}
                    </tspan>
                  )}
                </text>
                {name &&
                  name.lines.map((line, i, all) => (
                    <text
                      key={i}
                      x={x}
                      y={lastY(i, all)}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={name.fontSize}
                      className="ring__name"
                    >
                      {line}
                    </text>
                  ))}
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
