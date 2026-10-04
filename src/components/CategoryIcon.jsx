import { tintFilter } from '../utils/categoryColors';

// Иконка категории, тонированная в её цвет (см. CategoryTints).
export default function CategoryIcon({ icon, color, className }) {
  return (
    <span className={`cat-icon${className ? ` ${className}` : ''}`} style={{ filter: tintFilter(color) }}>
      {icon}
    </span>
  );
}
