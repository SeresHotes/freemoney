import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Главная', icon: '🏠', end: true },
  { to: '/categories', label: 'Категории', icon: '🏷️' },
  { to: '/stats', label: 'Статистика', icon: '📊' },
];

export default function NavBar() {
  return (
    <nav className="navbar">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `navbar__item${isActive ? ' navbar__item--active' : ''}`}
        >
          <span className="navbar__icon">{item.icon}</span>
          <span className="navbar__label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
