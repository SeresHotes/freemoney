// ВРЕМЕННО: варианты показа кошельков на главной — выбираются в настройках,
// чтобы сравнить вживую. Когда определимся, оставить один и удалить этот файл.
export const HOME_WALLETS_VIEWS = {
  open: 'Как было: балансы видны',
  eye: 'Скрыты «••••», глаз в шапке показывает',
  blur: 'Размыты, удержание пальцем показывает',
  names: 'Только названия, без балансов',
  collapsed: 'Свёрнуто в одну кнопку, тап раскрывает',
};

const LS_HOME_WALLETS_VIEW = 'freemoney:homeWalletsView';
const DEFAULT_VIEW = 'eye';

export function readHomeWalletsView() {
  try {
    const v = localStorage.getItem(LS_HOME_WALLETS_VIEW);
    return v in HOME_WALLETS_VIEWS ? v : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

export function writeHomeWalletsView(v) {
  try {
    localStorage.setItem(LS_HOME_WALLETS_VIEW, v);
  } catch {
    /* без хранилища — до перезапуска */
  }
}
