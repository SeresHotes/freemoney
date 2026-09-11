import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatAmount } from '../utils/currencies';
import { walletBalance } from '../utils/finance';

// Аккуратно печатаем число в поле: округляем до копеек и убираем хвостовые нули.
const fmt = (n) => (Number.isFinite(n) ? String(Number(n.toFixed(2))) : '');
const parse = (s) => Number(String(s).replace(',', '.'));

// Корректировку правим двумя связанными полями: «итоговый баланс» и «изменение».
// Правка одного пересчитывает второе. Валюта берётся от кошелька — без выбора.
export default function EditAdjustment({ tx }) {
  const navigate = useNavigate();
  const { wallets, transactions, updateTransaction, deleteTransaction } = useApp();

  const wallet = wallets.find((w) => w.id === tx.wallet);
  const currency = wallet?.currency || tx.currency;

  // Знак текущей корректировки и баланс кошелька БЕЗ неё.
  const signedThis = tx.type === 'adjust_in' ? tx.amount : -tx.amount;
  const base = walletBalance(transactions, tx.wallet) - signedThis;

  const [finalStr, setFinalStr] = useState(() => fmt(base + signedThis));
  const [changeStr, setChangeStr] = useState(() => fmt(signedThis));
  const [date, setDate] = useState(tx.date);
  const [time, setTime] = useState(tx.time || '');
  const [note, setNote] = useState(tx.note || '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const onFinalChange = (v) => {
    setFinalStr(v);
    const n = parse(v);
    setChangeStr(v.trim() === '' || Number.isNaN(n) ? '' : fmt(n - base));
  };
  const onChangeChange = (v) => {
    setChangeStr(v);
    const n = parse(v);
    setFinalStr(v.trim() === '' || Number.isNaN(n) ? '' : fmt(base + n));
  };

  const change = parse(changeStr);
  const hasChange = changeStr.trim() !== '' && !Number.isNaN(change);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!hasChange) { setFormError('Введите итоговый баланс или изменение'); return; }
    if (Math.abs(change) < 0.005) { setFormError('Изменение равно нулю — удалите корректировку'); return; }

    const next = {
      ...tx,
      type: change > 0 ? 'adjust_in' : 'adjust_out',
      amount: Math.abs(change),
      date, time, note: note.trim(),
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
    if (!window.confirm('Удалить корректировку?')) return;
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
        <h1>Корректировка баланса</h1>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <span className="field__label">Кошелёк</span>
          <p className="muted">{wallet ? `${wallet.name} (${currency})` : currency}</p>
        </div>

        <div className="field">
          <span className="field__label">Баланс без этой корректировки</span>
          <p className="muted">{formatAmount(base, currency)}</p>
        </div>

        <label className="field">
          <span className="field__label">Итоговый баланс, {currency}</span>
          <input
            className="field__input field__input--amount"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={finalStr}
            onChange={(e) => onFinalChange(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">
            Изменение баланса, {currency}
            {hasChange && <span className="muted"> · {change > 0 ? 'пополнение' : 'списание'}</span>}
          </span>
          <input
            className="field__input field__input--amount"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={changeStr}
            onChange={(e) => onChangeChange(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field__label">Дата и время</span>
          <div className="datetime-row">
            <input className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className="field__input datetime-row__time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <label className="field">
          <span className="field__label">Заметка (необязательно)</span>
          <input className="field__input" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {formError && <p className="form-error">{formError}</p>}

        <button type="submit" className="btn btn--block btn--income" disabled={saving}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button type="button" className="btn btn--block btn--danger" onClick={handleDelete} disabled={saving}>
          Удалить корректировку
        </button>
      </form>
    </div>
  );
}
