import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton';
import CategoryIcon from '../components/CategoryIcon';
import { useApp } from '../context/AppContext';
import { formatAmount } from '../utils/currencies';
import { MOCK_TEMPLATES } from '../utils/templatesMock';

// ПРОТОТИП страницы «Шаблоны»: порядок здесь = порядок чипов на главной.
export default function Templates() {
  const { categories } = useApp();
  const navigate = useNavigate();
  const catOf = new Map(categories.map((c) => [c.name, c]));
  return (
    <div className="page">
      <header className="page__header page__header--with-back">
        <BackButton fallback="/settings" />
        <h1>Шаблоны</h1>
      </header>

      <button className="btn btn--block btn--primary" onClick={() => navigate('/add/expense')}>+ Новый шаблон</button>

      <section>
        <h2 className="section-title">На главной ({MOCK_TEMPLATES.length})</h2>
        <ul className="tpl-list">
          {MOCK_TEMPLATES.map((t) => {
            const cat = catOf.get(t.category);
            return (
              <li key={t.id} className="tpl-row">
                <span className="tpl-row__grip" aria-hidden="true">⋮⋮</span>
                <span className="tpl-row__icon"><CategoryIcon icon={cat?.icon} color={cat?.color} /></span>
                <span className="tpl-row__info">
                  <span className="tpl-row__name">{t.name}</span>
                  <span className="muted tpl-row__meta">
                    {t.category} · {t.wallet || 'любой кошелёк'}{t.tags.length ? ` · #${t.tags.join(' #')}` : ''}
                  </span>
                </span>
                <span className={`tpl-row__amount${t.amount ? '' : ' muted'}`}>{t.amount ? formatAmount(t.amount, t.currency) : 'без суммы'}</span>
              </li>
            );
          })}
        </ul>
        <p className="muted hint">
          Перетащите за ⋮⋮, чтобы поменять порядок на главной. Шаблон с суммой записывается одним тапом, без суммы — открывает форму. Удержание чипа на главной — меню шаблона.
        </p>
      </section>
    </div>
  );
}
