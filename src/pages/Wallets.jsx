import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatAmount } from '../utils/currencies';
import { walletBalance, isDebtWallet } from '../utils/finance';

export default function Wallets() {
  const { wallets, transactions } = useApp();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);

  const active = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);
  const archived = useMemo(() => wallets.filter((w) => w.status === 'archived'), [wallets]);

  return (
    <div className="page">
      <header className="page__header"><h1>Кошельки</h1></header>

      <button className="btn btn--block btn--primary" onClick={() => navigate('/wallets/new')}>
        ➕ Добавить кошелёк
      </button>

      <div className="add-cat__row" style={{ marginTop: '0.75rem' }}>
        <button className="btn btn--block" onClick={() => navigate('/transfer')}>⇄ Перевод</button>
        <button className="btn btn--block" onClick={() => navigate('/debt')}>🤝 Долг</button>
      </div>

      <section>
        <h2 className="section-title">Активные ({active.length})</h2>
        <ul className="cat-list">
          {active.map((w) => (
            <li key={w.id} className="cat-item cat-item--clickable" onClick={() => navigate(`/transactions?wallet=${w.id}`)}>
              <div className="cat-item__main">
                <span className="cat-item__name">{w.name}</span>
                <span className="kind-badge">{w.currency}</span>
                {isDebtWallet(w) && <span className="kind-badge">долг</span>}
              </div>
              <div className="cat-item__right">
                <span className="wallet-balance">{formatAmount(walletBalance(transactions, w.id), w.currency)}</span>
                <button className="link-btn cat-item__action" onClick={(e) => { e.stopPropagation(); navigate(`/wallets/${w.id}/edit`); }} title="Редактировать">✏️</button>
              </div>
            </li>
          ))}
        </ul>
        <p className="muted hint">Нажмите на кошелёк, чтобы посмотреть его операции.</p>
      </section>

      {archived.length > 0 && (
        <section>
          <button className="link-btn-inline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Скрыть архив' : `Показать архив (${archived.length})`}
          </button>
          {showArchived && (
            <ul className="cat-list cat-list--archived">
              {archived.map((w) => (
                <li key={w.id} className="cat-item cat-item--archived cat-item--clickable" onClick={() => navigate(`/wallets/${w.id}/edit`)}>
                  <div className="cat-item__main">
                    <span className="cat-item__name">{w.name}</span>
                    <span className="kind-badge">{w.currency}</span>
                    {isDebtWallet(w) && <span className="kind-badge">долг</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
