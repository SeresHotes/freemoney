import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const KIND_LABELS = { expense: 'Расход', income: 'Доход', both: 'Оба' };

export default function Categories() {
  const { categories } = useApp();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);

  const { active, archived } = useMemo(
    () => ({
      active: categories.filter((c) => c.status === 'active'),
      archived: categories.filter((c) => c.status === 'archived'),
    }),
    [categories],
  );

  return (
    <div className="page">
      <header className="page__header"><h1>Категории</h1></header>

      <button className="btn btn--block btn--primary" onClick={() => navigate('/categories/new')}>
        ➕ Добавить категорию
      </button>

      <section>
        <h2 className="section-title">Активные ({active.length})</h2>
        <ul className="cat-list">
          {active.map((c) => (
            <li key={c.id} className="cat-item cat-item--clickable" onClick={() => navigate(`/transactions?category=${encodeURIComponent(c.name)}`)}>
              <div className="cat-item__main">
                <span className="cat-item__icon">{c.icon}</span>
                <span className="cat-item__name">{c.name}</span>
                <span className={`kind-badge kind-badge--${c.kind}`}>{KIND_LABELS[c.kind]}</span>
              </div>
              <button
                className="link-btn cat-item__action"
                onClick={(e) => { e.stopPropagation(); navigate(`/categories/${c.id}/edit`); }}
                title="Редактировать"
              >
                ✏️
              </button>
            </li>
          ))}
        </ul>
        <p className="muted hint">Нажмите на категорию, чтобы посмотреть её операции.</p>
      </section>

      {archived.length > 0 && (
        <section>
          <button className="link-btn-inline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Скрыть архив' : `Показать архив (${archived.length})`}
          </button>
          {showArchived && (
            <ul className="cat-list cat-list--archived">
              {archived.map((c) => (
                <li key={c.id} className="cat-item cat-item--archived cat-item--clickable" onClick={() => navigate(`/categories/${c.id}/edit`)}>
                  <div className="cat-item__main">
                    <span className="cat-item__icon">{c.icon}</span>
                    <span className="cat-item__name">{c.name}</span>
                    <span className={`kind-badge kind-badge--${c.kind}`}>{KIND_LABELS[c.kind]}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
