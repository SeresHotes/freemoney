import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_PALETTE, extractEmoji, loadEmojiData, searchEmoji } from '../utils/emoji';

const POPULAR = { name: 'Популярные', icon: '⭐', items: EMOJI_PALETTE.map((e) => [e, '']) };

// Выбор иконки: поиск по названию (рус/англ), вкладки групп и полный набор эмодзи.
export default function EmojiPicker({ value, onChange }) {
  const [groups, setGroups] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState(0);
  const scrollRef = useRef(null);
  const sectionRefs = useRef([]);

  useEffect(() => {
    let alive = true;
    loadEmojiData().then(
      (d) => { if (alive) setGroups(d); },
      () => { if (alive) setLoadError(true); },
    );
    return () => { alive = false; };
  }, []);

  const sections = useMemo(() => [POPULAR, ...(groups || [])], [groups]);
  const results = useMemo(() => (groups ? searchEmoji(groups, query) : []), [groups, query]);
  const typed = extractEmoji(query);
  const searching = query.trim() !== '';

  const jumpTo = (i) => {
    setActiveGroup(i);
    const box = scrollRef.current;
    const el = sectionRefs.current[i];
    if (box && el) box.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
  };

  // Подсветка вкладки текущей группы при прокрутке
  // (offsetTop секций — относительно .emoji-picker__scroll, у него position: relative).
  const onScroll = () => {
    const box = scrollRef.current;
    if (!box || searching) return;
    const top = box.scrollTop + 8;
    let cur = 0;
    sectionRefs.current.forEach((el, i) => { if (el && el.offsetTop <= top) cur = i; });
    if (cur !== activeGroup) setActiveGroup(cur);
  };

  const item = (emoji, label) => (
    <button
      type="button"
      key={emoji}
      title={label || undefined}
      aria-label={label || emoji}
      className={`emoji-picker__item${value === emoji ? ' emoji-picker__item--active' : ''}`}
      onClick={() => onChange(emoji)}
    >
      {emoji}
    </button>
  );

  return (
    <div className="emoji-picker">
      <input
        className="field__input emoji-picker__search"
        type="search"
        placeholder="Поиск иконки: кофе, car, 🍕…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        enterKeyHint="search"
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
      />

      {!searching && (
        <div className="emoji-picker__tabs">
          {sections.map((s, i) => (
            <button
              type="button"
              key={s.name}
              title={s.name}
              aria-label={s.name}
              className={`emoji-picker__tab${activeGroup === i ? ' emoji-picker__tab--active' : ''}`}
              onClick={() => jumpTo(i)}
            >
              {s.icon}
            </button>
          ))}
        </div>
      )}

      <div className="emoji-picker__scroll" ref={scrollRef} onScroll={onScroll}>
        {searching ? (
          <>
            {typed && (
              <div className="emoji-picker__grid">{item(typed, 'Введённый эмодзи')}</div>
            )}
            {!groups && !loadError && <p className="muted emoji-picker__note">Загрузка…</p>}
            {groups && results.length > 0 && (
              <div className="emoji-picker__grid">{results.map((r) => item(r.emoji, r.label))}</div>
            )}
            {groups && !results.length && !typed && (
              <p className="muted emoji-picker__note">Ничего не найдено. Можно вставить любой эмодзи с клавиатуры.</p>
            )}
          </>
        ) : (
          sections.map((s, i) => (
            <section key={s.name} ref={(el) => { sectionRefs.current[i] = el; }} className="emoji-picker__section">
              <h3 className="emoji-picker__title">{s.name}</h3>
              <div className="emoji-picker__grid">
                {s.items.map(([e, text]) => item(e, text.slice(0, text.indexOf('|'))))}
              </div>
            </section>
          ))
        )}
        {!searching && !groups && !loadError && <p className="muted emoji-picker__note">Загрузка всех иконок…</p>}
        {loadError && <p className="muted emoji-picker__note">Не удалось загрузить полный набор иконок.</p>}
      </div>
    </div>
  );
}
