import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { dateLabel, monthKey, todayIso } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import { walletBalance, isIncome, isExpense } from '../utils/finance';
import { CATEGORY_COLORS, OTHER_COLOR } from '../utils/chartColors';
import { useBaseRates } from '../hooks/useBaseRates';
import { IS_DEV_CHANNEL } from '../config';
import CategoryRing from '../components/CategoryRing';
import { ringNamedCount } from '../utils/ringLayout';

export default function Home() {
  const { transactions, wallets, categories, baseCurrency } = useApp();
  const navigate = useNavigate();
  const { toBase, ready, failed, ratesDate } = useBaseRates(baseCurrency);

  const activeWallets = useMemo(() => wallets.filter((w) => !w.archived), [wallets]);

  // Кошельки на главной — лента с прокруткой вбок, недавно использованные
  // первыми (остальные — в их обычном порядке): нужные почти всегда под рукой.
  const recentWallets = useMemo(() => {
    const last = new Map();
    for (const t of transactions) {
      const at = `${t.date} ${t.time || ''}`;
      if (!last.has(t.wallet) || at > last.get(t.wallet)) last.set(t.wallet, at);
    }
    return activeWallets
      .map((w, i) => ({ w, i, at: last.get(w.name) || '' }))
      .sort((a, b) => (a.at === b.at ? a.i - b.i : a.at < b.at ? 1 : -1))
      .map((x) => x.w);
  }, [activeWallets, transactions]);

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
        const cat = t.category || 'Без категории';
        catMap.set(cat, (catMap.get(cat) || 0) + mag);
      }
    }
    const iconOf = new Map(categories.map((c) => [c.name, c.icon]));
    const sorted = [...catMap.entries()].sort((a, b) => b[1] - a[1]);
    const named = sorted.slice(0, ringNamedCount(sorted, exp));
    const cats = named.map(([name, value], i) => ({
      name,
      value,
      icon: iconOf.get(name) || '🏷️',
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
    if (named.length < sorted.length) {
      const rest = sorted.slice(named.length).reduce((sum, [, v]) => sum + v, 0);
      cats.push({ name: 'Другое', value: rest, icon: '📦', color: OTHER_COLOR, other: true });
    }
    return { income: inc, expense: exp, byCategory: cats };
  }, [transactions, categories, toBase]);

  // Пометка о курсах — только если есть кошельки не в базовой валюте.
  const needsRates = activeWallets.some((w) => w.currency && w.currency !== baseCurrency);
  let ratesNote = null;
  if (needsRates) {
    if (netWorth.hasUnknown) ratesNote = ready || failed ? 'без части валют: нет курса' : 'загружаю курсы…';
    else if (ratesDate && ratesDate < todayIso()) ratesNote = `курсы от ${dateLabel(ratesDate)}`;
  }

  // Главный экран всегда помещается в окно без прокрутки: сверху — кольцо
  // расходов с подписями категорий (тянется на свободное место), ниже —
  // кошельки, общий баланс и кнопки.
  return (
    <div className="page home">
      <header className="home__head">
        <h1 className="home__title">FreeMoney{IS_DEV_CHANNEL && <span className="channel-badge">DEV</span>}</h1>
      </header>

      <section className="home__stats">
        <h2 className="home__stats-title">Расходы за месяц ({baseCurrency})</h2>
        {byCategory.length === 0 ? (
          <div className="home__empty">
            <p className="muted">Пока нет расходов в этом месяце</p>
            {income > 0 && <span className="chip chip--income">↑ {formatAmount(income, baseCurrency)}</span>}
          </div>
        ) : (
          <CategoryRing
            data={byCategory}
            center={{ expense, income }}
            formatValue={(v) => formatAmount(v, baseCurrency)}
            onSelect={(c) => navigate(c.other ? '/add/expense' : `/add/expense?category=${encodeURIComponent(c.name)}`)}
          />
        )}
      </section>

      {activeWallets.length > 0 && (
        <section className="wallet-chips home__wallets">
          {recentWallets.map((w) => (
            <button key={w.name} className="wallet-chip" onClick={() => navigate(`/transactions?wallet=${encodeURIComponent(w.name)}`)}>
              <span className="wallet-chip__name">{w.name}</span>
              <span className="wallet-chip__bal">{formatAmount(walletBalance(transactions, w.name), w.currency)}</span>
            </button>
          ))}
        </section>
      )}

      {/* Одна строка: «−» расход · баланс · «+» доход — экономит высоту для кольца. */}
      <section className="home__money">
        <button className="home__pm home__pm--expense" aria-label="Расход" title="Расход" onClick={() => navigate('/add/expense')}>
          −
        </button>
        <button
          className={`home__balance${netWorth.sum < 0 ? ' home__balance--negative' : ''}`}
          title="Общий баланс"
          onClick={() => navigate('/wallets')}
        >
          <span className="home__balance-value">{formatAmount(netWorth.sum, baseCurrency)}</span>
          {ratesNote && <span className="home__balance-note">{ratesNote}</span>}
        </button>
        <button className="home__pm home__pm--income" aria-label="Доход" title="Доход" onClick={() => navigate('/add/income')}>
          +
        </button>
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
