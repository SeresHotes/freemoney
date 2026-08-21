import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { CURRENCIES } from '../utils/currencies';

const MODE_LABELS = {
  google: '☁️ Google Таблицы',
  local: '📱 Локально в браузере',
  device: '🗂️ Файлы на устройстве (.csv)',
};

export default function Settings() {
  const {
    mode, transactions, categories, wallets, baseCurrency,
    setBaseCurrencyPref, exportAll, importAll, resetMode, refresh,
  } = useApp();

  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="page">
      <header className="page__header"><h1>Настройки</h1></header>

      <section>
        <h2 className="section-title">Разделы</h2>
        <div className="settings-actions">
          <button className="btn btn--block" onClick={() => navigate('/categories')}>🏷️ Категории</button>
          <button className="btn btn--block" onClick={() => navigate('/wallets')}>👛 Кошельки</button>
          <button className="btn btn--block" onClick={() => navigate('/tags')}>🔖 Теги</button>
        </div>
      </section>

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
