import { DEFAULT_ICON } from '../api/defaults';
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { monthKey, monthLabel, shiftMonth, todayIso } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import { walletBalance, isIncome, isExpense } from '../utils/finance';
import { useNetWorth } from '../hooks/useNetWorth';
import { IS_DEV_CHANNEL } from '../config';
import CategoryRing from '../components/CategoryRing';

// Иконка-контур 24×24 (стрелки, плюс/минус): в отличие от символов шрифта
// («‹», «−»), всегда ровно по центру по вертикали.
function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// Настройки главной, переживают перезапуск: выбранный кошелёк (пусто — все)
// и период кольца.
const LS_HOME_WALLET = 'freemoney:homeWallet';
const LS_HOME_PERIOD = 'freemoney:homePeriod';
function lsRead(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}
function lsWrite(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* без хранилища выбор просто не переживёт перезапуск */
  }
}

const PERIODS = { month: 'Месяц', year: 'Год', all: 'Всё время' };

// Шторка снизу поверх главной: закрывается только пользователем — ✕, тапом
// мимо или свайпом вниз за шапку.
function BottomSheet({ title, onClose, children }) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef(null);
  return (
    <div className="wallet-sheet" onClick={onClose}>
      <div
        className="wallet-sheet__box"
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="wallet-sheet__grab"
          onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
          onTouchMove={(e) => {
            if (startY.current != null) setDragY(Math.max(0, e.touches[0].clientY - startY.current));
          }}
          onTouchEnd={() => {
            startY.current = null;
            if (dragY > 80) onClose();
            else setDragY(0);
          }}
        >
          <span className="wallet-sheet__handle" />
          <div className="wallet-sheet__head">
            <span>{title}</span>
            <button className="wallet-sheet__close" aria-label="Закрыть" onClick={onClose}>✕</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Home() {
  const { transactions, wallets, categories, baseCurrency } = useApp();
  const navigate = useNavigate();
  const { sum: netWorth, ratesNote, toBase } = useNetWorth();

  const activeWallets = useMemo(() => wallets.filter((w) => !w.archived), [wallets]);

  // Кошельки в шторке — недавно использованные первыми (остальные — в их обычном
  // порядке): нужные почти всегда под рукой.
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

  // Выбранный кошелёк: кольцо и суммы — только по нему; '' — все кошельки.
  // Архивный/удалённый кошелёк — как «все».
  const [storedWallet, setStoredWallet] = useState(() => lsRead(LS_HOME_WALLET));
  const selWallet = activeWallets.some((w) => w.name === storedWallet) ? storedWallet : '';
  const selectWallet = (name) => {
    setStoredWallet(name);
    lsWrite(LS_HOME_WALLET, name);
  };
  const walletQuery = selWallet ? `wallet=${encodeURIComponent(selWallet)}` : '';

  // Шторка «что показывать»: период и кошелёк. Тап по плашке периода.
  const [sheetOpen, setSheetOpen] = useState(false);

  // Период кольца: месяц / год / всё время (запоминается). Какой именно месяц
  // или год — в адресе (?month=YYYY-MM / ?year=YYYY), чтобы не сбрасывался
  // после возврата с формы операции; без параметра — текущий.
  const [period, setPeriodState] = useState(() => (lsRead(LS_HOME_PERIOD) in PERIODS ? lsRead(LS_HOME_PERIOD) : 'month'));
  const [searchParams, setSearchParams] = useSearchParams();
  const curMonth = monthKey(todayIso());
  const curYear = curMonth.slice(0, 4);
  const param = period === 'month' ? 'month' : 'year';
  const cur = period === 'month' ? curMonth : curYear;
  const raw = searchParams.get(param) || '';
  const valid = period === 'month' ? /^\d{4}-\d{2}$/.test(raw) : /^\d{4}$/.test(raw);
  const periodKey = period === 'all' ? '' : valid && raw < cur ? raw : cur;
  const isCurrent = periodKey === (period === 'all' ? '' : cur);
  const setPeriodKey = (key) => {
    setSearchParams(key && key < cur ? { [param]: key } : {}, { replace: true });
  };
  const shiftPeriod = (delta) => {
    if (period === 'month') setPeriodKey(shiftMonth(periodKey, delta));
    else if (period === 'year') setPeriodKey(String(Number(periodKey) + delta));
  };
  const setPeriod = (p) => {
    setPeriodState(p);
    lsWrite(LS_HOME_PERIOD, p === 'month' ? '' : p);
    setSearchParams({}, { replace: true });
  };
  const periodTitle = period === 'month'
    ? monthLabel(periodKey).replace(/\s*г\.?$/, '').replace(/^./, (c) => c.toUpperCase())
    : period === 'year' ? `${periodKey} год` : 'Всё время';
  const inPeriod = (date) => (period === 'month' ? monthKey(date) === periodKey
    : period === 'year' ? (date || '').slice(0, 4) === periodKey : true);

  // Свайп по карточке влево/вправо — следующий/предыдущий период.
  const touchRef = useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || period === 'all') return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    if (Math.abs(dx) < 50 || Math.abs(dx) < 1.5 * Math.abs(t.clientY - start.y)) return;
    if (dx < 0 && !isCurrent) shiftPeriod(1);
    if (dx > 0) shiftPeriod(-1);
  };

  // Данные за выбранный период: суммы и расходы по категориям (в базовой валюте).
  const { income, expense, byCategory } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    const catMap = new Map();
    for (const t of transactions) {
      if (!inPeriod(t.date)) continue;
      if (selWallet && t.wallet !== selWallet) continue;
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
    const catOf = new Map(categories.map((c) => [c.name, c]));
    // все категории — что не поместится рядом со своим сектором, кольцо само
    // соберёт в «Другое»; цвет — свой у категории (у «Без категории» его нет —
    // его раздаст кольцо)
    const cats = [...catMap.entries()].map(([name, value]) => ({
      name, value, icon: catOf.get(name)?.icon || DEFAULT_ICON, color: catOf.get(name)?.color || '',
    }));
    return { income: inc, expense: exp, byCategory: cats };
  }, [transactions, categories, toBase, period, periodKey, selWallet]);

  const emptyText = period === 'all' ? 'Пока нет расходов'
    : period === 'year' ? (isCurrent ? 'Пока нет расходов в этом году' : 'В этом году расходов нет')
      : isCurrent ? 'Пока нет расходов в этом месяце' : 'В этом месяце расходов нет';

  // Строки шторки: «Всего» и кошельки (недавние первыми). Балансы видны только
  // здесь — на самой главной их нет.
  const walletItems = [
    {
      key: '',
      name: `Всего${ratesNote ? ' *' : ''}`,
      balance: formatAmount(netWorth, baseCurrency),
      negative: netWorth < 0,
      title: ratesNote ? `Все кошельки (${ratesNote})` : 'Все кошельки',
    },
    ...recentWallets.map((w) => {
      const bal = walletBalance(transactions, w.name);
      return {
        key: w.name,
        name: w.name,
        balance: formatAmount(bal, w.currency),
        negative: bal < 0,
        title: w.name,
      };
    }),
  ];

  // Новая операция — в выбранном кошельке (и с категорией, если задана).
  const addUrl = (type, extra = '') => {
    const q = [extra, walletQuery].filter(Boolean).join('&');
    return `/add/${type}${q ? `?${q}` : ''}`;
  };

  // Главный экран всегда помещается в окно без прокрутки: сверху — плашка
  // периода, кольцо расходов с подписями категорий (тянется на свободное
  // место), ниже — кнопки.
  return (
    <div className="page home">
      <header className="home__head">
        <h1 className="home__title">FreeMoney{IS_DEV_CHANNEL && <span className="channel-badge">DEV</span>}</h1>
      </header>

      {/* Плашка периода: стрелки листают месяц/год, тап по середине — шторка
          с выбором периода и кошелька. */}
      <section className="home__month" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button
          className={`home__month-btn${period === 'all' ? ' home__month-btn--hidden' : ''}`}
          aria-label="Назад"
          onClick={() => shiftPeriod(-1)}
        >
          <Icon d="M15 5l-7 7 7 7" />
        </button>
        <button className="home__month-title home__period" title="Период и кошелёк" onClick={() => setSheetOpen(true)}>
          <span className="home__period-title">{periodTitle} <span className="home__period-caret">▾</span></span>
          <span className="home__period-wallet">{selWallet || 'Все кошельки'}</span>
        </button>
        <button
          className={`home__month-btn${period === 'all' ? ' home__month-btn--hidden' : ''}`}
          aria-label="Вперёд"
          disabled={isCurrent}
          onClick={() => shiftPeriod(1)}
        >
          <Icon d="M9 5l7 7-7 7" />
        </button>
      </section>

      <section className="home__stats" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {byCategory.length === 0 ? (
          <div className="home__empty">
            <p className="muted">{emptyText}</p>
            {income > 0 && <span className="chip chip--income">↑ {formatAmount(income, baseCurrency)}</span>}
          </div>
        ) : (
          <CategoryRing
            data={byCategory}
            center={{ expense, income }}
            formatValue={(v) => formatAmount(v, baseCurrency)}
            memoryKey={`${period}:${periodKey}|${selWallet}`}
            // тап по «Другому» — ничего (это не категория): только удержание с суммой
            onSelect={(c) => !c.other && navigate(addUrl('expense', `category=${encodeURIComponent(c.name)}`))}
          />
        )}
      </section>

      <section className="home__actions">
        <button className="btn btn--expense" onClick={() => navigate(addUrl('expense'))}>
          <Icon d="M5 12h14" /> Расход
        </button>
        <button className="btn btn--income" onClick={() => navigate(addUrl('income'))}>
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

      {sheetOpen && (
        <BottomSheet title="Что показывать" onClose={() => setSheetOpen(false)}>
          <div className="home-sheet__period">
            <div className="seg" role="radiogroup" aria-label="Период">
              {Object.entries(PERIODS).map(([p, label]) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={period === p}
                  className={`seg__btn${period === p ? ' seg__btn--active' : ''}`}
                  onClick={() => setPeriod(p)}
                >
                  {label}
                </button>
              ))}
            </div>
            {!isCurrent && (
              <button className="home-sheet__now" onClick={() => setPeriodKey('')}>
                ↺ {period === 'month' ? 'Текущий месяц' : 'Текущий год'}
              </button>
            )}
          </div>
          <ul className="wallet-sheet__list">
            {walletItems.map((c) => (
              <li key={c.key}>
                <button
                  className={`wallet-sheet__row${c.key === selWallet ? ' wallet-sheet__row--selected' : ''}${c.negative ? ' wallet-sheet__row--negative' : ''}`}
                  title={c.title}
                  onClick={() => selectWallet(c.key)}
                >
                  <span className="wallet-sheet__name">{c.name}</span>
                  <span className="wallet-sheet__bal">{c.balance}</span>
                </button>
              </li>
            ))}
          </ul>
          {ratesNote && <p className="home__rates-note">* {ratesNote}</p>}
        </BottomSheet>
      )}
    </div>
  );
}
