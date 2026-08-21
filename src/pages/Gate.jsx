import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { findExistingSpreadsheets } from '../api/store';
import { SPREADSHEET_TITLE } from '../config';

// Извлекает spreadsheetId из вставленной ссылки или id.
function parseSpreadsheetId(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

export function ModeSelectScreen() {
  const { chooseMode } = useApp();
  const [busy, setBusy] = useState(false);

  const pick = async (mode) => {
    setBusy(true);
    try {
      await chooseMode(mode);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="gate__box">
        <h1 className="gate__title">💰 FreeMoney</h1>
        <p className="muted">Где хранить данные?</p>

        <button className="btn btn--primary btn--block" disabled={busy} onClick={() => pick('google')}>
          ☁️ Google Таблицы
        </button>
        <p className="muted mode-hint">
          Синхронизация между устройствами, данные в вашей Google Таблице. Нужен вход через Google.
        </p>

        <button className="btn btn--block" disabled={busy} onClick={() => pick('local')}>
          📱 Локально в браузере
        </button>
        <p className="muted mode-hint">
          Без входа и интернета, данные хранятся на этом устройстве. Экспорт/импорт в CSV — в настройках.
        </p>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="gate">
      <div className="gate__box">
        <div className="spinner" />
        <p className="muted">Загрузка…</p>
      </div>
    </div>
  );
}

export function NoConfigScreen() {
  const { resetMode } = useApp();
  return (
    <div className="gate">
      <div className="gate__box">
        <h1 className="gate__title">FreeMoney</h1>
        <p>
          Не настроен <b>Google OAuth Client ID</b>. Приложение не сможет
          авторизоваться в Google Таблицах, пока он не задан.
        </p>
        <p className="muted">
          Как получить Client ID и куда его вписать — подробно расписано в файле
          <code> README.md</code> проекта (раздел «Настройка Google OAuth»).
        </p>
        <button className="link-btn-inline" onClick={resetMode}>
          ← Использовать локальное хранилище
        </button>
      </div>
    </div>
  );
}

export function SignInScreen() {
  const { signIn, resetMode, error } = useApp();
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    await signIn();
    setBusy(false);
  };

  return (
    <div className="gate">
      <div className="gate__box">
        <h1 className="gate__title">💰 FreeMoney</h1>
        <p className="muted">Учёт доходов и расходов в вашей Google Таблице</p>
        <button className="btn btn--primary btn--block" onClick={handle} disabled={busy}>
          {busy ? 'Вход…' : 'Войти через Google'}
        </button>
        {error && <p className="form-error">{error}</p>}
        <p className="muted hint">
          Данные хранятся только в вашей Google Таблице. Приложение получает
          доступ лишь к файлам, которые создаёт само.
        </p>
        <button className="link-btn-inline" onClick={resetMode}>
          ← Другой способ хранения
        </button>
      </div>
    </div>
  );
}

export function NoSheetScreen() {
  const { createSheet, useExistingSheet, signOut } = useApp();
  const [busy, setBusy] = useState(false);
  const [manualId, setManualId] = useState('');
  const [sheetName, setSheetName] = useState(SPREADSHEET_TITLE);
  const [existing, setExisting] = useState([]);
  const [localError, setLocalError] = useState(null);

  // Пытаемся найти ранее созданные приложением таблицы.
  useEffect(() => {
    let cancelled = false;
    findExistingSpreadsheets()
      .then((files) => {
        if (!cancelled) setExisting(files);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const runAction = async (fn) => {
    setBusy(true);
    setLocalError(null);
    try {
      await fn();
    } catch (err) {
      setLocalError('Не удалось получить доступ к таблице. Проверьте ссылку/доступ.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="gate__box">
        <h1 className="gate__title">Хранилище данных</h1>
        <p className="muted">
          Создайте новую Google Таблицу для учёта или подключите существующую.
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
            onClick={() => runAction(() => createSheet(sheetName))}
          >
            {busy ? 'Создаю…' : '➕ Создать новую таблицу'}
          </button>
        </div>

        {existing.length > 0 && (
          <div className="gate__section">
            <h2 className="section-title">Ваши таблицы</h2>
            <ul className="cat-list">
              {existing.map((f) => (
                <li key={f.id} className="cat-item">
                  <span className="cat-item__name">{f.name}</span>
                  <button
                    className="link-btn-inline"
                    disabled={busy}
                    onClick={() => runAction(() => useExistingSheet(f.id))}
                  >
                    Открыть
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="gate__section">
          <h2 className="section-title">Или по ссылке</h2>
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
            onClick={() => runAction(() => useExistingSheet(parseSpreadsheetId(manualId)))}
          >
            Подключить
          </button>
        </div>

        {localError && <p className="form-error">{localError}</p>}
        <button className="link-btn-inline gate__signout" onClick={signOut}>
          Выйти
        </button>
      </div>
    </div>
  );
}
