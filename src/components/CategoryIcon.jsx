import { useEffect, useState } from 'react';
import { tintFilter } from '../utils/categoryColors';
import { isLucide, loadLucideData, lucideSvg } from '../utils/icons';

// Контур Lucide; если он ещё не загружен — догружает полный набор и перерисовывается.
function useLucideSvg(icon) {
  const [, setTick] = useState(0);
  const svg = isLucide(icon) ? lucideSvg(icon) : null;
  const pending = isLucide(icon) && svg == null;
  useEffect(() => {
    if (!pending) return undefined;
    let alive = true;
    loadLucideData().then(() => { if (alive) setTick((t) => t + 1); }, () => {});
    return () => { alive = false; };
  }, [pending]);
  return svg;
}

const LINE = {
  viewBox: '0 0 24 24', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
};

// Иконка категории: аутлайн Lucide — линией цвета категории (без цвета — текущим
// цветом текста); эмодзи — тонированный в цвет категории (см. CategoryTints).
// В SVG (кольцо главной) — x/y/size: иконка рисуется вложенным <svg> с центром в (x, y).
export default function CategoryIcon({ icon, color, className, x, y, size }) {
  const svg = useLucideSvg(icon);
  const cls = `cat-icon${className ? ` ${className}` : ''}`;
  if (isLucide(icon)) {
    const box = size != null
      ? { x: x - size / 2, y: y - size / 2, width: size, height: size }
      : { width: '1em', height: '1em' };
    return (
      <svg
        {...LINE}
        {...box}
        className={`${cls} cat-icon--line`}
        stroke={color || 'currentColor'}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: svg || '' }}
      />
    );
  }
  if (size != null) {
    return (
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central" fontSize={size} filter={tintFilter(color)}>
        {icon}
      </text>
    );
  }
  return <span className={cls} style={{ filter: tintFilter(color) }}>{icon}</span>;
}
