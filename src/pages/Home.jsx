import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatMoney, monthKey, todayIso } from '../utils/format';

export default function Home() {
  const { transactions, categories } = useApp();
  const navigate = useNavigate();

  const iconByCategory = useMemo(() => {
    const map = new Map();
    for (const c of categories) map.set(c.name, c.icon);
    return map;
  }, [categories]);

  const { income, expense, balance, recent } = useMemo(() => {
    const currentMonth = monthKey(todayIso());
    const monthTx = transactions.filter((t) => monthKey(t.date) === currentMonth);
    const inc = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1));
    return { income: inc, expense: exp, balance: inc - exp, recent: sorted.slice(0, 8) };
  }, [transactions]);

  return (
    <div className="page">
      <header className="page__header">
        <h1>FreeMoney</h1>
        <p className="muted">Баланс за текущий месяц</p>
      </header>

      <section className={`balance-card ${balance >= 0 ? 'balance-card--positive' : 'balance-card--negative'}`}>
        <div className="balance-card__value">{formatMoney(balance)}</div>
        <div className="balance-card__row">
          <span className="chip chip--income">↑ {formatMoney(income)}</span>
          <span className="chip chip--expense">↓ {formatMoney(expense)}</span>
        </div>
      </section>

      <section className="actions">
        <button className="btn btn--expense" onClick={() => navigate('/add/expense')}>
          − Расход
        </button>
        <button className="btn btn--income" onClick={() => navigate('/add/income')}>
          + Доход
        </button>
      </section>

      <section>
        <h2 className="section-title">Последние операции</h2>
        {recent.length === 0 ? (
          <p className="muted empty">Пока нет операций. Добавьте первую!</p>
        ) : (
          <ul className="tx-list">
            {recent.map((t) => (
              <li key={t.id} className="tx-item">
                <span className="tx-item__cat-icon">{iconByCategory.get(t.category) || '🏷️'}</span>
                <div className="tx-item__main">
                  <span className="tx-item__category">{t.category || 'Без категории'}</span>
                  {t.note && <span className="tx-item__note">{t.note}</span>}
                  {t.tags?.length > 0 && (
                    <span className="tx-item__tags">
                      {t.tags.map((tag) => (
                        <span key={tag} className="tag-chip tag-chip--mini">#{tag}</span>
                      ))}
                    </span>
                  )}
                </div>
                <div className="tx-item__right">
                  <span className={`tx-item__amount tx-item__amount--${t.type}`}>
                    {t.type === 'expense' ? '−' : '+'}
                    {formatMoney(t.amount)}
                  </span>
                  <span className="tx-item__date">{t.date}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
