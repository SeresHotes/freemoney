import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatAmount } from '../utils/currencies';
import { isIncome } from '../utils/finance';
import { matchesFilters } from '../utils/finance';
import ChipMultiSelect from '../components/ChipMultiSelect';

export default function Transactions() {
  const { transactions, categories, wallets, tags } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initArr = (key) => (searchParams.get(key) ? [searchParams.get(key)] : []);
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState(() => initArr('category'));
  const [tagSel, setTagSel] = useState(() => initArr('tag'));
  const [wals, setWals] = useState(() => initArr('wallet'));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showFilters, setShowFilters] = useState(
    () => Boolean(searchParams.get('category') || searchParams.get('tag') || searchParams.get('wallet')),
  );

  const iconByCategory = useMemo(() => new Map(categories.map((c) => [c.name, c.icon])), [categories]);
  const walletById = useMemo(() => new Map(wallets.map((w) => [w.id, w])), [wallets]);

  const catOptions = useMemo(
    () => categories.map((c) => ({ value: c.name, label: `${c.icon} ${c.name}` })),
    [categories],
  );
  const walletOptions = useMemo(
    () => wallets.filter((w) => w.status === 'active').map((w) => ({ value: w.id, label: w.name })),
    [wallets],
  );
  const tagOptions = useMemo(() => {
    const set = new Set(tags);
    for (const t of transactions) (t.tags || []).forEach((x) => set.add(x));
    return [...set].sort().map((t) => ({ value: t, label: `#${t}` }));
  }, [tags, transactions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qNum = q.replace(',', '.');
    const isNumeric = q !== '' && !Number.isNaN(Number(qNum));
    const f = { categories: cats, tags: tagSel, wallets: wals, from, to };
    return transactions
      .filter((t) => matchesFilters(t, f))
      .filter((t) => {
        if (!q) return true;
        const noteHit = (t.note || '').toLowerCase().includes(q);
        const amountHit =
          isNumeric && (String(t.amount).includes(qNum) || String(t.origAmount ?? '').includes(qNum));
        return noteHit || amountHit;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions, query, cats, tagSel, wals, from, to]);

  const activeCount = cats.length + tagSel.length + wals.length + (from ? 1 : 0) + (to ? 1 : 0);
  const clear = () => { setQuery(''); setCats([]); setTagSel([]); setWals([]); setFrom(''); setTo(''); };

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

      <button className="link-btn-inline" style={{ marginTop: '0.6rem' }} onClick={() => setShowFilters((v) => !v)}>
        {showFilters ? 'Скрыть фильтры' : `Фильтры${activeCount ? ` (${activeCount})` : ''}`}
      </button>

      {showFilters && (
        <div className="filters">
          <ChipMultiSelect label="Категории" options={catOptions} selected={cats} onChange={setCats} />
          <ChipMultiSelect label="Кошельки" options={walletOptions} selected={wals} onChange={setWals} />
          {tagOptions.length > 0 && (
            <ChipMultiSelect label="Теги" options={tagOptions} selected={tagSel} onChange={setTagSel} />
          )}
          <div className="chipms">
            <span className="chipms__label">Период</span>
            <div className="filters__dates">
              <input className="field__input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="muted">—</span>
              <input className="field__input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          {activeCount > 0 && <button className="link-btn-inline" onClick={clear}>Сбросить фильтры</button>}
        </div>
      )}

      <p className="muted" style={{ margin: '0.5rem 0' }}>Найдено: {filtered.length}</p>

      {filtered.length === 0 ? (
        <p className="muted empty">Ничего не найдено</p>
      ) : (
        <ul className="tx-list">
          {filtered.map((t) => {
            const transfer = t.type.startsWith('transfer');
            const positive = isIncome(t) || t.type === 'transfer_in';
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
                  <span className={`tx-item__amount tx-item__amount--${positive ? 'income' : 'expense'}`}>{positive ? '+' : '−'}{formatAmount(t.amount, t.currency)}</span>
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
