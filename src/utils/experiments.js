import { useEffect, useState } from 'react';

// ВРЕМЕННО: экспериментальные варианты интерфейса — выбираются в настройках
// (только на этом устройстве), чтобы сравнить вживую. Когда определимся,
// оставить выбранное и удалить этот файл вместе с секцией в настройках.
export const EXPERIMENTS = {
  topCorner: {
    label: 'Меню и синхронизация',
    default: 'ring',
    options: {
      ring: 'Кольцо и точка на ☰, тап — настройки',
      menu: 'Кольцо и точка на ☰, тап — меню со статусом',
      bar: 'Полоска по верху экрана',
      pill: 'Плашка снизу над навбаром',
    },
  },
};

const lsKey = (key) => `freemoney:exp:${key}`;
const EVENT = 'freemoney:experiments';

export function readExperiment(key) {
  const exp = EXPERIMENTS[key];
  try {
    const v = localStorage.getItem(lsKey(key));
    return v && v in exp.options ? v : exp.default;
  } catch {
    return exp.default;
  }
}

export function writeExperiment(key, value) {
  try {
    localStorage.setItem(lsKey(key), value);
  } catch {
    /* без хранилища — до перезапуска не переживёт */
  }
  window.dispatchEvent(new Event(EVENT));
}

// Текущее значение, обновляется сразу после смены в настройках.
export function useExperiment(key) {
  const [value, setValue] = useState(() => readExperiment(key));
  useEffect(() => {
    const update = () => setValue(readExperiment(key));
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, [key]);
  return value;
}
