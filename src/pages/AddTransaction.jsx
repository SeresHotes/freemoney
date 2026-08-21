import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { newId, todayIso } from '../utils/format';

export default function AddTransaction() {
  const { type } = useParams(); // 'expense' | 'income'
  const navigate = useNavigate();
  const { categories, transactions, addTransaction } = useApp();

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
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Все ранее использованные теги — для подсказок.
  const allTags = useMemo(() => {
    const set = new Set();
    for (const t of transactions) (t.tags || []).forEach((tag) => set.add(tag));
    return [...set].sort();
  }, [transactions]);

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
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagDraft);
    } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
      removeTag(tags[tags.length - 1]);
    }
  };

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
    // Учитываем тег, который пользователь набрал, но не подтвердил.
    const finalTags = tagDraft.trim() && !tags.includes(tagDraft.trim())
      ? [...tags, tagDraft.trim()]
      : tags;
    setSaving(true);
    try {
      await addTransaction({
        id: newId(),
        date,
        type,
        amount: value,
        category,
        note: note.trim(),
        tags: finalTags,
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
                  <span className="category-chip__icon">{c.icon}</span>
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

        <div className="field">
          <span className="field__label">Теги (необязательно)</span>
          <div className="tag-input">
            {tags.map((t) => (
              <span key={t} className="tag-chip tag-chip--removable" onClick={() => removeTag(t)}>
                #{t}<span className="tag-chip__x">×</span>
              </span>
            ))}
            <input
              className="tag-input__field"
              type="text"
              placeholder={tags.length ? '' : 'работа, отпуск…'}
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => tagDraft.trim() && addTag(tagDraft)}
            />
          </div>
          {suggestions.length > 0 && (
            <div className="tag-suggestions">
              {suggestions.map((t) => (
                <button type="button" key={t} className="tag-chip tag-chip--suggestion" onClick={() => addTag(t)}>
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>

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
