import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function Tags() {
  const { tags, addTag, deleteTag, renameTag } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // редактируемый тег
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState(null);

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

  const startEdit = (tag) => { setEditing(tag); setEditValue(tag); setEditError(null); };
  const cancelEdit = () => { setEditing(null); setEditValue(''); setEditError(null); };

  const saveEdit = async () => {
    const value = editValue.trim();
    if (!value) { setEditError('Введите имя'); return; }
    if (value === editing) { cancelEdit(); return; }
    if (tags.includes(value)) { setEditError('Такой тег уже есть'); return; }
    setBusy(true);
    try {
      await renameTag(editing, value);
      cancelEdit();
    } catch {
      setEditError('Не удалось переименовать');
    } finally {
      setBusy(false);
    }
  };

  const editKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
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
          <p className="muted empty">Тегов пока нет. Создайте их здесь, а затем проставляйте в операциях.</p>
        ) : (
          <ul className="cat-list">
            {sorted.map((t) => (
              editing === t ? (
                <li key={t} className="cat-item">
                  <input
                    className="field__input cat-item__edit"
                    type="text"
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={editKeyDown}
                  />
                  <button className="link-btn cat-item__action" disabled={busy} onClick={saveEdit} title="Сохранить">✓</button>
                  <button className="link-btn cat-item__action" disabled={busy} onClick={cancelEdit} title="Отмена">✕</button>
                </li>
              ) : (
                <li key={t} className="cat-item cat-item--clickable" onClick={() => navigate(`/transactions?tag=${encodeURIComponent(t)}`)}>
                  <span className="cat-item__name">{t}</span>
                  <button className="link-btn cat-item__action" disabled={busy} onClick={(e) => { e.stopPropagation(); startEdit(t); }} title="Переименовать">✏️</button>
                  <button className="link-btn cat-item__action" disabled={busy} onClick={(e) => { e.stopPropagation(); remove(t); }} title="Удалить">🗑️</button>
                </li>
              )
            ))}
          </ul>
        )}
        {editError && <p className="form-error">{editError}</p>}
        <p className="muted hint">
          Переименование меняет тег во всех операциях. Удаление убирает тег из подсказок при создании операции — уже проставленные теги в операциях остаются.
        </p>
      </section>
    </div>
  );
}
