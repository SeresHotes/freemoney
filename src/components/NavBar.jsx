import { NavLink } from 'react-router-dom';

// «Главная» — посередине, большой круглой кнопкой (центр — самое удобное
// место под большой палец). Заголовков у вкладок нет — где ты, видно здесь.
const items = [
  { to: '/transactions', label: 'Операции', icon: '📋' },
  { to: '/wallets', label: 'Кошельки', icon: '👛' },
  { to: '/', label: 'Главная', icon: '🏠', end: true, home: true },
  { to: '/stats', label: 'Статистика', icon: '📊' },
  { to: '/settings', label: 'Ещё', icon: '⚙️' },
];

export default function NavBar() {
  return (
    <nav className="navbar">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          aria-label={item.label}
          className={({ isActive }) =>
            `navbar__item${item.home ? ' navbar__item--home' : ''}${isActive ? ' navbar__item--active' : ''}`
          }
        >
          <span className="navbar__icon">{item.icon}</span>
          {!item.home && <span className="navbar__label">{item.label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
