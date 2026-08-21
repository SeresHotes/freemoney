import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { EMOJI_PALETTE } from '../utils/emoji';

export default function CategoryEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { categories, addCategory, updateCategory, setCategoryStatus } = useApp();

  const editing = id != null;
  const current = editing ? categories.find((c) => String(c.id) === String(id)) : null;

  const [name, setName] = useState(current?.name || '');
  const [kind, setKind] = useState(current?.kind || 'expense');
  const [icon, setIcon] = useState(current?.icon || EMOJI_PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  if (editing && !current) {
    return (
      <div className="page">
        <header className="page__header page__header--with-back">
          <button className="link-btn" onClick={() => navigate('/categories')}>←</button>
          <h1>Категория</h1>
        </header>
        <p className="muted">Категория не найдена.</p>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const trimmed = name.trim();
    if (!trimmed) { setFormError('Введите название'); return; }
    const exists = categories.some(
      (c) => c.id !== current?.id && c.name.toLowerCase() === trimmed.toLowerCase() && c.status === 'active',
    );
    if (exists) { setFormError('Такая категория уже есть'); return; }
    setBusy(true);
    try {
      if (editing) await updateCategory(current.id, { name: trimmed, kind, icon });
      else await addCategory({ name: trimmed, kind, icon });
      navigate('/categories');
    } catch {
      setFormError('Не удалось сохранить');
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    setBusy(true);
    try {
      await setCategoryStatus(current.id, current.status === 'active' ? 'archived' : 'active');
      navigate('/categories');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header page__header--with-back">
        <button className="link-btn" onClick={() => navigate('/categories')} aria-label="Назад">←</button>
        <h1>{editing ? 'Категория' : 'Новая категория'}</h1>
      </header>

      <form className="form" onSubmit={submit}>
        <div className="add-cat__row">
          <span className="add-cat__preview">{icon}</span>
          <input className="field__input" type="text" placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div className="emoji-picker">
          {EMOJI_PALETTE.map((e) => (
            <button type="button" key={e} className={`emoji-picker__item${icon === e ? ' emoji-picker__item--active' : ''}`} onClick={() => setIcon(e)}>{e}</button>
          ))}
        </div>

        <label className="field">
          <span className="field__label">Тип</span>
          <select className="field__input field__input--select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="expense">Расход</option>
            <option value="income">Доход</option>
            <option value="both">Оба</option>
          </select>
        </label>

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
