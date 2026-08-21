// Мультивыбор чипами. Пустой selected = «Все» (без ограничения).
export default function ChipMultiSelect({ label, options, selected, onChange }) {
  const toggle = (value) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div className="chipms">
      {label && <span className="chipms__label">{label}</span>}
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
