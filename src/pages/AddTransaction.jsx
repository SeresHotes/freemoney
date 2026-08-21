import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { newId, todayIso } from '../utils/format';

export default function AddTransaction() {
  const { type } = useParams(); // 'expense' | 'income'
  const navigate = useNavigate();
  const { categories, addTransaction } = useApp();

  const isExpense = type === 'expense';

  // Категории, подходящие под тип операции и активные.
  const available = useMemo(
    () =>
      categories.filter(
        (c) => c.status === 'active' && (c.kind === type || c.kind === 'both'),
      ),
    [categories, type],
  );

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const value = Number(String(amount).replace(',', '.'));
    if (!value || value <= 0) {
      setFormError('Введите сумму больше нуля');
      return;
    }
    if (!category) {
      setFormError('Выберите категорию');
      return;
    }
    setSaving(true);
    try {
      await addTransaction({
        id: newId(),
        date,
        type,
        amount: value,
        category,
        note: note.trim(),
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
        <button className="link-btn" onClick={() => navigate(-1)} aria-label="Назад">
          ←
        </button>
        <h1>{isExpense ? 'Новый расход' : 'Новый доход'}</h1>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Сумма</span>
          <input
            className="field__input field__input--amount"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field__label">Категория</span>
          {available.length === 0 ? (
            <p className="muted">
              Нет активных категорий этого типа.{' '}
              <button type="button" className="link-btn-inline" onClick={() => navigate('/categories')}>
                Добавить
              </button>
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
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </label>

        <label className="field">
          <span className="field__label">Дата</span>
          <input
            className="field__input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">Заметка (необязательно)</span>
          <input
            className="field__input"
            type="text"
            placeholder="Например: обед с коллегами"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {formError && <p className="form-error">{formError}</p>}

        <button
          type="submit"
          className={`btn btn--block ${isExpense ? 'btn--expense' : 'btn--income'}`}
          disabled={saving}
        >
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </form>
    </div>
  );
}
