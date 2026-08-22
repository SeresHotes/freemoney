// Вспомогательные функции форматирования.

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

export function formatMoney(value) {
  return moneyFormatter.format(value || 0);
}

// Дата в формате YYYY-MM-DD (для input[type=date] и хранения).
export function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

// Текущее локальное время в формате HH:MM.
export function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Ключ месяца YYYY-MM из ISO-даты.
export function monthKey(isoDate) {
  return (isoDate || '').slice(0, 7);
}

// Диапазон дат месяца по ключу "YYYY-MM": { from: '...-01', to: '...-31' }.
export function monthRange(key) {
  if (!key) return { from: '', to: '' };
  const [year, month] = key.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${String(lastDay).padStart(2, '0')}` };
}

// Человекочитаемое название месяца: "2026-08" -> "август 2026".
export function monthLabel(key) {
  if (!key) return '';
  const [year, month] = key.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

// Дата N дней назад в формате YYYY-MM-DD.
export function daysAgoIso(n) {
  const now = new Date();
  now.setDate(now.getDate() - n);
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

// Короткая подпись дня: "2026-08-21" -> "21.08".
export function dayLabel(iso) {
  const [, m, d] = (iso || '').split('-');
  return d && m ? `${d}.${m}` : iso;
}

// Компактное число для оси графика: 1500 -> «1,5 тыс.», 20000 -> «20 тыс.».
const compactFormatter = new Intl.NumberFormat('ru-RU', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
export function compactNumber(value) {
  return compactFormatter.format(value || 0);
}

export function newId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}
