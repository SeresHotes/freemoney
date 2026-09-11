import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatAmount } from '../utils/currencies';
import { walletBalanceAsOf } from '../utils/finance';

const fmt = (n) => (Number.isFinite(n) ? String(Number(n.toFixed(2))) : '');
const parse = (s) => Number(String(s).replace(',', '.'));

// Правка процентной операции своим экраном (не общей формой дохода/расхода):
// «было» (по умолчанию — баланс на дату операции, редактируемо), процент, режим
// и read-only «станет». Смена даты пересчитывает «было» из баланса на тот момент.
export default function EditInterest({ tx }) {
  const navigate = useNavigate();
  const { wallets, transactions, updateTransaction, deleteTransaction } = useApp();

  const wallet = wallets.find((w) => w.id === tx.wallet);
  const currency = wallet?.currency || tx.currency;

  const [date, setDate] = useState(tx.date);
  const [time, setTime] = useState(tx.time || '');
  const [mode, setMode] = useState(tx.type === 'interest_out' ? 'subtract' : 'add');
  const [percent, setPercent] = useState(tx.rate != null ? String(tx.rate) : '');
  const [baseStr, setBaseStr] = useState('');
  const [baseTouched, setBaseTouched] = useState(false);
  const [note, setNote] = useState(tx.note || '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Баланс кошелька на момент операции без неё самой.
  const balanceAsOf = useMemo(
    () => walletBalanceAsOf(transactions, tx.wallet, `${date} ${time || '99:99'}`, tx.id),
    [transactions, tx.wallet, tx.id, date, time],
  );

  // Пока «было» не тронули руками — держим равным балансу на дату.
  useEffect(() => {
    if (!baseTouched) setBaseStr(fmt(balanceAsOf));
  }, [balanceAsOf, baseTouched]);

  const base = parse(baseStr);
  const hasBase = baseStr.trim() !== '' && !Number.isNaN(base);
  const rate = parse(percent) || 0;
  const amount = hasBase ? Math.abs((base * rate) / 100) : 0;
  const subtract = mode === 'subtract';
  const newBalance = base + (subtract ? -amount : amount);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!hasBase) { setFormError('Введите сумму «было»'); return; }
    if (!rate) { setFormError('Введите процент'); return; }
    if (amount < 0.005) { setFormError('Считать нечего — сумма нулевая'); return; }

    const next = {
      ...tx,
      type: subtract ? 'interest_out' : 'interest_in',
      amount,
      rate,
      category: '',
      date,
      time,
      note: note.trim(),
    };
    setSaving(true);
    try {
      await updateTransaction(next);
      navigate(-1);
    } catch {
      setFormError('Не удалось сохранить. Попробуйте снова.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Удалить операцию?')) return;
    setSaving(true);
    try {
      await deleteTransaction(tx.id);
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
        <h1>Проценты</h1>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <span className="field__label">Счёт</span>
          <p className="muted">{wallet ? `${wallet.name} (${currency})` : currency}</p>
        </div>

        <div className="field">
          <span className="field__label">Дата и время</span>
          <div className="datetime-row">
            <input
              className="field__input"
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setBaseTouched(false); }}
            />
            <input
              className="field__input datetime-row__time"
              type="time"
              value={(time || '').slice(0, 5)}
              onChange={(e) => { setTime(e.target.value); setBaseTouched(false); }}
            />
          </div>
        </div>

        <label className="field">
          <span className="field__label">
            Было, {currency}
            {!baseTouched && <span className="muted"> · баланс на дату</span>}
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
          />
        </label>

        {hasBase && rate > 0 && (
          <div className="balance-card" style={{ padding: '1rem' }}>
            <div className="muted">Было: {formatAmount(base, currency)}</div>
            <div className="balance-card__value" style={{ fontSize: '1.4rem' }}>
              {subtract ? 'Списать −' : 'Начислить +'}{formatAmount(amount, currency)}
            </div>
            <div className="muted">Станет: {formatAmount(newBalance, currency)}</div>
          </div>
        )}

        <label className="field">
          <span className="field__label">Заметка (необязательно)</span>
          <input className="field__input" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {formError && <p className="form-error">{formError}</p>}

        <button type="submit" className="btn btn--block btn--income" disabled={saving}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button type="button" className="btn btn--block btn--danger" onClick={handleDelete} disabled={saving}>
          Удалить операцию
        </button>
      </form>
    </div>
  );
}
