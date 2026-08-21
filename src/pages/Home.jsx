import { lazy, Suspense, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { monthKey, todayIso, daysAgoIso, dayLabel } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import { walletBalance, isIncome, isExpense, buildTimeSeries } from '../utils/finance';
import { useBaseRates } from '../hooks/useBaseRates';

const TrendChart = lazy(() => import('../components/TrendChart'));

export default function Home() {
  const { transactions, wallets, baseCurrency } = useApp();
  const navigate = useNavigate();
  const { toBase, ready } = useBaseRates(baseCurrency);

  const activeWallets = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);

  const netWorth = useMemo(() => {
    let sum = 0;
    let hasUnknown = false;
    for (const w of activeWallets) {
      const inBase = toBase(walletBalance(transactions, w.id), w.currency);
      if (inBase == null) hasUnknown = true;
      else sum += inBase;
    }
    return { sum, hasUnknown };
  }, [activeWallets, transactions, toBase]);

  const month = useMemo(() => {
    const key = monthKey(todayIso());
    let income = 0;
    let expense = 0;
    for (const t of transactions) {
      if (monthKey(t.date) !== key) continue;
      const inBase = toBase(t.amount, t.currency);
      if (inBase == null) continue;
      if (isIncome(t)) income += inBase;
      else if (isExpense(t)) expense += inBase;
    }
    return { income, expense };
  }, [transactions, toBase]);

  // График доход/расход по дням за последние 30 дней (в базовой валюте).
  const chartData = useMemo(() => {
    const cutoff = daysAgoIso(30);
    const recent = transactions.filter((t) => t.date >= cutoff);
    return buildTimeSeries(recent, 'day', (t) => toBase(t.amount, t.currency)).map((b) => ({
      ...b,
      label: dayLabel(b.key),
    }));
  }, [transactions, toBase]);

  return (
    <div className="page">
      <header className="page__header">
        <h1>FreeMoney</h1>
        <p className="muted">Общий капитал{ready ? '' : ' (загрузка курсов…)'}</p>
      </header>

      <section className="balance-card balance-card--positive">
        <div className="balance-card__value">{formatAmount(netWorth.sum, baseCurrency)}</div>
        {netWorth.hasUnknown && <div className="muted">часть валют без курса не учтена</div>}
        <div className="balance-card__row">
          <span className="chip chip--income">↑ {formatAmount(month.income, baseCurrency)}</span>
          <span className="chip chip--expense">↓ {formatAmount(month.expense, baseCurrency)}</span>
        </div>
      </section>

      {activeWallets.length > 0 && (
        <section className="wallet-chips">
          {activeWallets.map((w) => (
            <button key={w.id} className="wallet-chip" onClick={() => navigate(`/transactions?wallet=${w.id}`)}>
              <span className="wallet-chip__name">{w.name}</span>
              <span className="wallet-chip__bal">{formatAmount(walletBalance(transactions, w.id), w.currency)}</span>
            </button>
          ))}
        </section>
      )}

      <section className="actions">
        <button className="btn btn--expense" onClick={() => navigate('/add/expense')}>− Расход</button>
        <button className="btn btn--income" onClick={() => navigate('/add/income')}>+ Доход</button>
      </section>
      <button className="btn btn--block" style={{ marginTop: '0.75rem' }} onClick={() => navigate('/transfer')}>
        ⇄ Перевод между кошельками
      </button>

      <section>
        <h2 className="section-title">Доходы и расходы за 30 дней ({baseCurrency})</h2>
        {chartData.length === 0 ? (
          <p className="muted empty">Пока нет операций. Добавьте первую!</p>
        ) : (
          <Suspense fallback={<div className="chart"><div className="spinner" /></div>}>
            <TrendChart data={chartData} formatValue={(v) => formatAmount(v, baseCurrency)} />
          </Suspense>
        )}
      </section>
    </div>
  );
}
