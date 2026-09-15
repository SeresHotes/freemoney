import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { monthKey, monthLabel, dayLabel, todayIso, compactNumber, monthRange, rangeLabel } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import {
  isIncome, isExpense, matchesFilters,
  buildCategoryTimeSeries, expenseTotalsByCategory,
} from '../utils/finance';
import { useBaseRates } from '../hooks/useBaseRates';
import ChipMultiSelect from '../components/ChipMultiSelect';
import CategoryTrendChart from '../components/CategoryTrendChart';
import CategoryDonut from '../components/CategoryDonut';
import { CATEGORY_COLORS as COLORS, buildCategorySeries } from '../utils/chartColors';

export default function Stats() {
  const { transactions, categories, wallets, tags, baseCurrency } = useApp();
  const { toBase } = useBaseRates(baseCurrency);
  const navigate = useNavigate();
  // Фильтры и период храним в URL — так они сохраняются при переходе к операциям и возврате назад.
  const [searchParams, setSearchParams] = useSearchParams();

  const cats = searchParams.getAll('category');
  const tagSel = searchParams.getAll('tag');
  const wals = searchParams.getAll('wallet');
  const granularity = searchParams.get('granularity') || 'day';

  // Диапазон дат по умолчанию — текущий календарный месяц.
  const today = todayIso();
  const curMonth = monthRange(monthKey(today));
  const yearRange = { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };

  const isAll = searchParams.get('all') === '1';
  const rawFrom = searchParams.get('from');
  const rawTo = searchParams.get('to');
  const hasCustom = rawFrom != null || rawTo != null;
  const from = isAll ? '' : hasCustom ? (rawFrom || '') : curMonth.from;
  const to = isAll ? '' : hasCustom ? (rawTo || '') : curMonth.to;

  const update = (mutate) => {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next, { replace: true });
  };
  const setArr = (key, arr) => update((n) => { n.delete(key); arr.forEach((v) => n.append(key, v)); });
  const setSingle = (key, val) => update((n) => { if (val) n.set(key, val); else n.delete(key); });
  const setRange = (f, t) => update((n) => {
    n.delete('all');
    if (f) n.set('from', f); else n.delete('from');
    if (t) n.set('to', t); else n.delete('to');
  });
  const setAllTime = () => update((n) => { n.delete('from'); n.delete('to'); n.set('all', '1'); });
  // Правка одной границы: фиксируем обе текущие границы в URL, затем применяем изменение.
  const setBound = (key, val) => update((n) => {
    n.delete('all');
    if (from) n.set('from', from); else n.delete('from');
    if (to) n.set('to', to); else n.delete('to');
    if (val) n.set(key, val); else n.delete(key);
  });

  const activePreset =
    isAll ? 'all'
    : from === curMonth.from && to === curMonth.to ? 'month'
    : from === yearRange.from && to === yearRange.to ? 'year'
    : 'custom';

  // Переход к операциям: категория + активные фильтры и период статистики.
  const openCategory = (name) => {
    const p = new URLSearchParams();
    p.append('category', name);
    wals.forEach((w) => p.append('wallet', w));
    tagSel.forEach((t) => p.append('tag', t));
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    navigate(`/transactions?${p.toString()}`);
  };

  const activeWallets = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);
  const catOptions = useMemo(() => categories.map((c) => ({ value: c.name, label: `${c.icon} ${c.name}` })), [categories]);
  const walletOptions = useMemo(() => activeWallets.map((w) => ({ value: w.id, label: w.name })), [activeWallets]);
  const tagOptions = useMemo(() => {
    const set = new Set(tags);
    for (const t of transactions) (t.tags || []).forEach((x) => set.add(x));
    return [...set].sort().map((t) => ({ value: t, label: `#${t}` }));
  }, [tags, transactions]);

  const singleWallet = wals.length === 1 ? activeWallets.find((w) => w.id === wals[0]) : null;
  const displayCurrency = singleWallet ? singleWallet.currency : baseCurrency;
  const toDisplay = (t) => (singleWallet ? t.amount : toBase(t.amount, t.currency));

  // Все операции, попадающие под фильтры и выбранный диапазон дат.
  const scoped = useMemo(
    () =>
      transactions.filter(
        (t) =>
          (isIncome(t) || isExpense(t)) &&
          matchesFilters(t, { categories: cats, tags: tagSel, wallets: wals, from, to }),
      ),
    [transactions, cats, tagSel, wals, from, to],
  );

  const income = scoped.filter(isIncome).reduce((s, t) => s + (toDisplay(t) || 0), 0);
  const expense = scoped.filter(isExpense).reduce((s, t) => s + (toDisplay(t) || 0), 0);

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const t of scoped) {
      if (!isExpense(t)) continue;
      const v = toDisplay(t);
      if (v == null) continue;
      map.set(t.category || 'Без категории', (map.get(t.category) || 0) + v);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [scoped, singleWallet, toBase]);

  // Топ категорий расходов за период (для цветов и стек-графика).
  const { series, catTrend } = useMemo(() => {
    const totals = expenseTotalsByCategory(scoped, toDisplay);
    const { top, series: seriesList } = buildCategorySeries(totals);

    const raw = buildCategoryTimeSeries(scoped, granularity, toDisplay, top);
    // Ограничение числа столбцов, чтобы график не разрастался на больших диапазонах.
    const maxBars = granularity === 'day' ? 62 : 24;
    const sliced = raw.length > maxBars ? raw.slice(-maxBars) : raw;
    const data = sliced.map((b) => ({
      ...b,
      label: granularity === 'day' ? dayLabel(b.key) : monthLabel(b.key).replace(/ \d{4}$/, ''),
    }));
    return { series: seriesList, catTrend: data };
  }, [scoped, granularity, singleWallet, toBase]);

  const fmt = (v) => formatAmount(v, displayCurrency);
  const periodLabel = rangeLabel(from, to);

  return (
    <div className="page">
      <header className="page__header"><h1>Статистика</h1></header>

      <div className="filters">
        <ChipMultiSelect label="Кошельки" options={walletOptions} selected={wals} onChange={(a) => setArr('wallet', a)} />
        <ChipMultiSelect label="Категории" options={catOptions} selected={cats} onChange={(a) => setArr('category', a)} />
        {tagOptions.length > 0 && (
          <ChipMultiSelect label="Теги" options={tagOptions} selected={tagSel} onChange={(a) => setArr('tag', a)} />
        )}
        <div className="chipms">
          <span className="chipms__label">Период</span>
          <div className="seg">
            <button className={`seg__btn${activePreset === 'month' ? ' seg__btn--active' : ''}`} onClick={() => setRange(curMonth.from, curMonth.to)}>Месяц</button>
            <button className={`seg__btn${activePreset === 'year' ? ' seg__btn--active' : ''}`} onClick={() => setRange(yearRange.from, yearRange.to)}>Год</button>
            <button className={`seg__btn${activePreset === 'all' ? ' seg__btn--active' : ''}`} onClick={setAllTime}>Всё время</button>
          </div>
          <div className="filters__dates">
            <input className="field__input" type="date" value={from} onChange={(e) => setBound('from', e.target.value)} />
            <span className="muted">—</span>
            <input className="field__input" type="date" value={to} onChange={(e) => setBound('to', e.target.value)} />
          </div>
        </div>
      </div>

      <section>
        <h2 className="section-title">Сводка · {periodLabel}</h2>
        <div className="stats-summary" style={{ marginTop: '0.75rem' }}>
          <div className="stats-summary__cell"><span className="muted">Доходы</span><strong className="tx-item__amount--income">{fmt(income)}</strong></div>
          <div className="stats-summary__cell"><span className="muted">Расходы</span><strong className="tx-item__amount--expense">{fmt(expense)}</strong></div>
          <div className="stats-summary__cell"><span className="muted">Баланс</span><strong>{fmt(income - expense)}</strong></div>
        </div>
      </section>

      <section>
        <h2 className="section-title">Расходы по категориям · {periodLabel}</h2>
        {byCategory.length === 0 ? (
          <p className="muted empty">Нет расходов за период</p>
        ) : (
          <>
            <CategoryDonut
              data={byCategory}
              colors={COLORS}
              center={{ expense, income }}
              formatValue={(v) => fmt(v)}
            />
            <ul className="legend">
              {byCategory.map((c, i) => (
                <li key={c.name} className="legend__item legend__item--clickable" onClick={() => openCategory(c.name)}>
                  <span className="legend__dot" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="legend__name">{c.name}</span>
                  <span className="legend__value">{fmt(c.value)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <div className="seg">
          <button className={`seg__btn${granularity === 'day' ? ' seg__btn--active' : ''}`} onClick={() => setSingle('granularity', 'day')}>По дням</button>
          <button className={`seg__btn${granularity === 'month' ? ' seg__btn--active' : ''}`} onClick={() => setSingle('granularity', 'month')}>По месяцам</button>
        </div>
        <h2 className="section-title">
          Динамика расходов · {periodLabel} · {displayCurrency}
        </h2>
        {catTrend.length === 0 ? (
          <p className="muted empty">Нет данных за период</p>
        ) : (
          <>
            <CategoryTrendChart data={catTrend} series={series} formatValue={(v) => fmt(v)} formatAxis={compactNumber} />
            <ul className="legend">
              {series.map((s) => {
                const clickable = s.name !== 'Другое';
                return (
                  <li
                    key={s.name}
                    className={`legend__item${clickable ? ' legend__item--clickable' : ''}`}
                    onClick={clickable ? () => openCategory(s.name) : undefined}
                  >
                    <span className="legend__dot" style={{ background: s.color }} />
                    <span className="legend__name">{s.name}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
