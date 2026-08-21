import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { initAuth, signIn, signOut, ensureToken } from '../auth/googleAuth';
import { AuthError } from '../api/sheets';
import { initSpreadsheet } from '../api/store';
import { createGoogleBackend } from '../api/googleBackend';
import { createLocalBackend, isLocalStoreReady, initLocalStore } from '../api/localBackend';
import {
  exportTransactionsCsv,
  exportCategoriesCsv,
  importTransactionsCsv,
  importCategoriesCsv,
} from '../api/csvPorter';
import { LS_SPREADSHEET_ID, LS_MODE, IS_CLIENT_ID_CONFIGURED } from '../config';

const AppContext = createContext(null);

// Статусы приложения:
//   'loading'     — инициализация
//   'select-mode' — не выбран способ хранения (Google / локально)
//   'no-config'   — выбран Google, но не настроен OAuth Client ID
//   'signed-out'  — нужен вход в Google
//   'no-sheet'    — вошли в Google, но нет таблицы
//   'ready'       — всё готово
export function AppProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [mode, setMode] = useState(() => localStorage.getItem(LS_MODE) || null);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState(null);

  // Бэкенд держим в ref, чтобы колбэки видели актуальный инстанс без пересоздания.
  const backendRef = useRef(null);

  const loadData = useCallback(async (backend) => {
    const [cats, txs] = await Promise.all([
      backend.fetchCategories(),
      backend.fetchTransactions(),
    ]);
    setCategories(cats);
    setTransactions(txs);
  }, []);

  const activateGoogle = useCallback(async () => {
    const savedId = localStorage.getItem(LS_SPREADSHEET_ID);
    if (savedId) {
      const backend = createGoogleBackend(savedId);
      await loadData(backend);
      backendRef.current = backend;
      setStatus('ready');
    } else {
      setStatus('no-sheet');
    }
  }, [loadData]);

  const activateLocal = useCallback(async () => {
    if (!(await isLocalStoreReady())) {
      await initLocalStore();
    }
    const backend = createLocalBackend();
    await loadData(backend);
    backendRef.current = backend;
    setStatus('ready');
  }, [loadData]);

  // Стартовая инициализация в зависимости от выбранного ранее режима.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let savedMode = localStorage.getItem(LS_MODE);
      // Миграция: у кого уже была подключена Google Таблица (до появления
      // выбора режима) — автоматически считаем режимом Google.
      if (!savedMode && localStorage.getItem(LS_SPREADSHEET_ID)) {
        savedMode = 'google';
        localStorage.setItem(LS_MODE, savedMode);
        setMode(savedMode);
      }
      if (!savedMode) {
        setStatus('select-mode');
        return;
      }
      try {
        if (savedMode === 'local') {
          await activateLocal();
          return;
        }
        // google
        if (!IS_CLIENT_ID_CONFIGURED) {
          setStatus('no-config');
          return;
        }
        // initAuth нужен для обновления токена; при наличии живого кэша
        // его сбой не должен ронять восстановление сессии.
        await initAuth().catch(() => {});
        await ensureToken(); // тихое восстановление сессии из кэша токена
        if (cancelled) return;
        await activateGoogle();
      } catch (err) {
        if (cancelled) return;
        setStatus(savedMode === 'google' ? 'signed-out' : 'select-mode');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activateGoogle, activateLocal]);

  // Выбор режима хранения на стартовом экране.
  const chooseMode = useCallback(
    async (chosen) => {
      setError(null);
      localStorage.setItem(LS_MODE, chosen);
      setMode(chosen);
      if (chosen === 'local') {
        setStatus('loading');
        await activateLocal();
      } else if (!IS_CLIENT_ID_CONFIGURED) {
        setStatus('no-config');
      } else {
        setStatus('signed-out');
      }
    },
    [activateLocal],
  );

  // Сброс к выбору режима (сменить хранилище).
  const resetMode = useCallback(() => {
    signOut();
    localStorage.removeItem(LS_MODE);
    backendRef.current = null;
    setMode(null);
    setCategories([]);
    setTransactions([]);
    setStatus('select-mode');
  }, []);

  const handleSignIn = useCallback(async () => {
    setError(null);
    try {
      await initAuth();
      await signIn();
      await activateGoogle();
    } catch (err) {
      setError('Не удалось войти. Попробуйте ещё раз.');
      setStatus('signed-out');
    }
  }, [activateGoogle]);

  const handleSignOut = useCallback(() => {
    signOut();
    backendRef.current = null;
    setTransactions([]);
    setCategories([]);
    setStatus('signed-out');
  }, []);

  const createSheet = useCallback(
    async (title) => {
      setError(null);
      const id = await initSpreadsheet(title);
      localStorage.setItem(LS_SPREADSHEET_ID, id);
      const backend = createGoogleBackend(id);
      await loadData(backend);
      backendRef.current = backend;
      setStatus('ready');
    },
    [loadData],
  );

  const useExistingSheet = useCallback(
    async (id) => {
      setError(null);
      const backend = createGoogleBackend(id);
      await loadData(backend); // проверяем доступ, попутно грузим данные
      localStorage.setItem(LS_SPREADSHEET_ID, id);
      backendRef.current = backend;
      setStatus('ready');
    },
    [loadData],
  );

  const refresh = useCallback(async () => {
    if (backendRef.current) await loadData(backendRef.current);
  }, [loadData]);

  // Обёртка мутаций: ловим AuthError (актуально для Google) и просим войти заново.
  const withAuthGuard = useCallback(
    async (fn) => {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof AuthError) handleSignOut();
        throw err;
      }
    },
    [handleSignOut],
  );

  const addTransaction = useCallback(
    (tx) =>
      withAuthGuard(async () => {
        await backendRef.current.addTransaction(tx);
        setTransactions((prev) => [...prev, tx]);
      }),
    [withAuthGuard],
  );

  const addCategory = useCallback(
    (cat) =>
      withAuthGuard(async () => {
        await backendRef.current.addCategory(cat);
        setCategories(await backendRef.current.fetchCategories());
      }),
    [withAuthGuard],
  );

  const setCategoryStatus = useCallback(
    (id, newStatus) =>
      withAuthGuard(async () => {
        await backendRef.current.setCategoryStatus(id, newStatus);
        setCategories((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c)),
        );
      }),
    [withAuthGuard],
  );

  const updateCategory = useCallback(
    (id, patch) =>
      withAuthGuard(async () => {
        const current = categories.find((c) => c.id === id);
        const oldName = current?.name;
        await backendRef.current.updateCategory(id, patch);
        // Если имя изменилось — переименовываем во всех операциях.
        if (patch.name && oldName && patch.name !== oldName) {
          await backendRef.current.renameCategory(oldName, patch.name);
          setTransactions((prev) =>
            prev.map((t) => (t.category === oldName ? { ...t, category: patch.name } : t)),
          );
        }
        setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      }),
    [withAuthGuard, categories],
  );

  // --- CSV ------------------------------------------------------------------
  const exportTransactions = useCallback(() => exportTransactionsCsv(transactions), [transactions]);
  const exportCategories = useCallback(() => exportCategoriesCsv(categories), [categories]);

  const importTransactions = useCallback(
    async (text) => {
      const added = await importTransactionsCsv(text, backendRef.current, transactions);
      await refresh();
      return added;
    },
    [transactions, refresh],
  );

  const importCategories = useCallback(
    async (text) => {
      const added = await importCategoriesCsv(text, backendRef.current, categories);
      await refresh();
      return added;
    },
    [categories, refresh],
  );

  const value = {
    status,
    mode,
    categories,
    transactions,
    error,
    chooseMode,
    resetMode,
    signIn: handleSignIn,
    signOut: handleSignOut,
    createSheet,
    useExistingSheet,
    refresh,
    addTransaction,
    addCategory,
    setCategoryStatus,
    updateCategory,
    exportTransactions,
    exportCategories,
    importTransactions,
    importCategories,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp должен использоваться внутри AppProvider');
  return ctx;
}
