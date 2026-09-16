import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { CURRENCIES } from '../utils/currencies';
import { CHANNEL, IS_DEV_CHANNEL, SPREADSHEET_TITLE } from '../config';
import { agoLabel } from '../utils/format';

// Версию подставляет сборка (vite define). Локально без vite — 'dev'.
const APP_VERSION = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__;

// Извлекает spreadsheetId из вставленной ссылки или id.
function parseSpreadsheetId(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

const SYNC_STATUS_TEXT = {
  syncing: 'Синхронизация…',
  idle: 'Синхронизировано',
  error: 'Ошибка синхронизации',
};

// Секция «Синхронизация с Google» — включение/выключение, выбор таблицы, статус.
function SyncSection() {
  const {
    mode, syncEnabled, syncStatus, lastSyncAt, syncError, needsSignIn, isClientConfigured,
    syncSetup, clearSyncSetup, hasBackup, restoreLocalBackup,
    beginSync, listSyncSheets, createSyncSheet, connectSyncSheet, disableSync, disconnectSync,
    syncNow,
  } = useApp();

  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [sheets, setSheets] = useState([]);
  const [sheetName, setSheetName] = useState(SPREADSHEET_TITLE);
  const [manualId, setManualId] = useState('');
  const [localError, setLocalError] = useState(null);

  // Вернулись из входа в Google (redirect) — сразу открываем выбор таблицы.
  useEffect(() => {
    if (syncSetup) {
      setChoosing(true);
      clearSyncSetup();
    }
  }, [syncSetup, clearSyncSetup]);

  // Подтянуть список ранее созданных таблиц, когда открыт выбор.
  useEffect(() => {
    if (!choosing) return undefined;
    let cancelled = false;
    listSyncSheets()
      .then((f) => { if (!cancelled) setSheets(f); })
      .catch((err) => {
        // Не глушим молча: иначе сбой запроса выглядит как «таблиц нет» и
        // приходится вводить ссылку вручную. Показываем причину.
        console.error('Не удалось получить список таблиц:', err);
        if (!cancelled) setLocalError('Не удалось загрузить список ваших таблиц. Введите ссылку вручную ниже или откройте выбор ещё раз.');
      });
    return () => { cancelled = true; };
  }, [choosing, listSyncSheets]);

  const run = async (fn) => {
    setBusy(true);
    setLocalError(null);
    try {
      await fn();
    } catch {
      setLocalError('Не удалось. Проверьте вход в Google и доступ к таблице.');
    } finally {
      setBusy(false);
    }
  };

  const handleEnable = () => run(async () => {
    const needSheet = await beginSync();
    if (needSheet) setChoosing(true);
  });

  const handleRestore = () => run(async () => {
    const ok = await restoreLocalBackup();
    if (!ok) setLocalError('Резервный снимок не найден.');
  });

  const handleCreate = () => run(async () => {
    await createSyncSheet(sheetName);
    setChoosing(false);
  });

  const handleConnect = (id) => run(async () => {
    await connectSyncSheet(id);
    setChoosing(false);
  });

  // В нативном режиме файлов (.csv) синхронизация с Google не применяется:
  // sync работает с локальной базой IndexedDB, а не с csv-файлами устройства.
  if (mode === 'device') return null;

  if (!isClientConfigured) {
    return (
      <section>
        <h2 className="section-title">Синхронизация с Google</h2>
        <p className="muted">
          В этой сборке не задан Google OAuth Client ID — синхронизация недоступна.
          Данные хранятся локально на устройстве. Как настроить — в README.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="section-title">Синхронизация с Google</h2>

      {hasBackup && (
        <div className="gate__section">
          <p className="muted" style={{ marginBottom: '0.5rem' }}>
            Перед первой синхронизацией сохранён снимок данных этого устройства.
            Если синхронизация заменила ваши данные — их можно вернуть.
          </p>
          <button className="btn btn--block" onClick={handleRestore} disabled={busy}>
            ↩️ Восстановить данные до синхронизации
          </button>
        </div>
      )}

      {!syncEnabled && !choosing && (
        <>
          <p className="muted" style={{ marginBottom: '0.5rem' }}>
            Данные всегда лежат на этом устройстве и работают офлайн. Включите
            синхронизацию, чтобы держать их ещё и в своей Google Таблице и делить
            между устройствами.
          </p>
          <button className="btn btn--primary btn--block" onClick={handleEnable} disabled={busy}>
            {busy ? 'Вход…' : '☁️ Включить синхронизацию'}
          </button>
        </>
      )}

      {!syncEnabled && choosing && (
        <>
          <p className="muted" style={{ marginBottom: '0.5rem' }}>
            Создайте новую Google Таблицу или подключите существующую.
          </p>
          <div className="gate__create">
            <input
              className="field__input"
              type="text"
              placeholder="Название таблицы"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
            />
            <button
              className="btn btn--primary btn--block"
              disabled={busy || !sheetName.trim()}
              onClick={handleCreate}
            >
              {busy ? 'Создаю…' : '➕ Создать новую таблицу'}
            </button>
          </div>

          {sheets.length > 0 && (
            <div className="gate__section">
              <h3 className="section-title">Ваши таблицы</h3>
              <ul className="cat-list">
                {sheets.map((f) => (
                  <li key={f.id} className="cat-item">
                    <span className="cat-item__name">{f.name}</span>
                    <button className="link-btn-inline" disabled={busy} onClick={() => handleConnect(f.id)}>
                      Подключить
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="gate__section">
            <h3 className="section-title">Или по ссылке</h3>
            <input
              className="field__input"
              type="text"
              placeholder="Ссылка на таблицу или её ID"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
            />
            <button
              className="btn btn--block"
              disabled={busy || !manualId.trim()}
              onClick={() => handleConnect(parseSpreadsheetId(manualId))}
            >
              Подключить
            </button>
          </div>

          <button className="link-btn-inline" onClick={() => setChoosing(false)} disabled={busy}>
            ← Отмена
          </button>
        </>
      )}

      {syncEnabled && (
        <>
          <div className="cat-item">
            <span className="cat-item__name">
              {SYNC_STATUS_TEXT[syncStatus] || 'Включена'}
            </span>
            <button className="link-btn-inline" onClick={syncNow} disabled={busy || syncStatus === 'syncing'}>
              Синхронизировать
            </button>
          </div>
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            Последняя синхронизация: {agoLabel(lastSyncAt)}
          </p>
          {needsSignIn && (
            <button className="btn btn--primary btn--block" style={{ marginTop: '0.5rem' }} onClick={handleEnable} disabled={busy}>
              Войти в Google
            </button>
          )}
          {syncError && <p className="form-error">{syncError}</p>}
          <div className="settings-actions" style={{ marginTop: '0.75rem' }}>
            <button className="btn btn--block" onClick={disableSync} disabled={busy}>Выключить</button>
            <button className="btn btn--block" onClick={disconnectSync} disabled={busy}>Отвязать таблицу</button>
          </div>
        </>
      )}

      {localError && <p className="form-error">{localError}</p>}
    </section>
  );
}

export default function Settings() {
  const {
    transactions, categories, wallets, baseCurrency,
    setBaseCurrencyPref, exportAll, importAll,
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

      <SyncSection />

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
        <h2 className="section-title">Данные</h2>
        <p className="muted">
          Кошельков: {wallets.length}, категорий: {categories.length}, операций: {transactions.length}
        </p>
        <p className="muted hint">
          Данные хранятся на этом устройстве (в браузере) и не пропадают при
          перезагрузке. Резервная копия и синхронизация — выше.
        </p>
      </section>

      <section>
        <h2 className="section-title">О приложении</h2>
        <p className="muted">
          Версия: <code>{APP_VERSION}</code>
          {IS_DEV_CHANNEL ? ` · канал ${CHANNEL}` : ''}
        </p>
        <p className="muted hint">
          Новая версия подтянется автоматически: когда она будет готова,
          появится баннер «Доступна новая версия».
        </p>
      </section>
    </div>
  );
}
