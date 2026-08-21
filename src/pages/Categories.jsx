import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { EMOJI_PALETTE } from '../utils/emoji';

const KIND_LABELS = {
  expense: 'Расход',
  income: 'Доход',
  both: 'Оба',
};

export default function Categories() {
  const { categories, addCategory, setCategoryStatus } = useApp();

  const [name, setName] = useState('');
  const [kind, setKind] = useState('expense');
  const [icon, setIcon] = useState(EMOJI_PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [formError, setFormError] = useState(null);

  const { active, archived } = useMemo(() => {
    return {
      active: categories.filter((c) => c.status === 'active'),
      archived: categories.filter((c) => c.status === 'archived'),
    };
  }, [categories]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Введите название');
      return;
    }
    const exists = categories.some(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase() && c.status === 'active',
    );
    if (exists) {
      setFormError('Такая категория уже есть');
      return;
    }
    setBusy(true);
    try {
      await addCategory({ name: trimmed, kind, icon });
      setName('');
      setIcon(EMOJI_PALETTE[0]);
    } catch (err) {
      setFormError('Не удалось добавить категорию');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (row, status) => {
    setBusy(true);
    try {
      await setCategoryStatus(row, status);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Категории</h1>
      </header>

      <form className="form add-cat" onSubmit={handleAdd}>
        <div className="add-cat__row">
          <span className="add-cat__preview">{icon}</span>
          <input
            className="field__input"
            type="text"
            placeholder="Новая категория"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="emoji-picker">
          {EMOJI_PALETTE.map((e) => (
            <button
              type="button"
              key={e}
              className={`emoji-picker__item${icon === e ? ' emoji-picker__item--active' : ''}`}
              onClick={() => setIcon(e)}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="add-cat__row">
          <select
            className="field__input field__input--select"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="expense">Расход</option>
            <option value="income">Доход</option>
            <option value="both">Оба</option>
          </select>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            Добавить
          </button>
        </div>
      </form>
      {formError && <p className="form-error">{formError}</p>}

      <section>
        <h2 className="section-title">Активные ({active.length})</h2>
        <ul className="cat-list">
          {active.map((c) => (
            <li key={c.id} className="cat-item">
              <div className="cat-item__main">
                <span className="cat-item__icon">{c.icon}</span>
                <span className="cat-item__name">{c.name}</span>
                <span className={`kind-badge kind-badge--${c.kind}`}>{KIND_LABELS[c.kind]}</span>
              </div>
              <button
                className="link-btn cat-item__action"
                disabled={busy}
                onClick={() => changeStatus(c.id, 'archived')}
                title="В архив"
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <button className="link-btn-inline" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Скрыть архив' : `Показать архив (${archived.length})`}
        </button>
        {showArchived && (
          <ul className="cat-list cat-list--archived">
            {archived.length === 0 && <p className="muted">Архив пуст</p>}
            {archived.map((c) => (
              <li key={c.id} className="cat-item cat-item--archived">
                <div className="cat-item__main">
                  <span className="cat-item__icon">{c.icon}</span>
                  <span className="cat-item__name">{c.name}</span>
                  <span className={`kind-badge kind-badge--${c.kind}`}>{KIND_LABELS[c.kind]}</span>
                </div>
                <button
                  className="link-btn cat-item__action"
                  disabled={busy}
                  onClick={() => changeStatus(c.id, 'active')}
                  title="Восстановить"
                >
                  ♻️
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="muted hint">
        Удаление категории — это архивирование: старые операции с ней сохраняются, а в списках выбора её больше нет.
      </p>
    </div>
  );
}
