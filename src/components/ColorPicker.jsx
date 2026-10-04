import { useState } from 'react';
import { COLOR_PALETTE } from '../utils/categoryColors';

// Квадратик с текущим цветом; по нажатию раскрывается палитра.
export default function ColorPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="color-swatch"
        style={{ background: value }}
        aria-label="Цвет категории"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="color-palette" role="listbox" aria-label="Палитра">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={c === value}
              className={`color-palette__item${c === value ? ' color-palette__item--active' : ''}`}
              style={{ background: c }}
              onClick={() => { onChange(c); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </>
  );
}
