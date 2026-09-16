import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

// Ненавязчивый индикатор синхронизации в углу экрана:
//  - идёт синхронизация → маленький спиннер;
//  - ошибка / нужен вход → иконка ⚠, по тапу ведёт в Настройки;
//  - в покое (или синк выключен) — ничего не показываем.
export default function SyncIndicator() {
  const { syncEnabled, syncStatus, needsSignIn } = useApp();
  const navigate = useNavigate();

  if (!syncEnabled) return null;

  if (syncStatus === 'syncing') {
    return (
      <div className="sync-indicator" title="Синхронизация…" aria-label="Идёт синхронизация">
        <span className="sync-indicator__spinner" />
      </div>
    );
  }

  if (syncStatus === 'error' || needsSignIn) {
    return (
      <button
        type="button"
        className="sync-indicator sync-indicator--error"
        onClick={() => navigate('/settings')}
        title={needsSignIn ? 'Нужен вход в Google для синхронизации' : 'Ошибка синхронизации'}
        aria-label="Синхронизация требует внимания"
      >
        ⚠
      </button>
    );
  }

  return null;
}
