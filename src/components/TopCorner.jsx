import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { agoLabel } from '../utils/format';
import { useExperiment } from '../utils/experiments';

// Экраны нижнего меню — на них в правом верхнем углу кнопка меню «☰»
// (ведёт в настройки). На внутренних экранах (формы, правка, сами настройки)
// её нет: там слева «Назад», и лишняя кнопка только мешает.
const TAB_ROUTES = ['/', '/transactions', '/wallets', '/stats', '/categories'];

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.4 9.2 4.4 4.4 0 0 0 7 18z" />
    </svg>
  );
}

// Статус синхронизации для всех вариантов.
function useSyncState() {
  const { syncEnabled, syncStatus, needsSignIn, syncError, lastSyncAt, syncNow } = useApp();
  const syncing = syncEnabled && syncStatus === 'syncing';
  const problem = syncEnabled && !syncing && (syncStatus === 'error' || needsSignIn);
  const note = syncing
    ? 'идёт синхронизация'
    : problem ? (needsSignIn ? 'нужен вход в Google для синхронизации' : 'ошибка синхронизации') : '';
  return { syncEnabled, syncing, problem, note, needsSignIn, syncError, lastSyncAt, syncNow };
}

// Выпадающее меню под кнопкой ☰ (вариант «menu»): статус синхронизации,
// «Синхронизировать сейчас», «Настройки». Закрывается тапом мимо.
function CornerMenu({ sync, onClose }) {
  const navigate = useNavigate();
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => {
      if (ref.current && !ref.current.parentNode.contains(e.target)) onClose();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [onClose]);
  const status = !sync.syncEnabled
    ? 'Синхронизация выключена'
    : sync.syncing ? 'Идёт синхронизация…'
      : sync.problem ? sync.syncError || (sync.needsSignIn ? 'Нужен вход в Google' : 'Ошибка синхронизации')
        : `Синхронизировано ${agoLabel(sync.lastSyncAt)}`;
  return (
    <div className="corner-menu" ref={ref}>
      <div className={`corner-menu__status${sync.problem ? ' corner-menu__status--error' : ''}`}>
        <CloudIcon /> <span>{status}</span>
      </div>
      {sync.syncEnabled && (
        <button className="corner-menu__item" disabled={sync.syncing} onClick={() => sync.syncNow()}>
          ⟳ Синхронизировать сейчас
        </button>
      )}
      <button className="corner-menu__item" onClick={() => { onClose(); navigate('/settings'); }}>
        ⚙️ Настройки
      </button>
    </div>
  );
}

// Правый верхний угол (внутри прокручиваемой области — уезжает со страницей).
// ВРЕМЕННО: как показывать синхронизацию — флаг topCorner (utils/experiments):
//  - ring / menu: кольцо (идёт синхронизация) и красная точка (ошибка) на ☰;
//    на экранах без ☰ — облако с тем же статусом. ring: тап — настройки,
//    menu: тап — выпадающее меню;
//  - bar / pill: ☰ без статуса, статус — SyncStatusExtra.
export default function TopCorner() {
  const variant = useExperiment('topCorner');
  const sync = useSyncState();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);

  const onButton = variant === 'ring' || variant === 'menu';
  const cls = `corner-btn${onButton && sync.syncing ? ' corner-btn--syncing' : ''}`;
  const badge = onButton && sync.problem && <span className="corner-btn__badge" />;

  if (TAB_ROUTES.includes(pathname)) {
    const title = onButton && sync.note ? `Меню · ${sync.note}` : 'Меню';
    return (
      <div className="top-corner">
        <button
          type="button"
          className={cls}
          aria-label={title}
          title={title}
          aria-expanded={variant === 'menu' ? menuOpen : undefined}
          onClick={() => (variant === 'menu' ? setMenuOpen(!menuOpen) : navigate('/settings'))}
        >
          <MenuIcon />
          {badge}
        </button>
        {menuOpen && <CornerMenu sync={sync} onClose={() => setMenuOpen(false)} />}
      </div>
    );
  }

  if (!onButton || !sync.note) return null;
  const title = sync.note[0].toUpperCase() + sync.note.slice(1);
  const clickable = sync.problem && pathname !== '/settings';
  return (
    <div className="top-corner">
      <button
        type="button"
        className={`${cls}${clickable ? '' : ' corner-btn--static'}`}
        aria-label={title}
        title={title}
        onClick={clickable ? () => navigate('/settings') : undefined}
      >
        <CloudIcon />
        {badge}
      </button>
    </div>
  );
}

// Статус синхронизации отдельно от кнопки — одинаковый на всех экранах:
//  - bar: тонкая полоска по верху экрана (бежит — синхронизация, красная — ошибка);
//  - pill: плашка над навбаром («Синхронизация…» / «Ошибка ›» — в настройки).
export function SyncStatusExtra() {
  const variant = useExperiment('topCorner');
  const sync = useSyncState();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!sync.note) return null;

  if (variant === 'bar') {
    return (
      <div
        className={`sync-bar${sync.problem ? ' sync-bar--error' : ''}`}
        role="status"
        aria-label={sync.note}
        title={sync.note}
      />
    );
  }

  if (variant === 'pill') {
    const clickable = sync.problem && pathname !== '/settings';
    return (
      <button
        type="button"
        className={`sync-pill${sync.problem ? ' sync-pill--error' : ''}`}
        role="status"
        onClick={clickable ? () => navigate('/settings') : undefined}
      >
        {sync.syncing ? <span className="sync-pill__spinner" /> : '⚠'}
        <span>{sync.syncing ? 'Синхронизация…' : sync.needsSignIn ? 'Нужен вход в Google' : 'Ошибка синхронизации'}</span>
        {clickable && <span aria-hidden="true">›</span>}
      </button>
    );
  }

  return null;
}
