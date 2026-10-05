import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useExperiment } from '../utils/experiments';

// Экраны нижнего меню — на них в правом верхнем углу есть шестерёнка
// «Настройки». На внутренних экранах (формы, правка) её нет: там слева
// «Назад», и лишняя кнопка только мешает.
const TAB_ROUTES = ['/', '/transactions', '/wallets', '/stats', '/categories'];

export function useIsTabRoute() {
  return TAB_ROUTES.includes(useLocation().pathname);
}

export default function SettingsButton() {
  const { syncEnabled, syncStatus, needsSignIn } = useApp();
  const syncView = useExperiment('syncIndicator');
  if (!useIsTabRoute()) return null;

  // Вариант «badge»: синхронизация — кольцом вокруг шестерёнки, ошибка —
  // красной точкой (сама шестерёнка и так ведёт в настройки синхронизации).
  const badge = syncView === 'badge' && syncEnabled;
  const syncing = badge && syncStatus === 'syncing';
  const problem = badge && !syncing && (syncStatus === 'error' || needsSignIn);
  const title = syncing
    ? 'Настройки · идёт синхронизация'
    : problem
      ? needsSignIn ? 'Настройки · нужен вход в Google для синхронизации' : 'Настройки · ошибка синхронизации'
      : 'Настройки';

  return (
    <NavLink
      to="/settings"
      className={`settings-btn${syncing ? ' settings-btn--syncing' : ''}`}
      aria-label={title}
      title={title}
    >
      ⚙️
      {problem && <span className="settings-btn__badge" />}
    </NavLink>
  );
}
