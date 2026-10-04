import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { tintFilter } from '../utils/categoryColors';
import { ensureArt, getArt } from '../utils/emojiArt';

// Рисовка эмодзи в выбранном стиле; если её группа ещё не загружена — грузит и перерисовывается.
function useArt(style, icon) {
  const [, setTick] = useState(0);
  const a = getArt(style, icon);
  useEffect(() => {
    if (a !== undefined) return undefined;
    let alive = true;
    ensureArt(style, [icon]).then(() => { if (alive) setTick((t) => t + 1); });
    return () => { alive = false; };
  }, [a, style, icon]);
  return a;
}

// Иконка категории — эмодзи, нарисованный выбранным стилем (настройка «Стиль
// иконок»): одноцветные стили — цветом категории (без цвета — цветом текста),
// цветной и «Системные эмодзи» — своими цветами. Нет рисовки — системный эмодзи,
// тонированный в цвет категории (см. CategoryTints). В SVG (кольцо главной) — x/y/size: иконка
// рисуется вложенным <svg> с центром в (x, y).
// iconStyle — нарисовать другим стилем, а не выбранным (превью в настройках).
export default function CategoryIcon({ icon, color, className, x, y, size, iconStyle }) {
  const app = useApp();
  const style = iconStyle || app.iconStyle;
  const a = useArt(style, icon);
  const cls = `cat-icon${className ? ` ${className}` : ''}`;
  const inSvg = size != null;

  if (a) {
    const [w, h, body] = a.art;
    const box = inSvg
      ? { x: x - size / 2, y: y - size / 2, width: size, height: size }
      : { width: '1em', height: '1em' };
    return (
      <svg
        {...box}
        viewBox={`0 0 ${w} ${h}`}
        className={`${cls} cat-icon--art`}
        style={a.tint && color ? { color } : undefined}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    );
  }
  // Пока рисовка грузится — пустое место того же размера, без мигания эмодзи.
  const pending = a === undefined;
  // Стиль «Системные эмодзи» — родными цветами эмодзи, без тонировки. Иначе
  // системный эмодзи — запасной вариант без рисовки: в цвет категории; без
  // цвета — серым (чтобы не выбивался из одноцветного стиля).
  const filter = style === 'native' ? undefined : color ? tintFilter(color) : 'grayscale(1)';
  if (inSvg) {
    return pending ? null : (
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.9} style={{ filter }}>
        {icon}
      </text>
    );
  }
  return (
    <span className={cls} style={{ filter, visibility: pending ? 'hidden' : undefined }}>
      {icon}
    </span>
  );
}
