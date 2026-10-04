import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { COLOR_PALETTE, isColor, tintId } from '../utils/categoryColors';
import { OTHER_COLOR } from '../utils/chartColors';

// Иконки категорий (эмодзи) рисуются «бесцветными» и тонируются в цвет
// категории: SVG-фильтр переводит эмодзи в яркость и раскрашивает её в оттенки
// цвета (тени — темнее, середина — сам цвет, блики — светлее). Фильтры заводятся
// один раз на документ — по одному на цвет — и подключаются из CSS/SVG как
// url(#tint-rrggbb) (см. tintFilter в utils/categoryColors.js).
const ch = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
const r3 = (x) => Math.round(x * 1000) / 1000;

function Tint({ color }) {
  const fn = (i) => {
    const c = ch(color, i);
    return `${r3(c * 0.35)} ${r3(c)} ${r3(c + (1 - c) * 0.6)}`;
  };
  return (
    <filter id={tintId(color)} colorInterpolationFilters="sRGB">
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues={fn(0)} />
        <feFuncG type="table" tableValues={fn(1)} />
        <feFuncB type="table" tableValues={fn(2)} />
      </feComponentTransfer>
    </filter>
  );
}

export default function CategoryTints() {
  const { categories } = useApp();
  const colors = useMemo(() => {
    const all = [...COLOR_PALETTE, OTHER_COLOR, ...categories.map((c) => c.color)].filter(isColor).map((c) => c.toLowerCase());
    return [...new Set(all)];
  }, [categories]);
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>{colors.map((c) => <Tint key={c} color={c} />)}</defs>
    </svg>
  );
}
