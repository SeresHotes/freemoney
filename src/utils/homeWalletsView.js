// ВРЕМЕННО: варианты показа кошельков на главной — выбираются в настройках,
// чтобы сравнить вживую. Когда определимся, оставить один и удалить этот файл.
export const HOME_WALLETS_VIEWS = {
  open: 'Как было: балансы видны',
  eye: 'Скрыты «••••», глаз в шапке показывает',
  blur: 'Размыты, удержание пальцем показывает',
  names: 'Только названия, без балансов',
  popup: 'Список: кнопка внизу, на месте ленты',
  'popup-head': 'Список: кнопка в шапке, справа от названия',
  'popup-month': 'Список: кнопка под месяцем',
  'popup-actions': 'Список: кнопка между Расходом и Доходом',
  'popup-tile': 'Список: пятая плитка рядом с Переводом',
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
