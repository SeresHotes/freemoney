import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { CURRENCIES, formatAmount } from '../utils/currencies';
import { walletBalance } from '../utils/finance';

export default function Wallets() {
  const { wallets, transactions, addWallet, updateWallet, setWalletStatus, setWalletBalance } = useApp();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(CURRENCIES[0].code);
  const [balanceInput, setBalanceInput] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const editingBalance = editing ? walletBalance(transactions, editing.id) : 0;

  const active = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);
  const archived = useMemo(() => wallets.filter((w) => w.status === 'archived'), [wallets]);

  const reset = () => {
    setEditing(null);
    setName('');
    setCurrency(CURRENCIES[0].code);
    setBalanceInput('');
    setFormError(null);
  };

  const startEdit = (w) => {
    setEditing(w);
    setName(w.name);
    setCurrency(w.currency);
    setBalanceInput('');
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Введите название');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updateWallet(editing, { name: trimmed, currency });
        // Если указан реальный баланс — создаём корректировку на разницу.
        const raw = balanceInput.trim();
        if (raw !== '') {
          const target = Number(raw.replace(',', '.'));
          if (!Number.isNaN(target)) await setWalletBalance(editing, target);
        }
      } else {
        await addWallet({ name: trimmed, currency });
      }
      reset();
    } catch {
      setFormError('Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const archive = async (w) => {
    setBusy(true);
    try {
      await setWalletStatus(w, w.status === 'active' ? 'archived' : 'active');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Кошельки</h1>
      </header>

      <form className="form add-cat" onSubmit={submit}>
        {editing && <p className="section-title" style={{ margin: 0 }}>Редактирование кошелька</p>}
        <input className="field__input" type="text" placeholder="Название кошелька" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="add-cat__row">
          <select className="field__input field__input--select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
            ))}
          </select>
          <button className="btn btn--primary" type="submit" disabled={busy}>{editing ? 'Сохранить' : 'Добавить'}</button>
          {editing && <button type="button" className="btn" onClick={reset} disabled={busy}>Отмена</button>}
        </div>

        {editing && (
          <label className="field">
            <span className="field__label">
              Реальный баланс сейчас · сейчас в приложении: {formatAmount(editingBalance, editing.currency)}
            </span>
            <input
              className="field__input"
              type="text"
              inputMode="decimal"
              placeholder={`оставьте пустым, чтобы не менять (${editing.currency})`}
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
            />
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              Если укажете сумму, создастся операция-корректировка на разницу.
            </span>
          </label>
        )}
      </form>
      {formError && <p className="form-error">{formError}</p>}

      <button className="btn btn--block" style={{ marginTop: '1rem' }} onClick={() => navigate('/transfer')}>
        ⇄ Перевод между кошельками
      </button>

      <section>
        <h2 className="section-title">Активные ({active.length})</h2>
        <ul className="cat-list">
          {active.map((w) => (
            <li key={w.id} className="cat-item cat-item--clickable" onClick={() => navigate(`/transactions?wallet=${w.id}`)}>
              <div className="cat-item__main">
                <span className="cat-item__name">{w.name}</span>
                <span className="kind-badge">{w.currency}</span>
              </div>
              <div className="cat-item__right">
                <span className="wallet-balance">{formatAmount(walletBalance(transactions, w.id), w.currency)}</span>
                <div className="cat-item__actions">
                  <button className="link-btn cat-item__action" disabled={busy} onClick={(e) => { e.stopPropagation(); startEdit(w); }} title="Редактировать">✏️</button>
                  <button className="link-btn cat-item__action" disabled={busy} onClick={(e) => { e.stopPropagation(); archive(w); }} title="В архив">🗑️</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {archived.length > 0 && (
        <section>
          <h2 className="section-title">Архив ({archived.length})</h2>
          <ul className="cat-list cat-list--archived">
            {archived.map((w) => (
              <li key={w.id} className="cat-item cat-item--archived">
                <div className="cat-item__main">
                  <span className="cat-item__name">{w.name}</span>
                  <span className="kind-badge">{w.currency}</span>
                </div>
                <button className="link-btn cat-item__action" disabled={busy} onClick={() => archive(w)} title="Восстановить">♻️</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
