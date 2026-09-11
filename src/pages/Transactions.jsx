import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatAmount } from '../utils/currencies';
import { monthKey, monthLabel } from '../utils/format';
import { isIncome, matchesFilters, isDebtWallet, debtBalanceBefore, debtRowLabel } from '../utils/finance';
import ChipMultiSelect from '../components/ChipMultiSelect';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
  { value: 'transfer', label: 'Переводы' },
  { value: 'adjust', label: 'Корректировки' },
  { value: 'interest', label: 'Проценты' },
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

  // Пары ног перевода/долга по transferId — берём из полного списка, чтобы
  // показать обе стороны (A → B) даже когда фильтр по кошельку оставил одну ногу.
  const pairs = useMemo(() => {
    const m = new Map();
    for (const t of transactions) {
      if (!t.transferId) continue;
      if (!m.has(t.transferId)) m.set(t.transferId, {});
      const p = m.get(t.transferId);
      if (t.type === 'transfer_out') p.out = t;
      else if (t.type === 'transfer_in') p.in = t;
    }
    return m;
  }, [transactions]);

  const catOptions = useMemo(() => categories.map((c) => ({ value: c.name, label: `${c.icon} ${c.name}` })), [categories]);
  const walletOptions = useMemo(
    () => wallets.filter((w) => w.status === 'active').map((w) => ({ value: w.id, label: w.name })),
    [wallets],
  );
  const tagOptions = useMemo(() => {
    const set = new Set(tags);
    for (const t of transactions) (t.tags || []).forEach((x) => set.add(x));
    return [...set].sort().map((t) => ({ value: t, label: t }));
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
      .sort((a, b) => {
        const ka = `${a.date} ${a.time || ''}`;
        const kb = `${b.date} ${b.time || ''}`;
        return ka < kb ? 1 : ka > kb ? -1 : 0;
      });
  }, [transactions, query, types, cats, tagSel, wals, from, to]);

  const activeCount = types.length + cats.length + tagSel.length + wals.length + (from ? 1 : 0) + (to ? 1 : 0);
  const clear = () => setSearchParams({}, { replace: true });

  // Число видимых строк: пара ног перевода/долга считается как одна.
  const displayedCount = useMemo(() => {
    const seen = new Set();
    let n = 0;
    for (const t of filtered) {
      if ((t.type === 'transfer_out' || t.type === 'transfer_in') && t.transferId) {
        if (seen.has(t.transferId)) continue;
        seen.add(t.transferId);
      }
      n += 1;
    }
    return n;
  }, [filtered]);

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

  // Перевод/долг — одна строка на пару. Обычный перевод: «A → B» нейтрально.
  // Долг: своя иконка и подпись (дал/взял/возврат/погашение), сумма — со стороны
  // моего кошелька (ушло «−», пришло «+»).
  const renderPairRow = (t) => {
    const pair = pairs.get(t.transferId) || {};
    const outLeg = pair.out;
    const inLeg = pair.in;
    const outW = outLeg ? walletById.get(outLeg.wallet) : null;
    const inW = inLeg ? walletById.get(inLeg.wallet) : null;
    const isDebt = isDebtWallet(outW) || isDebtWallet(inW);

    let icon;
    let title;
    let subtitle;
    let amountText;
    let amountClass = null;
    let to;

    if (isDebt) {
      const cashOut = isDebtWallet(inW); // деньги ушли из кошелька (out) в долг (in)
      const debtLeg = cashOut ? inLeg : outLeg;
      const debtW = cashOut ? inW : outW;
      const cashLeg = cashOut ? outLeg : inLeg;
      const balBefore = debtLeg ? debtBalanceBefore(transactions, debtW.id, debtLeg) : 0;
      const amt = cashLeg ? cashLeg.amount : debtLeg?.amount || 0;
      const cur = cashLeg ? cashLeg.currency : debtLeg?.currency;
      icon = '🤝';
      title = debtRowLabel(cashOut, balBefore);
      subtitle = debtW?.name || '';
      amountClass = cashOut ? 'expense' : 'income';
      amountText = `${cashOut ? '−' : '+'}${formatAmount(amt, cur)}`;
      to = `/debt/${t.transferId}`;
    } else {
      const sameVal = outLeg && inLeg && outLeg.currency === inLeg.currency && outLeg.amount === inLeg.amount;
      icon = '⇄';
      title = 'Перевод';
      subtitle = `${outW?.name || '—'} → ${inW?.name || '—'}`;
      amountText = sameVal
        ? formatAmount(outLeg.amount, outLeg.currency)
        : `${formatAmount(outLeg?.amount || 0, outLeg?.currency)} → ${formatAmount(inLeg?.amount || 0, inLeg?.currency)}`;
      to = `/transfer/${t.transferId}`;
    }

    return (
      <li key={t.transferId} className="tx-item tx-item--clickable" onClick={() => navigate(to)}>
        <span className="tx-item__cat-icon">{icon}</span>
        <div className="tx-item__main">
          <span className="tx-item__category">{title}</span>
          <span className="tx-item__note">{subtitle}{t.note ? ` · ${t.note}` : ''}</span>
        </div>
        <div className="tx-item__right">
          <span className={`tx-item__amount${amountClass ? ` tx-item__amount--${amountClass}` : ''}`}>{amountText}</span>
          <span className="tx-item__date">{t.time ? `${t.date} ${t.time.slice(0, 5)}` : t.date}</span>
        </div>
      </li>
    );
  };

  const renderRow = (t, shown) => {
    if ((t.type === 'transfer_out' || t.type === 'transfer_in') && t.transferId) {
      if (shown.has(t.transferId)) return null; // вторую ногу пары не показываем
      shown.add(t.transferId);
      return renderPairRow(t);
    }
    const adjust = t.type.startsWith('adjust');
    const interest = t.type.startsWith('interest');
    const positive = isIncome(t) || t.type === 'adjust_in' || t.type === 'interest_in';
    const icon = interest ? '📈' : adjust ? '⚖️' : iconByCategory.get(t.category) || '🏷️';
    const title = interest
      ? (t.rate != null ? `Проценты · ${t.rate}%` : 'Проценты')
      : adjust ? 'Корректировка' : t.category || 'Без категории';
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
            <span className="tx-item__tags">{t.tags.map((x) => <span key={x} className="tag-chip tag-chip--mini">{x}</span>)}</span>
          )}
        </div>
        <div className="tx-item__right">
          <span className={`tx-item__amount tx-item__amount--${positive ? 'income' : 'expense'}`}>{positive ? '+' : '−'}{formatAmount(t.amount, t.currency)}</span>
          <span className="tx-item__date">{t.time ? `${t.date} ${t.time.slice(0, 5)}` : t.date}</span>
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

      <p className="muted" style={{ margin: '0.5rem 0' }}>Найдено: {displayedCount}</p>

      {filtered.length === 0 ? (
        <p className="muted empty">Ничего не найдено</p>
      ) : (
        (() => {
          const shown = new Set();
          return groups.map(([month, items]) => (
            <section key={month} className="tx-group">
              <h3 className="tx-month">{month === '—' ? 'Без даты' : monthLabel(month)}</h3>
              <ul className="tx-list">{items.map((t) => renderRow(t, shown))}</ul>
            </section>
          ));
        })()
      )}
    </div>
  );
}
