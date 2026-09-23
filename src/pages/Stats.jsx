import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { monthLabel, dayLabel, compactNumber, rangeLabel } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import {
  isIncome, isExpense, matchesFilters,
  buildCategoryTimeSeries, expenseTotalsByCategory,
} from '../utils/finance';
import { useBaseRates } from '../hooks/useBaseRates';
import { usePeriod } from '../hooks/usePeriod';
import ChipMultiSelect from '../components/ChipMultiSelect';
import PeriodPicker from '../components/PeriodPicker';
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

  // Период по умолчанию — текущий месяц.
  const period = usePeriod({ searchParams, setSearchParams, transactions, defaultMode: 'month' });
  const { from, to } = period;

  // Гранулярность нижнего графика по умолчанию подбираем по периоду;
  // «всё время» -> по годам, длинный диапазон -> по месяцам, короткий -> по дням.
  // Явный выбор пользователя (?granularity=) всегда в приоритете.
  const spanDays = from && to ? Math.round((new Date(to) - new Date(from)) / 86400000) + 1 : Infinity;
  const autoGranularity = period.mode === 'all' ? 'year' : spanDays > 92 ? 'month' : 'day';
  const granularity = searchParams.get('granularity') || autoGranularity;

  const update = (mutate) => {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next, { replace: true });
  };
  const setArr = (key, arr) => update((n) => { n.delete(key); arr.forEach((v) => n.append(key, v)); });
  const setSingle = (key, val) => update((n) => { if (val) n.set(key, val); else n.delete(key); });

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

  const activeWallets = useMemo(() => wallets.filter((w) => !w.archived), [wallets]);
  const activeCategories = useMemo(() => categories.filter((c) => !c.archived), [categories]);
  const catOptions = useMemo(() => activeCategories.map((c) => ({ value: c.name, label: `${c.icon} ${c.name}` })), [activeCategories]);
  const walletOptions = useMemo(() => activeWallets.map((w) => ({ value: w.name, label: w.name })), [activeWallets]);
  const tagOptions = useMemo(() => {
    const set = new Set(tags.filter((t) => !t.archived).map((t) => t.name));
    return [...set].sort().map((t) => ({ value: t, label: t }));
  }, [tags]);

  const singleWallet = wals.length === 1 ? activeWallets.find((w) => w.name === wals[0]) : null;
  const displayCurrency = singleWallet ? singleWallet.currency : baseCurrency;
  // Для сумм и графиков нужна ВЕЛИЧИНА (amount теперь знаковый: расход < 0).
  // Доход/расход разводятся по типу, поэтому по модулю — корректно для всех агрегатов.
  const toDisplay = (t) => {
    const v = singleWallet ? t.amount : toBase(t.amount, t.currency);
    return v == null ? null : Math.abs(v);
  };

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
      label: granularity === 'day' ? dayLabel(b.key)
        : granularity === 'year' ? b.key
        : monthLabel(b.key).replace(/ \d{4}$/, ''),
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
        <PeriodPicker period={period} />
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
          <button className={`seg__btn${granularity === 'year' ? ' seg__btn--active' : ''}`} onClick={() => setSingle('granularity', 'year')}>По годам</button>
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
