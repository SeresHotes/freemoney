import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { monthKey, todayIso } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import { walletBalance, isIncome, isExpense } from '../utils/finance';
import { useBaseRates } from '../hooks/useBaseRates';

export default function Home() {
  const { transactions, categories, wallets, baseCurrency } = useApp();
  const navigate = useNavigate();
  const { toBase, ready } = useBaseRates(baseCurrency);

  const iconByCategory = useMemo(() => {
    const map = new Map();
    for (const c of categories) map.set(c.name, c.icon);
    return map;
  }, [categories]);

  const walletById = useMemo(() => {
    const map = new Map();
    for (const w of wallets) map.set(w.id, w);
    return map;
  }, [wallets]);

  const activeWallets = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);

  // Общий капитал в базовой валюте.
  const netWorth = useMemo(() => {
    let sum = 0;
    let hasUnknown = false;
    for (const w of activeWallets) {
      const bal = walletBalance(transactions, w.id);
      const inBase = toBase(bal, w.currency);
      if (inBase == null) hasUnknown = true;
      else sum += inBase;
    }
    return { sum, hasUnknown };
  }, [activeWallets, transactions, toBase]);

  // Доход/расход за текущий месяц в базовой валюте.
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

  const recent = useMemo(
    () => [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10),
    [transactions],
  );

  const label = (t) => {
    if (t.type === 'transfer_out') return `Перевод → ${walletById.get(otherLeg(t))?.name || ''}`.trim();
    if (t.type === 'transfer_in') return `Перевод ← ${walletById.get(otherLeg(t))?.name || ''}`.trim();
    return t.category || 'Без категории';
  };
  // Для подписи перевода ищем кошелёк второй ноги (по transferId).
  function otherLeg(t) {
    const pair = transactions.find((x) => x.transferId && x.transferId === t.transferId && x.id !== t.id);
    return pair?.wallet;
  }

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
            <button key={w.id} className="wallet-chip" onClick={() => navigate('/wallets')}>
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
        <h2 className="section-title">Последние операции</h2>
        {recent.length === 0 ? (
          <p className="muted empty">Пока нет операций. Добавьте первую!</p>
        ) : (
          <ul className="tx-list">
            {recent.map((t) => {
              const transfer = t.type === 'transfer_in' || t.type === 'transfer_out';
              const sign = isIncome(t) || t.type === 'transfer_in' ? '+' : t.type === 'transfer_out' || isExpense(t) ? '−' : '';
              const amountClass = isIncome(t) || t.type === 'transfer_in' ? 'income' : 'expense';
              return (
                <li key={t.id} className="tx-item">
                  <span className="tx-item__cat-icon">{transfer ? '⇄' : iconByCategory.get(t.category) || '🏷️'}</span>
                  <div className="tx-item__main">
                    <span className="tx-item__category">{label(t)}</span>
                    <span className="tx-item__note">
                      {walletById.get(t.wallet)?.name}
                      {t.origAmount ? ` · ${formatAmount(t.origAmount, t.origCurrency)}` : ''}
                      {t.note ? ` · ${t.note}` : ''}
                    </span>
                    {t.tags?.length > 0 && (
                      <span className="tx-item__tags">
                        {t.tags.map((tag) => <span key={tag} className="tag-chip tag-chip--mini">#{tag}</span>)}
                      </span>
                    )}
                  </div>
                  <div className="tx-item__right">
                    <span className={`tx-item__amount tx-item__amount--${amountClass}`}>
                      {sign}{formatAmount(t.amount, t.currency)}
                    </span>
                    <span className="tx-item__date">{t.date}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
