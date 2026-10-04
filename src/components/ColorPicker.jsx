import { COLOR_PALETTE, PALETTE_COLUMNS } from '../utils/categoryColors';

// Палитра цветов категории (раскрывается по квадратику-кнопке с текущим цветом).
export default function ColorPicker({ value, onChange }) {
  return (
    <div
      className="color-palette"
      role="listbox"
      aria-label="Палитра"
      style={{ gridTemplateColumns: `repeat(${PALETTE_COLUMNS}, 1fr)` }}
    >
      {COLOR_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          role="option"
          aria-label={c}
          aria-selected={c === value}
          className={`color-palette__item${c === value ? ' color-palette__item--active' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}
