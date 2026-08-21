import { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';

const MODE_LABELS = {
  google: '☁️ Google Таблицы',
  local: '📱 Локально в браузере',
};

export default function Settings() {
  const {
    mode,
    transactions,
    categories,
    exportTransactions,
    exportCategories,
    importTransactions,
    importCategories,
    resetMode,
    refresh,
  } = useApp();

  const txFileRef = useRef(null);
  const catFileRef = useRef(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleImport = async (file, importer, label) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const text = await file.text();
      const added = await importer(text);
      setMessage(`Импортировано ${label}: ${added}`);
    } catch (err) {
      setMessage('Ошибка импорта. Проверьте формат файла.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Настройки</h1>
      </header>

      <section>
        <h2 className="section-title">Хранилище</h2>
        <div className="cat-item">
          <span className="cat-item__name">{MODE_LABELS[mode] || mode}</span>
          <button className="link-btn-inline" onClick={refresh}>
            Обновить
          </button>
        </div>
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          Операций: {transactions.length}, категорий: {categories.length}
        </p>
      </section>

      <section>
        <h2 className="section-title">Экспорт в CSV</h2>
        <div className="settings-actions">
          <button className="btn btn--block" onClick={exportTransactions}>
            ⬇️ Операции
          </button>
          <button className="btn btn--block" onClick={exportCategories}>
            ⬇️ Категории
          </button>
        </div>
      </section>

      <section>
        <h2 className="section-title">Импорт из CSV</h2>
        <p className="muted" style={{ marginBottom: '0.5rem' }}>
          Добавляет записи в текущее хранилище. Дубликаты (по id операции / имени категории)
          пропускаются.
        </p>
        <div className="settings-actions">
          <button className="btn btn--block" disabled={busy} onClick={() => txFileRef.current?.click()}>
            ⬆️ Операции
          </button>
          <button className="btn btn--block" disabled={busy} onClick={() => catFileRef.current?.click()}>
            ⬆️ Категории
          </button>
        </div>
        <input
          ref={txFileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            handleImport(e.target.files?.[0], importTransactions, 'операций');
            e.target.value = '';
          }}
        />
        <input
          ref={catFileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            handleImport(e.target.files?.[0], importCategories, 'категорий');
            e.target.value = '';
          }}
        />
        {message && <p className="muted" style={{ marginTop: '0.75rem' }}>{message}</p>}
      </section>

      <section>
        <h2 className="section-title">Прочее</h2>
        <button className="btn btn--block" onClick={resetMode}>
          🔄 Сменить способ хранения
        </button>
        <p className="muted hint">
          Данные не удаляются: при возврате к тому же хранилищу они снова появятся.
        </p>
      </section>
    </div>
  );
}
