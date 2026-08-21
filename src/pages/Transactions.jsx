import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatAmount } from '../utils/currencies';
import { isIncome, isExpense } from '../utils/finance';

export default function Transactions() {
  const { transactions, categories, wallets, tags } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [tag, setTag] = useState(searchParams.get('tag') || '');
  const [walletId, setWalletId] = useState(searchParams.get('wallet') || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const iconByCategory = useMemo(() => new Map(categories.map((c) => [c.name, c.icon])), [categories]);
  const walletById = useMemo(() => new Map(wallets.map((w) => [w.id, w])), [wallets]);
  const allTags = useMemo(() => {
    const set = new Set(tags);
    for (const t of transactions) (t.tags || []).forEach((x) => set.add(x));
    return [...set].sort();
  }, [tags, transactions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qNum = q.replace(',', '.');
    const isNumeric = q !== '' && !Number.isNaN(Number(qNum));
    return transactions
      .filter((t) => {
        if (category && t.category !== category) return false;
        if (tag && !(t.tags || []).includes(tag)) return false;
        if (walletId && t.wallet !== walletId) return false;
        if (from && t.date < from) return false;
        if (to && t.date > to) return false;
        if (q) {
          const noteHit = (t.note || '').toLowerCase().includes(q);
          const amountHit =
            isNumeric &&
            (String(t.amount).includes(qNum) || String(t.origAmount ?? '').includes(qNum));
          if (!noteHit && !amountHit) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions, query, category, tag, walletId, from, to]);

  const total = filtered.length;
  const activeWallets = wallets.filter((w) => w.status === 'active');

  const clear = () => {
    setQuery(''); setCategory(''); setTag(''); setWalletId(''); setFrom(''); setTo('');
  };
  const hasFilters = query || category || tag || walletId || from || to;

  return (
    <div className="page">
      <header className="page__header"><h1>Операции</h1></header>

      <input
        className="field__input"
        type="text"
        placeholder="Поиск по заметке или сумме"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="filters">
        <select className="field__input field__input--select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Все категории</option>
          {categories.map((c) => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
        </select>
        <select className="field__input field__input--select" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
          <option value="">Все кошельки</option>
          {activeWallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        {allTags.length > 0 && (
          <select className="field__input field__input--select" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Все теги</option>
            {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
        )}
        <div className="filters__dates">
          <input className="field__input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="С" />
          <span className="muted">—</span>
          <input className="field__input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="По" />
        </div>
        {hasFilters && <button className="link-btn-inline" onClick={clear}>Сбросить фильтры</button>}
      </div>

      <p className="muted" style={{ margin: '0.5rem 0' }}>Найдено: {total}</p>

      {total === 0 ? (
        <p className="muted empty">Ничего не найдено</p>
      ) : (
        <ul className="tx-list">
          {filtered.map((t) => {
            const transfer = t.type.startsWith('transfer');
            const positive = isIncome(t) || t.type === 'transfer_in';
            const sign = positive ? '+' : '−';
            return (
              <li key={t.id} className="tx-item tx-item--clickable" onClick={() => navigate(`/edit/${t.id}`)}>
                <span className="tx-item__cat-icon">{transfer ? '⇄' : iconByCategory.get(t.category) || '🏷️'}</span>
                <div className="tx-item__main">
                  <span className="tx-item__category">{transfer ? 'Перевод' : t.category || 'Без категории'}</span>
                  <span className="tx-item__note">
                    {walletById.get(t.wallet)?.name}
                    {t.origAmount ? ` · ${formatAmount(t.origAmount, t.origCurrency)}` : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </span>
                  {t.tags?.length > 0 && (
                    <span className="tx-item__tags">{t.tags.map((x) => <span key={x} className="tag-chip tag-chip--mini">#{x}</span>)}</span>
                  )}
                </div>
                <div className="tx-item__right">
                  <span className={`tx-item__amount tx-item__amount--${positive ? 'income' : 'expense'}`}>{sign}{formatAmount(t.amount, t.currency)}</span>
                  <span className="tx-item__date">{t.date}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
