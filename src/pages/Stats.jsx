import { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { monthKey, monthLabel, todayIso } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import { isIncome, isExpense } from '../utils/finance';
import { useBaseRates } from '../hooks/useBaseRates';

const COLORS = [
  '#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa',
  '#f472b6', '#22d3ee', '#fb923c', '#4ade80', '#e879f9',
];

export default function Stats() {
  const { transactions, wallets, baseCurrency } = useApp();
  const { toBase } = useBaseRates(baseCurrency);

  // Область: 'all' (все кошельки в базовой валюте) или id конкретного кошелька.
  const [scope, setScope] = useState('all');
  const [selectedTag, setSelectedTag] = useState(null);

  const activeWallets = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);
  const scopeWallet = activeWallets.find((w) => w.id === scope);
  // Валюта отображения: базовая для 'all', иначе валюта кошелька.
  const displayCurrency = scope === 'all' ? baseCurrency : scopeWallet?.currency || baseCurrency;

  // Приводит сумму операции к валюте отображения.
  const toDisplay = (t) => {
    if (scope === 'all') return toBase(t.amount, t.currency);
    return t.amount; // тот же кошелёк — та же валюта
  };

  const allTags = useMemo(() => {
    const set = new Set();
    for (const t of transactions) (t.tags || []).forEach((tag) => set.add(tag));
    return [...set].sort();
  }, [transactions]);

  // Фильтр по области, тегу и только реальные доход/расход.
  const scoped = useMemo(
    () =>
      transactions.filter((t) => {
        if (scope !== 'all' && t.wallet !== scope) return false;
        if (selectedTag && !(t.tags || []).includes(selectedTag)) return false;
        return isIncome(t) || isExpense(t);
      }),
    [transactions, scope, selectedTag],
  );

  const months = useMemo(() => {
    const set = new Set(transactions.map((t) => monthKey(t.date)).filter(Boolean));
    set.add(monthKey(todayIso()));
    return [...set].sort((a, b) => (a < b ? 1 : -1));
  }, [transactions]);

  const [selectedMonth, setSelectedMonth] = useState(months[0] || monthKey(todayIso()));

  const monthTx = useMemo(
    () => scoped.filter((t) => monthKey(t.date) === selectedMonth),
    [scoped, selectedMonth],
  );

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
  }, [monthTx, scope, toBase]);

  const trend = useMemo(() => {
    const map = new Map();
    for (const t of scoped) {
      const key = monthKey(t.date);
      if (!key) continue;
      if (!map.has(key)) map.set(key, { month: key, income: 0, expense: 0 });
      const bucket = map.get(key);
      const v = toDisplay(t);
      if (v == null) continue;
      if (isIncome(t)) bucket.income += v;
      else bucket.expense += v;
    }
    return [...map.values()]
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .slice(-6)
      .map((b) => ({ ...b, label: monthLabel(b.month).replace(/ \d{4}$/, '') }));
  }, [scoped, scope, toBase]);

  const fmt = (v) => formatAmount(v, displayCurrency);

  return (
    <div className="page">
      <header className="page__header">
        <h1>Статистика</h1>
      </header>

      <div className="field">
        <select className="field__input field__input--select" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">Все кошельки ({baseCurrency})</option>
          {activeWallets.map((w) => (
            <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
          ))}
        </select>
      </div>

      <div className="field">
        <select className="field__input field__input--select" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {allTags.length > 0 && (
        <div className="tag-filter">
          <button className={`tag-chip${selectedTag === null ? ' tag-chip--active' : ''}`} onClick={() => setSelectedTag(null)}>Все</button>
          {allTags.map((t) => (
            <button key={t} className={`tag-chip${selectedTag === t ? ' tag-chip--active' : ''}`} onClick={() => setSelectedTag(t)}>#{t}</button>
          ))}
        </div>
      )}

      <section className="stats-summary">
        <div className="stats-summary__cell">
          <span className="muted">Доходы</span>
          <strong className="tx-item__amount--income">{fmt(income)}</strong>
        </div>
        <div className="stats-summary__cell">
          <span className="muted">Расходы</span>
          <strong className="tx-item__amount--expense">{fmt(expense)}</strong>
        </div>
        <div className="stats-summary__cell">
          <span className="muted">Баланс</span>
          <strong>{fmt(income - expense)}</strong>
        </div>
      </section>

      <section>
        <h2 className="section-title">Расходы по категориям</h2>
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

      {trend.length > 1 && (
        <section>
          <h2 className="section-title">Динамика по месяцам</h2>
          <div className="chart">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis hide />
                <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar dataKey="income" fill="#34d399" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#f87171" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}
