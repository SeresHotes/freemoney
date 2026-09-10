import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatAmount } from '../utils/currencies';
import { walletBalance } from '../utils/finance';

// Быстрая корректировка баланса с главной: выбираем кошелёк, вводим реальный
// баланс — приложение создаёт операцию-корректировку на разницу.
export default function NewAdjustment() {
  const navigate = useNavigate();
  const { wallets, transactions, setWalletBalance } = useApp();

  const activeWallets = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);
  const [walletId, setWalletId] = useState(() => activeWallets[0]?.id || '');
  const [balanceInput, setBalanceInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const wallet = wallets.find((w) => w.id === walletId);
  const current = wallet ? walletBalance(transactions, wallet.id) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!wallet) { setFormError('Выберите кошелёк'); return; }
    const raw = balanceInput.trim();
    if (raw === '') { setFormError('Введите реальный баланс'); return; }
    const target = Number(raw.replace(',', '.'));
    if (Number.isNaN(target)) { setFormError('Введите число'); return; }

    setSaving(true);
    try {
      await setWalletBalance(wallet, target);
      navigate(-1);
    } catch {
      setFormError('Не удалось сохранить. Попробуйте снова.');
      setSaving(false);
    }
  };

  if (activeWallets.length === 0) {
    return (
      <div className="page">
        <header className="page__header page__header--with-back">
          <button className="link-btn" onClick={() => navigate(-1)} aria-label="Назад">←</button>
          <h1>Корректировка баланса</h1>
        </header>
        <p className="muted">
          Нет активных кошельков. <button type="button" className="link-btn-inline" onClick={() => navigate('/wallets')}>Добавить</button>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__header page__header--with-back">
        <button className="link-btn" onClick={() => navigate(-1)} aria-label="Назад">←</button>
        <h1>Корректировка баланса</h1>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Кошелёк</span>
          <select className="field__input field__input--select" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            {activeWallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
          </select>
        </label>

        <label className="field">
          <span className="field__label">
            Реальный баланс сейчас · сейчас в приложении: {formatAmount(current, wallet.currency)}
          </span>
          <input
            className="field__input field__input--amount"
            type="text"
            inputMode="decimal"
            placeholder={`Сумма в ${wallet.currency}`}
            value={balanceInput}
            onChange={(e) => setBalanceInput(e.target.value)}
            autoFocus
          />
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            Создастся операция-корректировка на разницу.
          </span>
        </label>

        {formError && <p className="form-error">{formError}</p>}

        <button type="submit" className="btn btn--block btn--income" disabled={saving}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </form>
    </div>
  );
}
