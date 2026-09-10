import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { CURRENCIES, formatAmount } from '../utils/currencies';
import { walletBalance } from '../utils/finance';

export default function WalletEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { wallets, transactions, addWallet, updateWallet, setWalletStatus, setWalletBalance } = useApp();

  const editing = id != null;
  const current = editing ? wallets.find((w) => String(w.id) === String(id)) : null;

  const [name, setName] = useState(current?.name || '');
  const [currency, setCurrency] = useState(current?.currency || CURRENCIES[0].code);
  const [kind, setKind] = useState(current?.kind || 'cash');
  const [balanceInput, setBalanceInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  if (editing && !current) {
    return (
      <div className="page">
        <header className="page__header page__header--with-back">
          <button className="link-btn" onClick={() => navigate('/wallets')}>←</button>
          <h1>Кошелёк</h1>
        </header>
        <p className="muted">Кошелёк не найден.</p>
      </div>
    );
  }

  const currentBalance = current ? walletBalance(transactions, current.id) : 0;

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const trimmed = name.trim();
    if (!trimmed) { setFormError('Введите название'); return; }
    setBusy(true);
    try {
      if (editing) {
        await updateWallet(current, { name: trimmed, currency, kind });
        const raw = balanceInput.trim();
        if (raw !== '') {
          const target = Number(raw.replace(',', '.'));
          if (!Number.isNaN(target)) await setWalletBalance(current, target);
        }
      } else {
        await addWallet({ name: trimmed, currency, kind });
      }
      navigate('/wallets');
    } catch {
      setFormError('Не удалось сохранить');
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    setBusy(true);
    try {
      await setWalletStatus(current, current.status === 'active' ? 'archived' : 'active');
      navigate('/wallets');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header page__header--with-back">
        <button className="link-btn" onClick={() => navigate('/wallets')} aria-label="Назад">←</button>
        <h1>{editing ? 'Кошелёк' : 'Новый кошелёк'}</h1>
      </header>

      <form className="form" onSubmit={submit}>
        <input className="field__input" type="text" placeholder="Название кошелька" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        <label className="field">
          <span className="field__label">Валюта</span>
          <select className="field__input field__input--select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Тип</span>
          <select className="field__input field__input--select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="cash">Обычный</option>
            <option value="debt">Долг (кому / от кого)</option>
          </select>
        </label>

        {editing && (
          <label className="field">
            <span className="field__label">
              Реальный баланс сейчас · в приложении: {formatAmount(currentBalance, current.currency)}
            </span>
            <input
              className="field__input"
              type="text"
              inputMode="decimal"
              placeholder={`оставьте пустым, чтобы не менять (${current.currency})`}
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
            />
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              Если укажете сумму, создастся операция-корректировка на разницу.
            </span>
          </label>
        )}

        {formError && <p className="form-error">{formError}</p>}

        <button className="btn btn--block btn--primary" type="submit" disabled={busy}>Сохранить</button>
        {editing && (
          <button type="button" className={`btn btn--block${current.status === 'active' ? ' btn--danger' : ''}`} onClick={toggleArchive} disabled={busy}>
            {current.status === 'active' ? 'В архив' : 'Восстановить'}
          </button>
        )}
      </form>
    </div>
  );
}
