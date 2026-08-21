import { lazy, Suspense, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { monthKey, todayIso } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import { walletBalance, isIncome, isExpense } from '../utils/finance';
import { CATEGORY_COLORS } from '../utils/chartColors';
import { useBaseRates } from '../hooks/useBaseRates';

const CategoryDonut = lazy(() => import('../components/CategoryDonut'));

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

  // Данные за текущий месяц: суммы и расходы по категориям (в базовой валюте).
  const { income, expense, byCategory } = useMemo(() => {
    const key = monthKey(todayIso());
    let inc = 0;
    let exp = 0;
    const catMap = new Map();
    for (const t of transactions) {
      if (monthKey(t.date) !== key) continue;
      const inBase = toBase(t.amount, t.currency);
      if (inBase == null) continue;
      if (isIncome(t)) inc += inBase;
      else if (isExpense(t)) {
        exp += inBase;
        catMap.set(t.category || 'Без категории', (catMap.get(t.category) || 0) + inBase);
      }
    }
    const cats = [...catMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    return { income: inc, expense: exp, byCategory: cats };
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
          <span className="chip chip--income">↑ {formatAmount(income, baseCurrency)}</span>
          <span className="chip chip--expense">↓ {formatAmount(expense, baseCurrency)}</span>
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
        <h2 className="section-title">Расходы за месяц ({baseCurrency})</h2>
        {byCategory.length === 0 ? (
          <p className="muted empty">Пока нет расходов в этом месяце</p>
        ) : (
          <Suspense fallback={<div className="chart"><div className="spinner" /></div>}>
            <CategoryDonut
              data={byCategory}
              colors={CATEGORY_COLORS}
              center={{ expense, income }}
              formatValue={(v) => formatAmount(v, baseCurrency)}
            />
            <ul className="legend">
              {byCategory.map((c, i) => (
                <li
                  key={c.name}
                  className="legend__item legend__item--clickable"
                  onClick={() => navigate(`/transactions?category=${encodeURIComponent(c.name)}`)}
                >
                  <span className="legend__dot" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                  <span className="legend__name">{c.name}</span>
                  <span className="legend__value">{formatAmount(c.value, baseCurrency)}</span>
                </li>
              ))}
            </ul>
          </Suspense>
        )}
      </section>
    </div>
  );
}
