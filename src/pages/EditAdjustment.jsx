import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

// Корректировку баланса можно править как обычную операцию: сумма, направление,
// дата/время и заметка. Кошелёк и валюту не трогаем — они заданы при создании.
export default function EditAdjustment({ tx }) {
  const navigate = useNavigate();
  const { wallets, updateTransaction, deleteTransaction } = useApp();

  const wallet = wallets.find((w) => w.id === tx.wallet);
  const [direction, setDirection] = useState(tx.type === 'adjust_in' ? 'in' : 'out');
  const [amount, setAmount] = useState(String(tx.amount));
  const [date, setDate] = useState(tx.date);
  const [time, setTime] = useState(tx.time || '');
  const [note, setNote] = useState(tx.note || '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const value = Number(String(amount).replace(',', '.'));
    if (!value || value <= 0) { setFormError('Введите сумму больше нуля'); return; }

    const next = {
      ...tx,
      type: direction === 'in' ? 'adjust_in' : 'adjust_out',
      amount: value,
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
          <p className="muted">{wallet ? `${wallet.name} (${wallet.currency})` : tx.currency}</p>
        </div>

        <div className="field">
          <span className="field__label">Направление</span>
          <div className="segmented">
            <button
              type="button"
              className={`segmented__btn${direction === 'in' ? ' segmented__btn--active' : ''}`}
              onClick={() => setDirection('in')}
            >
              Пополнение
            </button>
            <button
              type="button"
              className={`segmented__btn${direction === 'out' ? ' segmented__btn--active' : ''}`}
              onClick={() => setDirection('out')}
            >
              Списание
            </button>
          </div>
        </div>

        <label className="field">
          <span className="field__label">Сумма, {tx.currency}</span>
          <input
            className="field__input field__input--amount"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
