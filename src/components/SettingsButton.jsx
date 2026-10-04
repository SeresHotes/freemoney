import { NavLink, useLocation } from 'react-router-dom';

// Экраны нижнего меню — на них в правом верхнем углу есть шестерёнка
// «Настройки». На внутренних экранах (формы, правка) её нет: там слева
// «Назад», и лишняя кнопка только мешает.
const TAB_ROUTES = ['/', '/transactions', '/wallets', '/stats', '/categories'];

export default function SettingsButton() {
  const { pathname } = useLocation();
  if (!TAB_ROUTES.includes(pathname)) return null;
  return (
    <NavLink to="/settings" className="settings-btn" aria-label="Настройки" title="Настройки">
      ⚙️
    </NavLink>
  );
}
