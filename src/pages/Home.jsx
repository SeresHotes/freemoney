import { useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { dateLabel, monthKey, monthLabel, shiftMonth, todayIso } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import { walletBalance, isIncome, isExpense } from '../utils/finance';
import { CATEGORY_COLORS, OTHER_COLOR } from '../utils/chartColors';
import { useBaseRates } from '../hooks/useBaseRates';
import { IS_DEV_CHANNEL } from '../config';
import CategoryRing from '../components/CategoryRing';
import { ringNamedCount } from '../utils/ringLayout';

// Иконка-контур 24×24 (стрелки, плюс/минус): в отличие от символов шрифта
// («‹», «−»), всегда ровно по центру по вертикали.
function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

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

  // Выбранный месяц — в адресе (?month=YYYY-MM), чтобы не сбрасывался после
  // возврата с формы операции; без параметра — текущий месяц.
  const [searchParams, setSearchParams] = useSearchParams();
  const curMonth = monthKey(todayIso());
  const rawMonth = searchParams.get('month');
  const month = /^\d{4}-\d{2}$/.test(rawMonth || '') && rawMonth < curMonth ? rawMonth : curMonth;
  const setMonth = (key) => {
    const next = key >= curMonth ? null : key;
    setSearchParams(next ? { month: next } : {}, { replace: true });
  };
  const monthTitle = monthLabel(month).replace(/\s*г\.?$/, '');

  // Свайп по карточке влево/вправо — следующий/предыдущий месяц.
  const touchRef = useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    if (Math.abs(dx) < 50 || Math.abs(dx) < 1.5 * Math.abs(t.clientY - start.y)) return;
    if (dx < 0 && month < curMonth) setMonth(shiftMonth(month, 1));
    if (dx > 0) setMonth(shiftMonth(month, -1));
  };

  // Данные за выбранный месяц: суммы и расходы по категориям (в базовой валюте).
  const { income, expense, byCategory } = useMemo(() => {
    const key = month;
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
  }, [transactions, categories, toBase, month]);

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

      <section className="home__stats" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="home__month">
          <button className="home__month-btn" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))}>
            <Icon d="M15 5l-7 7 7 7" />
          </button>
          <button
            className="home__month-title"
            title={month === curMonth ? 'Расходы за месяц' : 'Вернуться к текущему месяцу'}
            onClick={() => setMonth(curMonth)}
          >
            {monthTitle}
          </button>
          <button
            className="home__month-btn"
            aria-label="Следующий месяц"
            disabled={month >= curMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <Icon d="M9 5l7 7-7 7" />
          </button>
        </div>
        {byCategory.length === 0 ? (
          <div className="home__empty">
            <p className="muted">{month === curMonth ? 'Пока нет расходов в этом месяце' : 'В этом месяце расходов нет'}</p>
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

      {/* Лента кошельков; первая карточка — общий баланс по всем кошелькам. */}
      <section className="wallet-chips home__wallets">
        <button
          className={`wallet-chip wallet-chip--total${netWorth.sum < 0 ? ' wallet-chip--negative' : ''}`}
          title={ratesNote ? `Общий баланс (${ratesNote})` : 'Общий баланс'}
          onClick={() => navigate('/wallets')}
        >
          <span className="wallet-chip__name">Всего{ratesNote && ' *'}</span>
          <span className="wallet-chip__bal">{formatAmount(netWorth.sum, baseCurrency)}</span>
        </button>
        {recentWallets.map((w) => (
          <button key={w.name} className="wallet-chip" onClick={() => navigate(`/transactions?wallet=${encodeURIComponent(w.name)}`)}>
            <span className="wallet-chip__name">{w.name}</span>
            <span className="wallet-chip__bal">{formatAmount(walletBalance(transactions, w.name), w.currency)}</span>
          </button>
        ))}
      </section>
      {ratesNote && <p className="home__rates-note">* {ratesNote}</p>}

      <section className="home__actions">
        <button className="btn btn--expense" onClick={() => navigate('/add/expense')}>
          <Icon d="M5 12h14" /> Расход
        </button>
        <button className="btn btn--income" onClick={() => navigate('/add/income')}>
          <Icon d="M5 12h14M12 5v14" /> Доход
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
