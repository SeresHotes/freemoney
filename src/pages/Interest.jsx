import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { todayIso } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import { walletBalance } from '../utils/finance';

export default function Interest() {
  const { wallets, transactions, accrueInterest } = useApp();
  const navigate = useNavigate();

  const active = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);

  const [walletId, setWalletId] = useState(active[0]?.id || '');
  const [percent, setPercent] = useState('');
  const [percentTouched, setPercentTouched] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const wallet = active.find((w) => w.id === walletId);
  const balance = wallet ? walletBalance(transactions, wallet.id) : 0;
  const rate = Number(String(percent).replace(',', '.')) || 0;
  const delta = (balance * rate) / 100;

  // При выборе кошелька подставляем его ставку по умолчанию (если её не трогали).
  useEffect(() => {
    if (percentTouched) return;
    setPercent(wallet?.rate ? String(wallet.rate) : '');
  }, [wallet, percentTouched]);

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!wallet) { setFormError('Выберите кошелёк'); return; }
    if (!rate) { setFormError('Введите процент'); return; }
    if (Math.abs(delta) < 0.005) { setFormError('Баланс нулевой — начислять нечего'); return; }
    setSaving(true);
    try {
      await accrueInterest(wallet, rate, date);
      navigate('/');
    } catch {
      setFormError('Не удалось начислить');
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header page__header--with-back">
        <button className="link-btn" onClick={() => navigate(-1)} aria-label="Назад">←</button>
        <h1>Проценты</h1>
      </header>

      <form className="form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">Счёт</span>
          <select className="field__input field__input--select" value={walletId} onChange={(e) => { setWalletId(e.target.value); setPercentTouched(false); }}>
            {active.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {formatAmount(walletBalance(transactions, w.id), w.currency)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Процент, %</span>
          <input
            className="field__input field__input--amount"
            type="text"
            inputMode="decimal"
            placeholder="например 5"
            value={percent}
            onChange={(e) => { setPercent(e.target.value); setPercentTouched(true); }}
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field__label">Дата</span>
          <input className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        {wallet && rate > 0 && (
          <div className="balance-card" style={{ padding: '1rem' }}>
            <div className="muted">Баланс: {formatAmount(balance, wallet.currency)}</div>
            <div className="balance-card__value" style={{ fontSize: '1.4rem' }}>
              {delta >= 0 ? 'Доход +' : 'Расход −'}{formatAmount(Math.abs(delta), wallet.currency)}
            </div>
            <div className="muted">Станет: {formatAmount(balance + delta, wallet.currency)}</div>
          </div>
        )}

        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="btn btn--block btn--primary" disabled={saving}>{saving ? 'Начисляю…' : 'Начислить'}</button>
      </form>
    </div>
  );
}
