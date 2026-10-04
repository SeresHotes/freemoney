import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BackButton from '../components/BackButton';
import EmojiPicker from '../components/EmojiPicker';
import ColorPicker from '../components/ColorPicker';
import CategoryIcon from '../components/CategoryIcon';
import { useApp } from '../context/AppContext';
import { EMOJI_PALETTE } from '../utils/emoji';
import { isColor, pickColor } from '../utils/categoryColors';

export default function CategoryEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { categories, addCategory, updateCategory, setCategoryArchived } = useApp();

  const editing = id != null;
  const current = editing ? categories.find((c) => String(c.id) === String(id)) : null;

  const [name, setName] = useState(current?.name || '');
  const [kind, setKind] = useState(current?.kind || 'expense');
  const [icon, setIcon] = useState(current?.icon || EMOJI_PALETTE[0]);
  // Новой категории сразу предлагаем случайный свободный цвет — его можно сменить.
  const [color, setColor] = useState(() => (isColor(current?.color) ? current.color : pickColor(categories.map((c) => c.color))));
  // Раскрыт не больше чем один выбор: 'icon' | 'color' | null.
  const [open, setOpen] = useState(null);
  const toggle = (what) => setOpen((v) => (v === what ? null : what));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  if (editing && !current) {
    return (
      <div className="page">
        <header className="page__header page__header--with-back">
          <BackButton fallback="/categories" />
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
      (c) => c.id !== current?.id && c.name.toLowerCase() === trimmed.toLowerCase() && !c.archived,
    );
    if (exists) { setFormError('Такая категория уже есть'); return; }
    setBusy(true);
    try {
      if (editing) await updateCategory(current.id, { name: trimmed, kind, icon, color });
      else await addCategory({ name: trimmed, kind, icon, color });
      navigate('/categories');
    } catch {
      setFormError('Не удалось сохранить');
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    setBusy(true);
    try {
      await setCategoryArchived(current.id, !current.archived);
      navigate('/categories');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page--fill">
      <header className="page__header page__header--with-back">
        <BackButton fallback="/categories" />
        <h1>{editing ? 'Категория' : 'Новая категория'}</h1>
      </header>

      <form className="form" onSubmit={submit}>
        <div className="add-cat__row">
          <button
            type="button"
            className={`add-cat__preview${open === 'icon' ? ' add-cat__preview--open' : ''}`}
            aria-label="Иконка категории"
            aria-expanded={open === 'icon'}
            onClick={() => toggle('icon')}
          >
            <CategoryIcon icon={icon} color={color} />
          </button>
          <input className="field__input" type="text" placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!editing} />
          <button
            type="button"
            className={`color-swatch${open === 'color' ? ' color-swatch--open' : ''}`}
            style={{ background: color }}
            aria-label="Цвет категории"
            aria-expanded={open === 'color'}
            onClick={() => toggle('color')}
          />
        </div>

        {open === 'icon' && <EmojiPicker value={icon} onChange={(e) => { setIcon(e); setOpen(null); }} className="page__grow" />}
        {open === 'color' && <ColorPicker value={color} onChange={(c) => { setColor(c); setOpen(null); }} />}

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
          <button type="button" className={`btn btn--block${!current.archived ? ' btn--danger' : ''}`} onClick={toggleArchive} disabled={busy}>
            {!current.archived ? 'Удалить' : 'Восстановить'}
          </button>
        )}
      </form>
    </div>
  );
}
