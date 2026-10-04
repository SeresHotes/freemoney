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
import { readHomeWalletsView } from '../utils/homeWalletsView';

// Иконка-контур 24×24 (стрелки, плюс/минус): в отличие от символов шрифта
// («‹», «−»), всегда ровно по центру по вертикали.
function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// Выбранный на главной кошелёк (пусто — все) — переживает перезапуск.
const LS_HOME_WALLET = 'freemoney:homeWallet';
function readHomeWallet() {
  try {
    return localStorage.getItem(LS_HOME_WALLET) || '';
  } catch {
    return '';
  }
}

// Балансы кошельков на главной скрыты (••••), пока их не показали кнопкой-глазом.
const LS_HOME_BALANCES = 'freemoney:homeBalancesShown';
function readBalancesShown() {
  try {
    return localStorage.getItem(LS_HOME_BALANCES) === '1';
  } catch {
    return false;
  }
}
const HIDDEN_BALANCE = '••••';

export default function Home() {
  const { transactions, wallets, categories, baseCurrency } = useApp();
  const navigate = useNavigate();
  const { sum: netWorth, ratesNote, toBase } = useNetWorth();

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

  // Выбранный кошелёк: кольцо и суммы — только по нему; '' — все кошельки.
  // Архивный/удалённый кошелёк — как «все».
  const [storedWallet, setStoredWallet] = useState(readHomeWallet);
  const selWallet = activeWallets.some((w) => w.name === storedWallet) ? storedWallet : '';
  const selectWallet = (name) => {
    setStoredWallet(name);
    try {
      if (name) localStorage.setItem(LS_HOME_WALLET, name);
      else localStorage.removeItem(LS_HOME_WALLET);
    } catch {
      /* без хранилища выбор просто не переживёт перезапуск */
    }
  };
  const [balancesShown, setBalancesShown] = useState(readBalancesShown);
  const toggleBalances = () => {
    const next = !balancesShown;
    setBalancesShown(next);
    try {
      if (next) localStorage.setItem(LS_HOME_BALANCES, '1');
      else localStorage.removeItem(LS_HOME_BALANCES);
    } catch {
      /* без хранилища после перезапуска балансы снова скрыты */
    }
  };

  // ВРЕМЕННО: вид ленты кошельков выбирается в настройках (utils/homeWalletsView).
  const [walletsView] = useState(readHomeWalletsView);
  const masked = walletsView === 'eye' && !balancesShown;
  // blur: удержание пальцем на ленте снимает размытие (с задержкой, чтобы
  // обычный тап не мигал суммами).
  const [revealed, setRevealed] = useState(false);
  const revealTimer = useRef(null);
  const holdStart = () => {
    clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => setRevealed(true), 250);
  };
  const holdEnd = () => {
    clearTimeout(revealTimer.current);
    setRevealed(false);
  };
  // collapsed: лента раскрывается тапом и сворачивается после выбора.
  const [expanded, setExpanded] = useState(false);

  const walletQuery = selWallet ? `wallet=${encodeURIComponent(selWallet)}` : '';

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
  }, [transactions, categories, toBase, month, selWallet]);

  // Карточки ленты: выбранная — первой, затем «Всего» и кошельки (недавние первыми).
  const chips = [
    {
      key: '',
      name: `Всего${ratesNote ? ' *' : ''}`,
      balance: masked ? HIDDEN_BALANCE : formatAmount(netWorth, baseCurrency),
      negative: !masked && netWorth < 0,
      title: ratesNote ? `Все кошельки (${ratesNote})` : 'Все кошельки',
    },
    ...recentWallets.map((w) => {
      const bal = walletBalance(transactions, w.name);
      return {
        key: w.name,
        name: w.name,
        balance: masked ? HIDDEN_BALANCE : formatAmount(bal, w.currency),
        negative: !masked && bal < 0,
        title: w.name,
      };
    }),
  ].sort((a, b) => (b.key === selWallet) - (a.key === selWallet));

  // Новая операция — в выбранном кошельке (и с категорией, если задана).
  const addUrl = (type, extra = '') => {
    const q = [extra, walletQuery].filter(Boolean).join('&');
    return `/add/${type}${q ? `?${q}` : ''}`;
  };

  // Главный экран всегда помещается в окно без прокрутки: сверху — кольцо
  // расходов с подписями категорий (тянется на свободное место), ниже —
  // кошельки, общий баланс и кнопки.
  return (
    <div className="page home">
      <header className="home__head">
        <h1 className="home__title">FreeMoney{IS_DEV_CHANNEL && <span className="channel-badge">DEV</span>}</h1>
        {walletsView === 'eye' && <button
          className="home__eye"
          aria-label={balancesShown ? 'Скрыть балансы' : 'Показать балансы'}
          title={balancesShown ? 'Скрыть балансы' : 'Показать балансы'}
          aria-pressed={balancesShown}
          onClick={toggleBalances}
        >
          <Icon
            d={
              balancesShown
                ? 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z'
                : 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6zM3 3l18 18'
            }
          />
        </button>}
      </header>

      <section className="home__month" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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
      </section>

      <section className="home__stats" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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
            memoryKey={`${month}|${selWallet}`}
            // тап по «Другому» — ничего (это не категория): только удержание с суммой
            onSelect={(c) => !c.other && navigate(addUrl('expense', `category=${encodeURIComponent(c.name)}`))}
          />
        )}
      </section>

      {/* Лента: «Всего» и кошельки. Выбранный — зелёный и первый; тап выбирает
          (кольцо — по нему), повторный тап — операции кошелька. */}
      {walletsView === 'collapsed' && !expanded ? (
        <section className="wallet-chips home__wallets">
          <button className="wallet-chip wallet-chip--selected home__wallets-toggle" onClick={() => setExpanded(true)}>
            <span className="wallet-chip__name">Кошелёк</span>
            <span className="wallet-chip__bal">{selWallet || 'Все'} ▾</span>
          </button>
        </section>
      ) : (
        <section
          className={`wallet-chips home__wallets${walletsView === 'blur' && !revealed ? ' home__wallets--blur' : ''}${walletsView === 'names' ? ' home__wallets--names' : ''}`}
          key={selWallet}
          {...(walletsView === 'blur' && {
            onPointerDown: holdStart,
            onPointerUp: holdEnd,
            onPointerCancel: holdEnd,
            onPointerLeave: holdEnd,
            onContextMenu: (e) => e.preventDefault(),
          })}
        >
          {chips.map((c) => (
            <button
              key={c.key}
              className={`wallet-chip${c.key === selWallet ? ' wallet-chip--selected' : ''}${c.negative ? ' wallet-chip--negative' : ''}`}
              title={c.title}
              onClick={() => {
                if (c.key !== selWallet) {
                  selectWallet(c.key);
                  setExpanded(false);
                } else navigate(c.key ? `/transactions?wallet=${encodeURIComponent(c.key)}` : '/wallets');
              }}
            >
              <span className="wallet-chip__name">{c.name}</span>
              {walletsView !== 'names' && <span className="wallet-chip__bal">{c.balance}</span>}
            </button>
          ))}
          {walletsView === 'collapsed' && (
            <button className="wallet-chip home__wallets-toggle" aria-label="Свернуть" onClick={() => setExpanded(false)}>
              <span className="wallet-chip__bal">▴</span>
            </button>
          )}
        </section>
      )}
      {ratesNote && <p className="home__rates-note">* {ratesNote}</p>}

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
    </div>
  );
}
