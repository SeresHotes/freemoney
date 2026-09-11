import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { todayIso } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import { walletBalanceAsOf } from '../utils/finance';

const fmt = (n) => (Number.isFinite(n) ? String(Number(n.toFixed(2))) : '');
const parse = (s) => Number(String(s).replace(',', '.'));

// Проценты — балансовая операция (не доход/расход, без категории). Считаем от
// «было» (по умолчанию — баланс кошелька на выбранную дату, можно поправить
// вручную) и ставки; «станет» показывается без правки. Смена даты подставляет
// баланс на тот момент.
export default function Interest() {
  const { wallets, transactions, accrueInterest } = useApp();
  const navigate = useNavigate();

  const active = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);

  const [walletId, setWalletId] = useState(active[0]?.id || '');
  const [percent, setPercent] = useState('');
  const [mode, setMode] = useState('add'); // 'add' — начислить, 'subtract' — списать
  const [date, setDate] = useState(todayIso());
  const [baseStr, setBaseStr] = useState('');
  const [baseTouched, setBaseTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const wallet = active.find((w) => w.id === walletId);
  // Баланс на конец выбранной даты (все операции этого дня и раньше).
  const balanceAsOf = useMemo(
    () => (wallet ? walletBalanceAsOf(transactions, wallet.id, `${date} 99:99`, null) : 0),
    [wallet, transactions, date],
  );

  // Пока «было» не тронули руками — держим его равным балансу на дату.
  useEffect(() => {
    if (!baseTouched) setBaseStr(fmt(balanceAsOf));
  }, [balanceAsOf, baseTouched]);

  const base = parse(baseStr);
  const hasBase = baseStr.trim() !== '' && !Number.isNaN(base);
  const rate = parse(percent) || 0;
  const amount = hasBase ? Math.abs((base * rate) / 100) : 0;
  const subtract = mode === 'subtract';
  const newBalance = base + (subtract ? -amount : amount);

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!wallet) { setFormError('Выберите счёт'); return; }
    if (!hasBase) { setFormError('Введите сумму «было»'); return; }
    if (!rate) { setFormError('Введите процент'); return; }
    if (amount < 0.005) { setFormError('Считать нечего — сумма нулевая'); return; }
    setSaving(true);
    try {
      await accrueInterest({ wallet, base, rate, date, direction: mode });
      navigate('/');
    } catch {
      setFormError('Не удалось выполнить');
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
          <select
            className="field__input field__input--select"
            value={walletId}
            onChange={(e) => { setWalletId(e.target.value); setBaseTouched(false); }}
          >
            {active.map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Дата</span>
          <input
            className="field__input"
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setBaseTouched(false); }}
          />
        </label>

        <label className="field">
          <span className="field__label">
            Было{wallet ? `, ${wallet.currency}` : ''}
            {wallet && !baseTouched && <span className="muted"> · баланс на дату</span>}
          </span>
          <input
            className="field__input field__input--amount"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={baseStr}
            onChange={(e) => { setBaseStr(e.target.value); setBaseTouched(true); }}
          />
        </label>

        <label className="field">
          <span className="field__label">Что сделать</span>
          <select className="field__input field__input--select" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="add">Начислить (+)</option>
            <option value="subtract">Списать (−)</option>
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
            onChange={(e) => setPercent(e.target.value)}
            autoFocus
          />
        </label>

        {wallet && hasBase && rate > 0 && (
          <div className="balance-card" style={{ padding: '1rem' }}>
            <div className="muted">Было: {formatAmount(base, wallet.currency)}</div>
            <div className="balance-card__value" style={{ fontSize: '1.4rem' }}>
              {subtract ? 'Списать −' : 'Начислить +'}{formatAmount(amount, wallet.currency)}
            </div>
            <div className="muted">Станет: {formatAmount(newBalance, wallet.currency)}</div>
          </div>
        )}

        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="btn btn--block btn--primary" disabled={saving}>{saving ? 'Выполняю…' : subtract ? 'Списать' : 'Начислить'}</button>
      </form>
    </div>
  );
}
