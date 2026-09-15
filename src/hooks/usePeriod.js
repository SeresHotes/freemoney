import { useMemo } from 'react';
import { monthKey, monthRange, shiftMonth, todayIso } from '../utils/format';

// Общая логика выбора периода для страниц статистики и операций.
// Режим и границы храним в URL: mode=month|year|custom|all + from/to.
// defaultMode — режим по умолчанию, когда в URL ничего не задано
// ('month' для статистики, 'all' для операций).
// Старые ссылки (all=1 / голые from-to без mode) остаются совместимыми.
export function usePeriod({ searchParams, setSearchParams, transactions, defaultMode = 'all' }) {
  const today = todayIso();
  const curMonthKey = monthKey(today);
  const curYear = today.slice(0, 4);

  const rawFrom = searchParams.get('from');
  const rawTo = searchParams.get('to');
  const hasCustom = rawFrom != null || rawTo != null;
  const legacyAll = searchParams.get('all') === '1';

  const mode = searchParams.get('mode') || (legacyAll ? 'all' : hasCustom ? 'custom' : defaultMode);

  // Активный месяц/год для листалки: берём из from, иначе — текущий.
  const monthSel = rawFrom ? monthKey(rawFrom) : curMonthKey;
  const yearSel = rawFrom ? rawFrom.slice(0, 4) : curYear;

  // Границы диапазона, единые для всей фильтрации на странице.
  let from = '';
  let to = '';
  if (mode === 'month') ({ from, to } = monthRange(monthSel));
  else if (mode === 'year') { from = `${yearSel}-01-01`; to = `${yearSel}-12-31`; }
  else if (mode === 'custom') { from = rawFrom || ''; to = rawTo || ''; }
  // mode === 'all' — пустые границы (весь период).

  const update = (mutate) => {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next, { replace: true });
  };
  const applyMonth = (n, key) => {
    const r = monthRange(key);
    n.delete('all'); n.set('mode', 'month'); n.set('from', r.from); n.set('to', r.to);
  };
  const applyYear = (n, year) => {
    n.delete('all'); n.set('mode', 'year'); n.set('from', `${year}-01-01`); n.set('to', `${year}-12-31`);
  };
  // Переключение режима. При входе в month/year выбираем ТЕКУЩИЙ месяц/год.
  const setMode = (m) => update((n) => {
    if (m === 'month') applyMonth(n, curMonthKey);
    else if (m === 'year') applyYear(n, curYear);
    else if (m === 'all') { n.delete('all'); n.set('mode', 'all'); n.delete('from'); n.delete('to'); }
    else { n.delete('all'); n.set('mode', m); }
  });
  // Листалка стрелками и выбор конкретного периода тапом.
  const stepMonth = (delta) => update((n) => applyMonth(n, shiftMonth(monthSel, delta)));
  const stepYear = (delta) => update((n) => applyYear(n, String(Number(yearSel) + delta)));
  const pickMonth = (key) => update((n) => applyMonth(n, key));
  const pickYear = (year) => update((n) => applyYear(n, year));
  // Правка одной границы произвольного диапазона.
  const setBound = (key, val) => update((n) => {
    n.delete('all'); n.set('mode', 'custom');
    if (from) n.set('from', from); else n.delete('from');
    if (to) n.set('to', to); else n.delete('to');
    if (val) n.set(key, val); else n.delete(key);
  });

  // Годы для выпадающего выбора: от самой ранней операции до текущего года.
  const yearOptions = useMemo(() => {
    let min = Number(curYear);
    for (const t of transactions) {
      const y = Number((t.date || '').slice(0, 4));
      if (y && y < min) min = y;
    }
    const arr = [];
    for (let y = Number(curYear); y >= min; y--) arr.push(String(y));
    return arr;
  }, [transactions, curYear]);

  return {
    mode, from, to, monthSel, yearSel, yearOptions,
    setMode, stepMonth, stepYear, pickMonth, pickYear, setBound,
  };
}
