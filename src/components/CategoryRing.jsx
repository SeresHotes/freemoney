import { useEffect, useMemo, useRef, useState } from 'react';
import { NAME_LINE_H, arcPath, fmtPercent, layoutRing, sideWidth } from '../utils/ringLayout';
import { CATEGORY_COLORS, OTHER_COLOR } from '../utils/chartColors';
import CategoryIcon from './CategoryIcon';

// Кольцо расходов по категориям для главного экрана (в духе Monefy): проценты
// на самих сегментах, подписи (иконка + название) по периметру вокруг кольца
// (4 сверху, 4 снизу, по 3 по бокам), ломаные выносные линии.
// Раскладка (поворот, порядок, места подписей, что уходит в «Другое», размер
// кольца) — utils/ringLayout.js.
// Касание сегмента/подписи — пока палец держится, категория подсвечена, а в
// центре вместо итогов месяца её траты; короткий тап — onSelect(item);
// сдвиг в первые HOLD_MS — свайп месяца, дольше — удержание.
// data: все категории [{ name, value, icon, color? }]; мелкие, которым не нашлось
// места рядом с сектором, кольцо само собирает в сектор «Другое» (other: true),
// а их подписи остаются на свободных местах — без линии (detached).
// center: { expense, income }.
// Цвет — свой у категории (color), иначе по месту на кольце (см. layoutRing).

const NAME_FS = 11;
const PCT_FS = 12.5;
const RING_PCT_FS = 12; // процент на сегменте
const HELD_GROW = 5; // px: на сколько выдвигается наружу зажатый сегмент
const HOLD_MS = 200; // столько без движения — удержание: дальше сдвиг уже не свайп
const TAP_MS = 400; // отпустил раньше и не сдвигал — тап
const LONG_PRESS_SLOP = 10; // px: сдвиг пальца больше — это свайп, не нажатие

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

// Цвет текста поверх заливки: тёмный на светлой, белый на тёмной.
function inkOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? '#0f172a' : '#ffffff';
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
  // боковой колонки (самой узкой; иначе зря отнимали бы высоту у кольца).
  const nameLines = useMemo(() => {
    const slotW = sideWidth(size.w) - 4;
    return data.some((d) => textWidth(d.name, NAME_FS) > slotW) ? 2 : 1;
  }, [data, size.w]);
  const g = useMemo(
    () => layoutRing(data, size.w, size.h, { nameLines, palette: CATEGORY_COLORS, otherColor: OTHER_COLOR }),
    [data, size.w, size.h, nameLines],
  );
  const onRing = useMemo(() => new Map(g ? g.slices.map((s) => [s.name, ringPercent(s, g)]) : []), [g]);

  // Касание сегмента/подписи: сразу подсвечивает категорию и показывает её
  // траты в центре — пока палец держится. Первые HOLD_MS решают, что это:
  // палец сдвинулся — свайп (подсветка снимается, месяц листает Home); нет —
  // удержание: подсветка ходит за пальцем по категориям, свайпа месяца нет.
  // Отпустил раньше TAP_MS, ни разу не сдвинув, — тап, onSelect (новый расход).
  const [held, setHeld] = useState(null);
  const pressRef = useRef(null); // { s, at, x, y, moved, mode: 'pending'|'hold'|'swipe', timer, cleanup }
  const holdTouch = useRef(false); // текущее касание — удержание: его touchend не до Home
  const endPress = (select) => {
    const p = pressRef.current;
    pressRef.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    p.cleanup();
    setHeld(null);
    if (select && p.mode !== 'swipe' && !p.moved && Date.now() - p.at < TAP_MS) onSelect?.(p.s);
  };
  const endRef = useRef(endPress);
  endRef.current = endPress;
  useEffect(() => () => endRef.current(false), []);
  const startPress = (e, s) => {
    if (e.button > 0) return;
    endPress(false);
    holdTouch.current = false;
    const onMove = (ev) => {
      const p = pressRef.current;
      if (!p || p.mode === 'swipe') return;
      const far = Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > LONG_PRESS_SLOP;
      if (p.mode === 'pending') {
        if (far) {
          p.mode = 'swipe';
          clearTimeout(p.timer);
          setHeld(null);
        }
        return;
      }
      if (far) p.moved = true;
      // удержание: категория под пальцем (мимо сегментов и подписей — прежняя)
      const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-cat]');
      const name = hit && ref.current?.contains(hit) ? hit.getAttribute('data-cat') : null;
      if (name) setHeld(name);
    };
    // отпускание где угодно (палец мог съехать с сегмента) — вернуть итоги
    const onUp = () => endRef.current(true);
    const onCancel = () => endRef.current(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    const timer = setTimeout(() => {
      const p = pressRef.current;
      if (p?.mode !== 'pending') return;
      p.mode = 'hold';
      holdTouch.current = true;
    }, HOLD_MS);
    pressRef.current = { s, at: Date.now(), x: e.clientX, y: e.clientY, moved: false, mode: 'pending', timer, cleanup };
    setHeld(s.name);
  };
  const pressProps = (s) => ({ 'data-cat': s.name, onPointerDown: (e) => startPress(e, s) });

  // Системный «долгий тап» (вибрация, меню, выделение) и синяя рамка касания
  // гасятся отменой touchstart на сегментах/подписях. Слушатели — нативные
  // и не passive: у React touchstart пассивный. Клик тогда не приходит —
  // тап обрабатывается по pointerup (см. endPress). touchend удержания не
  // всплывает до Home — иначе отпускание после ведения пальцем листало бы месяц.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onTouchStart = (e) => {
      holdTouch.current = false;
      if (e.target.closest?.('[data-cat]')) e.preventDefault();
    };
    const onTouchEnd = (e) => {
      if (!holdTouch.current) return;
      holdTouch.current = false;
      e.stopPropagation();
    };
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);
  // зажатая категория: сегмент или подпись отвязанной (её сумма — внутри «Другого»)
  const heldItem = held && g ? g.labels.find((l) => l.s.name === held)?.s ?? g.slices.find((s) => s.name === held) : null;
  const isHeld = (s) => s.name === held || (s.other && heldItem?.detached);

  return (
    <div className={`ring${held ? ' ring--held' : ''}`} ref={ref} onContextMenu={(e) => e.preventDefault()}>
      {g && (
        <svg width={size.w} height={size.h} className="ring__svg" role="img" aria-label="Расходы по категориям">
          {g.slices.map((s) => (
            <path
              key={s.name}
              d={arcPath(g.cx, g.cy, g.r0, isHeld(s) ? g.R + HELD_GROW : g.R, s.a0, s.a1)}
              fill={s.color}
              className={`ring__slice${isHeld(s) ? ' is-held' : ''}`}
              {...pressProps(s)}
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
                fill={inkOn(s.color)}
                className={`ring__pct-on${isHeld(s) ? ' is-held' : ''}`}
              >
                {pct.text}
              </text>
            ) : null;
          })}
          {/* Ломаная: от кольца строго по радиусу, затем к подписи (при нужде — в обход кольца). */}
          {g.labels.map(({ s, a }) => a && (
            <polyline
              key={`l-${s.name}`}
              points={a.points.map((pt) => pt.join(',')).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth="1.3"
              strokeLinejoin="round"
              className={`ring__line${s.name === held ? ' is-held' : ''}`}
            />
          ))}
          {g.labels.map((l) => {
            const { s, x, y } = l;
            const top = y - g.labelH / 2;
            const { mode } = g;
            const name = mode.name ? wrapName(s.name, l.w - 4, mode.nameLines) : null;
            // процент в подписи — только если на сегменте он не поместился
            const pctHere = onRing.get(s.name) ? null : fmtPercent(s.percent);
            const lastY = (i, all) => top + mode.icon + 9 + NAME_LINE_H * (i + (mode.nameLines - all.length) / 2);
            return (
              <g key={s.name} className={`ring__label${s.name === held ? ' is-held' : ''}`} {...pressProps(s)}>
                <title>{`${s.name}: ${formatValue(s.value)} (${fmtPercent(s.percent)})`}</title>
                {/* прозрачная подложка — чтобы тап попадал не только в буквы */}
                <rect x={x - l.w / 2} y={top} width={l.w} height={g.labelH} fill="transparent" />
                {/* процент, не влезший на сегмент, — у верхнего правого угла иконки (с обводкой цветом фона) */}
                {/* иконка — цветом категории (аутлайн Lucide или тонированный эмодзи) */}
                <CategoryIcon icon={s.icon} color={s.color} x={x} y={top + mode.icon / 2} size={mode.icon} />
                {pctHere && (
                  <text x={x + mode.icon * 0.32} y={top + 5} dominantBaseline="central" fontSize={PCT_FS} className="ring__pct" fill={s.color}>
                    {pctHere}
                  </text>
                )}
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
          {heldItem ? (
            <>
              <span className="ring__held-icon">{heldItem.icon}</span>
              <span className="donut__label ring__held-name">{heldItem.name}</span>
              <span className="donut__expense">{formatValue(heldItem.value)}</span>
              {g.r0 > 52 && <span className="donut__label">{fmtPercent(heldItem.percent)}</span>}
            </>
          ) : (
            <>
              <span className="donut__label">Расходы</span>
              <span className="donut__expense">{formatValue(center.expense)}</span>
              {g.r0 > 52 && (
                <>
                  <span className="donut__label">Доходы</span>
                  <span className="donut__income">{formatValue(center.income)}</span>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
