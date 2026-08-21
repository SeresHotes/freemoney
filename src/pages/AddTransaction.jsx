import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { newId, todayIso } from '../utils/format';
import { CURRENCIES, currencySymbol } from '../utils/currencies';
import { getRate } from '../api/rates';

export default function AddTransaction() {
  const { type } = useParams(); // 'expense' | 'income'
  const navigate = useNavigate();
  const { categories, transactions, wallets, tags: knownTags, addTransaction } = useApp();

  const isExpense = type === 'expense';
  const activeWallets = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);

  const available = useMemo(
    () => categories.filter((c) => c.status === 'active' && (c.kind === type || c.kind === 'both')),
    [categories, type],
  );

  const [walletId, setWalletId] = useState(activeWallets[0]?.id || '');
  const walletCurrency = activeWallets.find((w) => w.id === walletId)?.currency || '';

  const [amount, setAmount] = useState('');
  const [entryCurrency, setEntryCurrency] = useState(walletCurrency);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletAmountTouched, setWalletAmountTouched] = useState(false);
  const [rateInfo, setRateInfo] = useState(null);

  const [category, setCategory] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // При смене кошелька приравниваем валюту ввода к валюте кошелька.
  useEffect(() => {
    setEntryCurrency(walletCurrency);
    setWalletAmountTouched(false);
  }, [walletCurrency]);

  const crossCurrency = entryCurrency && walletCurrency && entryCurrency !== walletCurrency;

  // Автоподсказка суммы в валюте кошелька по историческому курсу на дату.
  useEffect(() => {
    if (!crossCurrency || !amount) {
      setRateInfo(null);
      return;
    }
    let cancelled = false;
    getRate(entryCurrency, walletCurrency, date).then((rate) => {
      if (cancelled || rate == null) {
        if (!cancelled) setRateInfo({ error: true });
        return;
      }
      setRateInfo({ rate });
      if (!walletAmountTouched) {
        const converted = Number(String(amount).replace(',', '.')) * rate;
        setWalletAmount(converted ? converted.toFixed(2) : '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [crossCurrency, amount, entryCurrency, walletCurrency, date, walletAmountTouched]);

  const allTags = useMemo(() => {
    const set = new Set(knownTags);
    for (const t of transactions) (t.tags || []).forEach((tag) => set.add(tag));
    return [...set].sort();
  }, [knownTags, transactions]);

  const suggestions = useMemo(() => {
    const draft = tagDraft.trim().toLowerCase();
    return allTags
      .filter((t) => !tags.includes(t))
      .filter((t) => !draft || t.toLowerCase().includes(draft))
      .slice(0, 8);
  }, [allTags, tags, tagDraft]);

  const addTag = (raw) => {
    const value = raw.trim();
    if (value && !tags.includes(value)) setTags((prev) => [...prev, value]);
    setTagDraft('');
  };
  const removeTag = (tag) => setTags((prev) => prev.filter((t) => t !== tag));
  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagDraft);
    } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!walletId) {
      setFormError('Выберите кошелёк');
      return;
    }
    const value = Number(String(amount).replace(',', '.'));
    if (!value || value <= 0) {
      setFormError('Введите сумму больше нуля');
      return;
    }
    if (!category) {
      setFormError('Выберите категорию');
      return;
    }

    let finalAmount = value;
    let origAmount = null;
    let origCurrency = '';
    if (crossCurrency) {
      finalAmount = Number(String(walletAmount).replace(',', '.'));
      if (!finalAmount || finalAmount <= 0) {
        setFormError(`Укажите сумму в валюте кошелька (${walletCurrency})`);
        return;
      }
      origAmount = value;
      origCurrency = entryCurrency;
    }

    const finalTags = tagDraft.trim() && !tags.includes(tagDraft.trim()) ? [...tags, tagDraft.trim()] : tags;
    setSaving(true);
    try {
      await addTransaction({
        id: newId(),
        date,
        type,
        amount: finalAmount,
        category,
        note: note.trim(),
        tags: finalTags,
        wallet: walletId,
        currency: walletCurrency,
        origAmount,
        origCurrency,
      });
      navigate('/');
    } catch (err) {
      setFormError('Не удалось сохранить. Проверьте соединение и попробуйте снова.');
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header page__header--with-back">
        <button className="link-btn" onClick={() => navigate(-1)} aria-label="Назад">←</button>
        <h1>{isExpense ? 'Новый расход' : 'Новый доход'}</h1>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Кошелёк</span>
          <select className="field__input field__input--select" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            {activeWallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Сумма</span>
          <div className="amount-row">
            <input
              className="field__input field__input--amount"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            <select
              className="field__input field__input--select amount-row__cur"
              value={entryCurrency}
              onChange={(e) => { setEntryCurrency(e.target.value); setWalletAmountTouched(false); }}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </div>
        </label>

        {crossCurrency && (
          <label className="field conversion">
            <span className="field__label">
              Списать с кошелька, {walletCurrency}
              {rateInfo?.rate && (
                <span className="muted"> · курс 1 {entryCurrency} ≈ {rateInfo.rate.toFixed(4)} {walletCurrency}</span>
              )}
              {rateInfo?.error && <span className="form-error"> · курс не загрузился, впишите вручную</span>}
            </span>
            <input
              className="field__input"
              type="text"
              inputMode="decimal"
              placeholder={`Сумма в ${walletCurrency}`}
              value={walletAmount}
              onChange={(e) => { setWalletAmount(e.target.value); setWalletAmountTouched(true); }}
            />
          </label>
        )}

        <label className="field">
          <span className="field__label">Категория</span>
          {available.length === 0 ? (
            <p className="muted">
              Нет активных категорий этого типа.{' '}
              <button type="button" className="link-btn-inline" onClick={() => navigate('/categories')}>Добавить</button>
            </p>
          ) : (
            <div className="category-grid">
              {available.map((c) => (
                <button
                  type="button"
                  key={c.name}
                  className={`category-chip${category === c.name ? ' category-chip--active' : ''}`}
                  onClick={() => setCategory(c.name)}
                >
                  <span className="category-chip__icon">{c.icon}</span>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </label>

        <label className="field">
          <span className="field__label">Дата</span>
          <input className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">Теги (необязательно)</span>
          <div className="tag-input">
            {tags.map((t) => (
              <span key={t} className="tag-chip tag-chip--removable" onClick={() => removeTag(t)}>
                #{t}<span className="tag-chip__x">×</span>
              </span>
            ))}
            <input
              className="tag-input__field"
              type="text"
              placeholder={tags.length ? '' : 'работа, отпуск…'}
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => tagDraft.trim() && addTag(tagDraft)}
            />
          </div>
          {suggestions.length > 0 && (
            <div className="tag-suggestions">
              {suggestions.map((t) => (
                <button type="button" key={t} className="tag-chip tag-chip--suggestion" onClick={() => addTag(t)}>#{t}</button>
              ))}
            </div>
          )}
        </label>

        <label className="field">
          <span className="field__label">Заметка (необязательно)</span>
          <input className="field__input" type="text" placeholder="Например: обед с коллегами" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {formError && <p className="form-error">{formError}</p>}

        <button type="submit" className={`btn btn--block ${isExpense ? 'btn--expense' : 'btn--income'}`} disabled={saving}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </form>
    </div>
  );
}
