import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { newId, todayIso, nowTime } from '../utils/format';
import { CURRENCIES } from '../utils/currencies';
import { getRate } from '../api/rates';

export default function AddTransaction() {
  const params = useParams();
  const navigate = useNavigate();
  const {
    categories, transactions, wallets, tags: knownTags,
    addTransaction, updateTransaction, deleteTransaction,
  } = useApp();

  const editing = Boolean(params.id);
  const editingTx = editing ? transactions.find((t) => t.id === params.id) : null;
  const type = editing ? editingTx?.type : params.type; // 'expense' | 'income'
  const isExpense = type === 'expense';

  const activeWallets = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);
  const currencyOf = (id) => wallets.find((w) => w.id === id)?.currency || '';

  const available = useMemo(
    () => categories.filter((c) => c.status === 'active' && (c.kind === type || c.kind === 'both')),
    [categories, type],
  );

  const [walletId, setWalletId] = useState(
    () => editingTx?.wallet || activeWallets[0]?.id || '',
  );
  const walletCurrency = currencyOf(walletId);

  const [amount, setAmount] = useState(() =>
    editingTx ? String(editingTx.origAmount ?? editingTx.amount) : '',
  );
  const [entryCurrency, setEntryCurrency] = useState(
    () => editingTx?.origCurrency || editingTx?.currency || currencyOf(walletId),
  );
  const [walletAmount, setWalletAmount] = useState(() =>
    editingTx?.origCurrency ? String(editingTx.amount) : '',
  );
  const [walletAmountTouched, setWalletAmountTouched] = useState(Boolean(editingTx?.origCurrency));
  const [rateInfo, setRateInfo] = useState(null);

  const [category, setCategory] = useState(() => editingTx?.category || '');
  const [date, setDate] = useState(() => editingTx?.date || todayIso());
  const [time, setTime] = useState(() => editingTx?.time || nowTime());
  const [note, setNote] = useState(() => editingTx?.note || '');
  const [tags, setTags] = useState(() => editingTx?.tags || []);
  const [tagDraft, setTagDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const changeWallet = (id) => {
    setWalletId(id);
    setEntryCurrency(currencyOf(id));
    setWalletAmountTouched(false);
  };

  const crossCurrency = entryCurrency && walletCurrency && entryCurrency !== walletCurrency;

  useEffect(() => {
    if (!crossCurrency || !amount) {
      setRateInfo(null);
      return;
    }
    let cancelled = false;
    getRate(entryCurrency, walletCurrency, date).then((rate) => {
      if (cancelled) return;
      if (rate == null) { setRateInfo({ error: true }); return; }
      setRateInfo({ rate });
      if (!walletAmountTouched) {
        const converted = Number(String(amount).replace(',', '.')) * rate;
        setWalletAmount(converted ? converted.toFixed(2) : '');
      }
    });
    return () => { cancelled = true; };
  }, [crossCurrency, amount, entryCurrency, walletCurrency, date, walletAmountTouched]);

  // Подсказки — только из управляемого списка тегов (удалённые не показываются).
  const allTags = useMemo(() => [...knownTags].sort(), [knownTags]);

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
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft); }
    else if (e.key === 'Backspace' && !tagDraft && tags.length) removeTag(tags[tags.length - 1]);
  };

  // Переводы и корректировки правим/удаляем отдельно — здесь только обычные операции.
  const special = editingTx && (editingTx.type.startsWith('transfer') || editingTx.type.startsWith('adjust'));
  if (editing && (!editingTx || special)) {
    const isAdjust = editingTx?.type.startsWith('adjust');
    return (
      <div className="page">
        <header className="page__header page__header--with-back">
          <button className="link-btn" onClick={() => navigate(-1)}>←</button>
          <h1>Операция</h1>
        </header>
        {!editingTx ? (
          <p className="muted">Операция не найдена.</p>
        ) : (
          <>
            <p className="muted">
              {isAdjust ? 'Корректировку баланса' : 'Перевод между кошельками'} нельзя отредактировать — только удалить.
            </p>
            <button
              className="btn btn--block btn--expense"
              onClick={async () => { await deleteTransaction(editingTx.id); navigate(-1); }}
            >
              Удалить
            </button>
          </>
        )}
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!walletId) { setFormError('Выберите кошелёк'); return; }
    const value = Number(String(amount).replace(',', '.'));
    if (!value || value <= 0) { setFormError('Введите сумму больше нуля'); return; }
    if (!category) { setFormError('Выберите категорию'); return; }

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
    const tx = {
      id: editingTx?.id || newId(),
      date, time, type, amount: finalAmount, category, note: note.trim(), tags: finalTags,
      wallet: walletId, currency: walletCurrency, origAmount, origCurrency,
      transferId: '',
    };
    setSaving(true);
    try {
      if (editing) await updateTransaction(tx);
      else await addTransaction(tx);
      navigate(-1);
    } catch (err) {
      setFormError('Не удалось сохранить. Попробуйте снова.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Удалить операцию?')) return;
    setSaving(true);
    try {
      await deleteTransaction(editingTx.id);
      navigate(-1);
    } catch {
      setFormError('Не удалось удалить.');
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header page__header--with-back">
        <button className="link-btn" onClick={() => navigate(-1)} aria-label="Назад">←</button>
        <h1>{editing ? 'Редактировать' : isExpense ? 'Новый расход' : 'Новый доход'}</h1>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Кошелёк</span>
          <select className="field__input field__input--select" value={walletId} onChange={(e) => changeWallet(e.target.value)}>
            {activeWallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Сумма</span>
          <div className="amount-row">
            <input className="field__input field__input--amount" type="text" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={!editing} />
            <select className="field__input field__input--select amount-row__cur" value={entryCurrency} onChange={(e) => { setEntryCurrency(e.target.value); setWalletAmountTouched(false); }}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </div>
        </label>

        {crossCurrency && (
          <label className="field conversion">
            <span className="field__label">
              Списать с кошелька, {walletCurrency}
              {rateInfo?.rate && <span className="muted"> · курс 1 {entryCurrency} ≈ {rateInfo.rate.toFixed(4)} {walletCurrency}</span>}
              {rateInfo?.error && <span className="form-error"> · курс не загрузился, впишите вручную</span>}
            </span>
            <input className="field__input" type="text" inputMode="decimal" placeholder={`Сумма в ${walletCurrency}`} value={walletAmount} onChange={(e) => { setWalletAmount(e.target.value); setWalletAmountTouched(true); }} />
          </label>
        )}

        <label className="field">
          <span className="field__label">Категория</span>
          {available.length === 0 ? (
            <p className="muted">Нет активных категорий этого типа. <button type="button" className="link-btn-inline" onClick={() => navigate('/categories')}>Добавить</button></p>
          ) : (
            <div className="category-grid">
              {available.map((c) => (
                <button type="button" key={c.name} className={`category-chip${category === c.name ? ' category-chip--active' : ''}`} onClick={() => setCategory(c.name)}>
                  <span className="category-chip__icon">{c.icon}</span>{c.name}
                </button>
              ))}
            </div>
          )}
        </label>

        <div className="field">
          <span className="field__label">Дата и время</span>
          <div className="datetime-row">
            <input className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className="field__input datetime-row__time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <label className="field">
          <span className="field__label">Теги (необязательно)</span>
          <div className="tag-input">
            {tags.map((t) => (
              <span key={t} className="tag-chip tag-chip--removable" onClick={() => removeTag(t)}>#{t}<span className="tag-chip__x">×</span></span>
            ))}
            <input className="tag-input__field" type="text" placeholder={tags.length ? '' : 'работа, отпуск…'} value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={handleTagKeyDown} onBlur={() => tagDraft.trim() && addTag(tagDraft)} />
          </div>
          {suggestions.length > 0 && (
            <div className="tag-suggestions">
              {suggestions.map((t) => <button type="button" key={t} className="tag-chip tag-chip--suggestion" onClick={() => addTag(t)}>#{t}</button>)}
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
        {editing && (
          <button type="button" className="btn btn--block btn--danger" onClick={handleDelete} disabled={saving}>
            Удалить операцию
          </button>
        )}
      </form>
    </div>
  );
}
