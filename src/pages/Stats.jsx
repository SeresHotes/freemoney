import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useApp } from '../context/AppContext';
import { monthKey, monthLabel, dayLabel, todayIso, compactNumber } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import {
  isIncome, isExpense, matchesFilters,
  buildCategoryTimeSeries, expenseTotalsByCategory,
} from '../utils/finance';
import { useBaseRates } from '../hooks/useBaseRates';
import ChipMultiSelect from '../components/ChipMultiSelect';
import CategoryTrendChart from '../components/CategoryTrendChart';
import { CATEGORY_COLORS as COLORS, buildCategorySeries } from '../utils/chartColors';

export default function Stats() {
  const { transactions, categories, wallets, tags, baseCurrency } = useApp();
  const { toBase } = useBaseRates(baseCurrency);

  const [cats, setCats] = useState([]);
  const [tagSel, setTagSel] = useState([]);
  const [wals, setWals] = useState([]);
  const [granularity, setGranularity] = useState('month');

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

  const scoped = useMemo(
    () =>
      transactions.filter(
        (t) => (isIncome(t) || isExpense(t)) && matchesFilters(t, { categories: cats, tags: tagSel, wallets: wals }),
      ),
    [transactions, cats, tagSel, wals],
  );

  const months = useMemo(() => {
    const set = new Set(transactions.map((t) => monthKey(t.date)).filter(Boolean));
    set.add(monthKey(todayIso()));
    return [...set].sort((a, b) => (a < b ? 1 : -1));
  }, [transactions]);
  const [selectedMonth, setSelectedMonth] = useState(months[0] || monthKey(todayIso()));

  const monthTx = useMemo(() => scoped.filter((t) => monthKey(t.date) === selectedMonth), [scoped, selectedMonth]);
  const income = monthTx.filter(isIncome).reduce((s, t) => s + (toDisplay(t) || 0), 0);
  const expense = monthTx.filter(isExpense).reduce((s, t) => s + (toDisplay(t) || 0), 0);

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const t of monthTx) {
      if (!isExpense(t)) continue;
      const v = toDisplay(t);
      if (v == null) continue;
      map.set(t.category || 'Без категории', (map.get(t.category) || 0) + v);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthTx, singleWallet, toBase]);

  // Топ категорий расходов за период (для цветов и стек-графика).
  const { series, catTrend } = useMemo(() => {
    const totals = expenseTotalsByCategory(scoped, toDisplay);
    const { top, series: seriesList } = buildCategorySeries(totals);

    const raw = buildCategoryTimeSeries(scoped, granularity, toDisplay, top);
    const sliced = granularity === 'day' ? raw.slice(-30) : raw.slice(-12);
    const data = sliced.map((b) => ({
      ...b,
      label: granularity === 'day' ? dayLabel(b.key) : monthLabel(b.key).replace(/ \d{4}$/, ''),
    }));
    return { series: seriesList, catTrend: data };
  }, [scoped, granularity, singleWallet, toBase]);

  const fmt = (v) => formatAmount(v, displayCurrency);

  return (
    <div className="page">
      <header className="page__header"><h1>Статистика</h1></header>

      <div className="filters">
        <ChipMultiSelect label="Кошельки" options={walletOptions} selected={wals} onChange={setWals} />
        <ChipMultiSelect label="Категории" options={catOptions} selected={cats} onChange={setCats} />
        {tagOptions.length > 0 && (
          <ChipMultiSelect label="Теги" options={tagOptions} selected={tagSel} onChange={setTagSel} />
        )}
      </div>

      <section>
        <h2 className="section-title">Сводка за месяц</h2>
        <select className="field__input field__input--select" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <div className="stats-summary" style={{ marginTop: '0.75rem' }}>
          <div className="stats-summary__cell"><span className="muted">Доходы</span><strong className="tx-item__amount--income">{fmt(income)}</strong></div>
          <div className="stats-summary__cell"><span className="muted">Расходы</span><strong className="tx-item__amount--expense">{fmt(expense)}</strong></div>
          <div className="stats-summary__cell"><span className="muted">Баланс</span><strong>{fmt(income - expense)}</strong></div>
        </div>
      </section>

      <section>
        <h2 className="section-title">Расходы по категориям · {monthLabel(selectedMonth)}</h2>
        {byCategory.length === 0 ? (
          <p className="muted empty">Нет расходов за этот месяц</p>
        ) : (
          <>
            <div className="chart">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {byCategory.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="legend">
              {byCategory.map((c, i) => (
                <li key={c.name} className="legend__item">
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
          <button className={`seg__btn${granularity === 'day' ? ' seg__btn--active' : ''}`} onClick={() => setGranularity('day')}>По дням</button>
          <button className={`seg__btn${granularity === 'month' ? ' seg__btn--active' : ''}`} onClick={() => setGranularity('month')}>По месяцам</button>
        </div>
        <h2 className="section-title">
          Динамика расходов {granularity === 'day' ? '(30 дней)' : '(12 месяцев)'} · {displayCurrency}
        </h2>
        {catTrend.length === 0 ? (
          <p className="muted empty">Нет данных за период</p>
        ) : (
          <>
            <CategoryTrendChart data={catTrend} series={series} formatValue={(v) => fmt(v)} formatAxis={compactNumber} />
            <ul className="legend">
              {series.map((s) => (
                <li key={s.name} className="legend__item">
                  <span className="legend__dot" style={{ background: s.color }} />
                  <span className="legend__name">{s.name}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
