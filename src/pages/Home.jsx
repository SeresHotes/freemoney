import { lazy, Suspense, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { monthKey, todayIso } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import { walletBalance, isIncome, isExpense } from '../utils/finance';
import { CATEGORY_COLORS } from '../utils/chartColors';
import { useBaseRates } from '../hooks/useBaseRates';
import { IS_DEV_CHANNEL } from '../config';

const CategoryDonut = lazy(() => import('../components/CategoryDonut'));

export default function Home() {
  const { transactions, wallets, baseCurrency } = useApp();
  const navigate = useNavigate();
  const { toBase, ready } = useBaseRates(baseCurrency);

  const activeWallets = useMemo(() => wallets.filter((w) => !w.archived), [wallets]);

  const netWorth = useMemo(() => {
    let sum = 0;
    let hasUnknown = false;
    for (const w of activeWallets) {
      const inBase = toBase(walletBalance(transactions, w.name), w.currency);
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
      // amount знаковый (расход < 0); в суммах доход/расход показываем величину.
      const mag = Math.abs(inBase);
      if (isIncome(t)) inc += mag;
      else if (isExpense(t)) {
        exp += mag;
        catMap.set(t.category || 'Без категории', (catMap.get(t.category) || 0) + mag);
      }
    }
    const cats = [...catMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    return { income: inc, expense: exp, byCategory: cats };
  }, [transactions, toBase]);

  // Главный экран всегда помещается в окно без прокрутки: сверху — статистика
  // по категориям (тянется на свободное место), ниже — кошельки и кнопки.
  return (
    <div className="page home">
      <header className="home__head">
        <h1 className="home__title">FreeMoney{IS_DEV_CHANNEL && <span className="channel-badge">DEV</span>}</h1>
        <div className="home__networth">
          <span className="home__networth-value">{formatAmount(netWorth.sum, baseCurrency)}</span>
          <span className="muted home__networth-label">
            {ready ? 'общий капитал' : 'загрузка курсов…'}
            {netWorth.hasUnknown && ' · без части валют'}
          </span>
        </div>
      </header>

      <section className="home__stats">
        <h2 className="home__stats-title">Расходы за месяц ({baseCurrency})</h2>
        {byCategory.length === 0 ? (
          <div className="home__empty">
            <p className="muted">Пока нет расходов в этом месяце</p>
            {income > 0 && <span className="chip chip--income">↑ {formatAmount(income, baseCurrency)}</span>}
          </div>
        ) : (
          <Suspense fallback={<div className="home__chart"><div className="spinner" /></div>}>
            <div className="home__chart">
              <CategoryDonut
                fill
                data={byCategory}
                colors={CATEGORY_COLORS}
                center={{ expense, income }}
                formatValue={(v) => formatAmount(v, baseCurrency)}
              />
            </div>
            <ul className="legend home__legend">
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

      {activeWallets.length > 0 && (
        <section className="wallet-chips home__wallets">
          {activeWallets.map((w) => (
            <button key={w.name} className="wallet-chip" onClick={() => navigate(`/transactions?wallet=${encodeURIComponent(w.name)}`)}>
              <span className="wallet-chip__name">{w.name}</span>
              <span className="wallet-chip__bal">{formatAmount(walletBalance(transactions, w.name), w.currency)}</span>
            </button>
          ))}
        </section>
      )}

      <section className="home__actions">
        <button className="btn btn--expense" onClick={() => navigate('/add/expense')}>− Расход</button>
        <button className="btn btn--income" onClick={() => navigate('/add/income')}>+ Доход</button>
      </section>
      <section className="home__tiles">
        {[
          ['/transfer', '⇄', 'Перевод'],
          ['/debt', '🤝', 'Долг'],
          ['/interest', '📈', 'Проценты'],
          ['/adjust', '⚖️', 'Коррекция', 'Корректировка'],
        ].map(([to, icon, label, title]) => (
          <button key={to} className="home__tile" title={title || label} onClick={() => navigate(to)}>
            <span className="home__tile-icon">{icon}</span>
            <span className="home__tile-label">{label}</span>
          </button>
        ))}
      </section>
    </div>
  );
}
