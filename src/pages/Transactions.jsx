import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatAmount } from '../utils/currencies';
import { monthKey, monthLabel } from '../utils/format';
import { isIncome, matchesFilters } from '../utils/finance';
import ChipMultiSelect from '../components/ChipMultiSelect';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
  { value: 'transfer', label: 'Переводы' },
  { value: 'adjust', label: 'Корректировки' },
];

export default function Transactions() {
  const { transactions, categories, wallets, tags } = useApp();
  const navigate = useNavigate();
  // Фильтры храним в URL, чтобы они сохранялись при переходе к операции и назад.
  const [searchParams, setSearchParams] = useSearchParams();

  const types = searchParams.getAll('type');
  const cats = searchParams.getAll('category');
  const wals = searchParams.getAll('wallet');
  const tagSel = searchParams.getAll('tag');
  const query = searchParams.get('q') || '';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';

  const update = (mutate) => {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next, { replace: true });
  };
  const setArr = (key, arr) => update((n) => { n.delete(key); arr.forEach((v) => n.append(key, v)); });
  const setSingle = (key, val) => update((n) => { if (val) n.set(key, val); else n.delete(key); });

  const [showFilters, setShowFilters] = useState(
    () => types.length + cats.length + wals.length + tagSel.length > 0 || Boolean(from || to),
  );

  const iconByCategory = useMemo(() => new Map(categories.map((c) => [c.name, c.icon])), [categories]);
  const walletById = useMemo(() => new Map(wallets.map((w) => [w.id, w])), [wallets]);

  const catOptions = useMemo(() => categories.map((c) => ({ value: c.name, label: `${c.icon} ${c.name}` })), [categories]);
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
    const f = { types, categories: cats, tags: tagSel, wallets: wals, from, to };
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
  }, [transactions, query, types, cats, tagSel, wals, from, to]);

  const activeCount = types.length + cats.length + tagSel.length + wals.length + (from ? 1 : 0) + (to ? 1 : 0);
  const clear = () => setSearchParams({}, { replace: true });

  // Группировка по месяцам (filtered уже отсортирован по убыванию даты).
  const groups = useMemo(() => {
    const map = new Map();
    for (const t of filtered) {
      const k = monthKey(t.date) || '—';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    }
    return [...map.entries()];
  }, [filtered]);

  const renderRow = (t) => {
    const transfer = t.type.startsWith('transfer');
    const adjust = t.type.startsWith('adjust');
    const positive = isIncome(t) || t.type === 'transfer_in' || t.type === 'adjust_in';
    const icon = transfer ? '⇄' : adjust ? '⚖️' : iconByCategory.get(t.category) || '🏷️';
    const title = transfer ? 'Перевод' : adjust ? 'Корректировка' : t.category || 'Без категории';
    return (
      <li key={t.id} className="tx-item tx-item--clickable" onClick={() => navigate(`/edit/${t.id}`)}>
        <span className="tx-item__cat-icon">{icon}</span>
        <div className="tx-item__main">
          <span className="tx-item__category">{title}</span>
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
  };

  return (
    <div className="page">
      <header className="page__header"><h1>Операции</h1></header>

      <input
        className="field__input"
        type="text"
        placeholder="Поиск по заметке или сумме"
        value={query}
        onChange={(e) => setSingle('q', e.target.value)}
      />

      <button className="link-btn-inline" style={{ marginTop: '0.6rem' }} onClick={() => setShowFilters((v) => !v)}>
        {showFilters ? 'Скрыть фильтры' : `Фильтры${activeCount ? ` (${activeCount})` : ''}`}
      </button>

      {showFilters && (
        <div className="filters">
          <ChipMultiSelect label="Тип" options={TYPE_OPTIONS} selected={types} onChange={(a) => setArr('type', a)} />
          <ChipMultiSelect label="Категории" options={catOptions} selected={cats} onChange={(a) => setArr('category', a)} />
          <ChipMultiSelect label="Кошельки" options={walletOptions} selected={wals} onChange={(a) => setArr('wallet', a)} />
          {tagOptions.length > 0 && (
            <ChipMultiSelect label="Теги" options={tagOptions} selected={tagSel} onChange={(a) => setArr('tag', a)} />
          )}
          <div className="chipms">
            <span className="chipms__label">Период</span>
            <div className="filters__dates">
              <input className="field__input" type="date" value={from} onChange={(e) => setSingle('from', e.target.value)} />
              <span className="muted">—</span>
              <input className="field__input" type="date" value={to} onChange={(e) => setSingle('to', e.target.value)} />
            </div>
          </div>
          {activeCount > 0 && <button className="link-btn-inline" onClick={clear}>Сбросить фильтры</button>}
        </div>
      )}

      <p className="muted" style={{ margin: '0.5rem 0' }}>Найдено: {filtered.length}</p>

      {filtered.length === 0 ? (
        <p className="muted empty">Ничего не найдено</p>
      ) : (
        groups.map(([month, items]) => (
          <section key={month} className="tx-group">
            <h3 className="tx-month">{month === '—' ? 'Без даты' : monthLabel(month)}</h3>
            <ul className="tx-list">{items.map(renderRow)}</ul>
          </section>
        ))
      )}
    </div>
  );
}
