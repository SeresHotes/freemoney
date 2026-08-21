import { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { CURRENCIES } from '../utils/currencies';

const MODE_LABELS = {
  google: '☁️ Google Таблицы',
  local: '📱 Локально в браузере',
};

export default function Settings() {
  const {
    mode, transactions, categories, wallets, tags, baseCurrency,
    setBaseCurrencyPref, exportAll, importAll, addTag, deleteTag, resetMode, refresh,
  } = useApp();

  const fileRef = useRef(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newTag, setNewTag] = useState('');

  const usedTags = useMemo(() => {
    const set = new Set(tags);
    for (const t of transactions) (t.tags || []).forEach((x) => set.add(x));
    return [...set].sort();
  }, [tags, transactions]);

  const handleImport = async (file) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const text = await file.text();
      const r = await importAll(text);
      setMessage(`Импортировано: кошельков ${r.wallets}, категорий ${r.categories}, тегов ${r.tags}, операций ${r.transactions}`);
    } catch {
      setMessage('Ошибка импорта. Проверьте, что это файл резервной копии FreeMoney (.json).');
    } finally {
      setBusy(false);
    }
  };

  const submitTag = async (e) => {
    e.preventDefault();
    const name = newTag.trim();
    if (!name) return;
    setBusy(true);
    try {
      await addTag(name);
      setNewTag('');
    } finally {
      setBusy(false);
    }
  };

  const removeTag = async (name) => {
    if (!window.confirm(`Удалить тег «${name}» из списка и всех операций?`)) return;
    setBusy(true);
    try {
      await deleteTag(name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header"><h1>Настройки</h1></header>

      <section>
        <h2 className="section-title">Базовая валюта</h2>
        <p className="muted" style={{ marginBottom: '0.5rem' }}>
          В ней показывается общий капитал и сводная статистика по всем кошелькам.
        </p>
        <select
          className="field__input field__input--select"
          value={baseCurrency}
          onChange={(e) => setBaseCurrencyPref(e.target.value)}
          disabled={busy}
        >
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
        </select>
      </section>

      <section>
        <h2 className="section-title">Резервная копия</h2>
        <p className="muted" style={{ marginBottom: '0.5rem' }}>
          Один файл со всеми данными: кошельки, категории, теги, операции, настройки.
        </p>
        <div className="settings-actions">
          <button className="btn btn--block" onClick={exportAll} disabled={busy}>⬇️ Экспорт</button>
          <button className="btn btn--block" onClick={() => fileRef.current?.click()} disabled={busy}>⬆️ Импорт</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => { handleImport(e.target.files?.[0]); e.target.value = ''; }}
        />
        {message && <p className="muted" style={{ marginTop: '0.75rem' }}>{message}</p>}
      </section>

      <section>
        <h2 className="section-title">Теги ({usedTags.length})</h2>
        <form className="form form--inline" onSubmit={submitTag}>
          <input className="field__input" type="text" placeholder="Новый тег" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
          <button className="btn btn--primary" type="submit" disabled={busy}>Добавить</button>
        </form>
        {usedTags.length > 0 && (
          <div className="tag-filter" style={{ marginTop: '0.75rem' }}>
            {usedTags.map((t) => (
              <span key={t} className="tag-chip tag-chip--removable" onClick={() => removeTag(t)}>
                #{t}<span className="tag-chip__x">×</span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title">Хранилище</h2>
        <div className="cat-item">
          <span className="cat-item__name">{MODE_LABELS[mode] || mode}</span>
          <button className="link-btn-inline" onClick={refresh} disabled={busy}>Обновить</button>
        </div>
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          Кошельков: {wallets.length}, категорий: {categories.length}, операций: {transactions.length}
        </p>
        <button className="btn btn--block" style={{ marginTop: '0.75rem' }} onClick={resetMode}>🔄 Сменить способ хранения</button>
        <p className="muted hint">Данные не удаляются: при возврате к тому же хранилищу они снова появятся.</p>
      </section>
    </div>
  );
}
