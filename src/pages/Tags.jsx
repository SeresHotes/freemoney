import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function Tags() {
  const { tags, addTag, deleteTag } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sorted = [...tags].sort((a, b) => a.localeCompare(b, 'ru'));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const value = name.trim();
    if (!value) return;
    if (tags.includes(value)) { setError('Такой тег уже есть'); return; }
    setBusy(true);
    try {
      await addTag(value);
      setName('');
    } catch {
      setError('Не удалось добавить');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tag) => {
    setBusy(true);
    try {
      await deleteTag(tag);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header page__header--with-back">
        <button className="link-btn" onClick={() => navigate('/settings')} aria-label="Назад">←</button>
        <h1>Теги</h1>
      </header>

      <form className="form form--inline" onSubmit={submit}>
        <input className="field__input" type="text" placeholder="Новый тег" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn--primary" type="submit" disabled={busy}>Добавить</button>
      </form>
      {error && <p className="form-error">{error}</p>}

      <section>
        <h2 className="section-title">Все теги ({sorted.length})</h2>
        {sorted.length === 0 ? (
          <p className="muted empty">Тегов пока нет. Они появятся, когда вы добавите их к операциям, или создайте здесь.</p>
        ) : (
          <ul className="cat-list">
            {sorted.map((t) => (
              <li key={t} className="cat-item cat-item--clickable" onClick={() => navigate(`/transactions?tag=${encodeURIComponent(t)}`)}>
                <span className="cat-item__name">#{t}</span>
                <button className="link-btn cat-item__action" disabled={busy} onClick={(e) => { e.stopPropagation(); remove(t); }} title="Удалить">🗑️</button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted hint">
          Удаление убирает тег из подсказок при создании операции. Уже проставленные теги в операциях остаются.
        </p>
      </section>
    </div>
  );
}
