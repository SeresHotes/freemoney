// Мультивыбор чипами. Пустой selected = «Все» (без ограничения).
export default function ChipMultiSelect({ label, options, selected, onChange }) {
  const toggle = (value) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };
  // Инвертировать: выбрать всё, кроме текущего выбора (удобно для «все кроме пары»).
  const invert = () => onChange(options.filter((o) => !selected.includes(o.value)).map((o) => o.value));

  return (
    <div className="chipms">
      <div className="chipms__head">
        {label && <span className="chipms__label">{label}</span>}
        {selected.length > 0 && (
          <button type="button" className="link-btn-inline chipms__invert" onClick={invert}>
            инвертировать
          </button>
        )}
      </div>
      <div className="chipms__row">
        <button
          type="button"
          className={`tag-chip${selected.length === 0 ? ' tag-chip--active' : ''}`}
          onClick={() => onChange([])}
        >
          Все
        </button>
        {options.map((o) => (
          <button
            type="button"
            key={o.value}
            className={`tag-chip${selected.includes(o.value) ? ' tag-chip--active' : ''}`}
            onClick={() => toggle(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
