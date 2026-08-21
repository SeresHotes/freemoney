import { useMemo, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { formatMoney, monthKey, monthLabel, todayIso } from '../utils/format';

// Палитра для категорий (доступная, читается в тёмной теме).
const COLORS = [
  '#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa',
  '#f472b6', '#22d3ee', '#fb923c', '#4ade80', '#e879f9',
];

export default function Stats() {
  const { transactions } = useApp();

  const [selectedTag, setSelectedTag] = useState(null);

  // Все теги для фильтра.
  const allTags = useMemo(() => {
    const set = new Set();
    for (const t of transactions) (t.tags || []).forEach((tag) => set.add(tag));
    return [...set].sort();
  }, [transactions]);

  // Операции с учётом фильтра по тегу.
  const filtered = useMemo(
    () => (selectedTag ? transactions.filter((t) => (t.tags || []).includes(selectedTag)) : transactions),
    [transactions, selectedTag],
  );

  // Список месяцев, где есть операции (по убыванию), + текущий.
  const months = useMemo(() => {
    const set = new Set(transactions.map((t) => monthKey(t.date)).filter(Boolean));
    set.add(monthKey(todayIso()));
    return [...set].sort((a, b) => (a < b ? 1 : -1));
  }, [transactions]);

  const [selectedMonth, setSelectedMonth] = useState(months[0] || monthKey(todayIso()));

  const monthTx = useMemo(
    () => filtered.filter((t) => monthKey(t.date) === selectedMonth),
    [filtered, selectedMonth],
  );

  const income = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  // Расходы по категориям за выбранный месяц.
  const byCategory = useMemo(() => {
    const map = new Map();
    for (const t of monthTx) {
      if (t.type !== 'expense') continue;
      map.set(t.category || 'Без категории', (map.get(t.category) || 0) + t.amount);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [monthTx]);

  // Динамика по последним 6 месяцам.
  const trend = useMemo(() => {
    const map = new Map();
    for (const t of filtered) {
      const key = monthKey(t.date);
      if (!key) continue;
      if (!map.has(key)) map.set(key, { month: key, income: 0, expense: 0 });
      const bucket = map.get(key);
      if (t.type === 'income') bucket.income += t.amount;
      else bucket.expense += t.amount;
    }
    return [...map.values()]
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .slice(-6)
      .map((b) => ({ ...b, label: monthLabel(b.month).replace(/ \d{4}$/, '') }));
  }, [filtered]);

  return (
    <div className="page">
      <header className="page__header">
        <h1>Статистика</h1>
      </header>

      <div className="field">
        <select
          className="field__input field__input--select"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>

      {allTags.length > 0 && (
        <div className="tag-filter">
          <button
            className={`tag-chip${selectedTag === null ? ' tag-chip--active' : ''}`}
            onClick={() => setSelectedTag(null)}
          >
            Все
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              className={`tag-chip${selectedTag === t ? ' tag-chip--active' : ''}`}
              onClick={() => setSelectedTag(t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      <section className="stats-summary">
        <div className="stats-summary__cell">
          <span className="muted">Доходы</span>
          <strong className="tx-item__amount--income">{formatMoney(income)}</strong>
        </div>
        <div className="stats-summary__cell">
          <span className="muted">Расходы</span>
          <strong className="tx-item__amount--expense">{formatMoney(expense)}</strong>
        </div>
        <div className="stats-summary__cell">
          <span className="muted">Баланс</span>
          <strong>{formatMoney(income - expense)}</strong>
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
                  <Pie
                    data={byCategory}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {byCategory.map((entry, i) => (
                      <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="legend">
              {byCategory.map((c, i) => (
                <li key={c.name} className="legend__item">
                  <span className="legend__dot" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="legend__name">{c.name}</span>
                  <span className="legend__value">{formatMoney(c.value)}</span>
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
                <Tooltip formatter={(v) => formatMoney(v)} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
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
