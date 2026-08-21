import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { initAuth, signIn, signOut, ensureToken } from '../auth/googleAuth';
import { AuthError } from '../api/sheets';
import {
  initSpreadsheet,
  fetchTransactions,
  fetchCategories,
  addTransaction as apiAddTransaction,
  addCategory as apiAddCategory,
  setCategoryStatus as apiSetCategoryStatus,
} from '../api/store';
import { LS_SPREADSHEET_ID, IS_CLIENT_ID_CONFIGURED } from '../config';

const AppContext = createContext(null);

// Возможные состояния приложения:
//   'loading'    — идёт инициализация
//   'no-config'  — не настроен OAuth Client ID
//   'signed-out' — нужен вход
//   'no-sheet'   — вошли, но нет таблицы (создать/выбрать)
//   'ready'      — всё готово, данные загружены
export function AppProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [spreadsheetId, setSpreadsheetId] = useState(
    () => localStorage.getItem(LS_SPREADSHEET_ID) || null,
  );
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState(null);

  const loadData = useCallback(async (id) => {
    const [cats, txs] = await Promise.all([fetchCategories(id), fetchTransactions(id)]);
    setCategories(cats);
    setTransactions(txs);
  }, []);

  // Стартовая инициализация.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!IS_CLIENT_ID_CONFIGURED) {
        setStatus('no-config');
        return;
      }
      try {
        await initAuth();
        await ensureToken(); // тихая попытка восстановить сессию
        if (cancelled) return;
        const savedId = localStorage.getItem(LS_SPREADSHEET_ID);
        if (savedId) {
          await loadData(savedId);
          if (cancelled) return;
          setSpreadsheetId(savedId);
          setStatus('ready');
        } else {
          setStatus('no-sheet');
        }
      } catch (err) {
        if (cancelled) return;
        // Тихий вход не удался или токен протух — просим авторизоваться.
        setStatus('signed-out');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const handleSignIn = useCallback(async () => {
    setError(null);
    try {
      await initAuth();
      await signIn();
      const savedId = localStorage.getItem(LS_SPREADSHEET_ID);
      if (savedId) {
        await loadData(savedId);
        setSpreadsheetId(savedId);
        setStatus('ready');
      } else {
        setStatus('no-sheet');
      }
    } catch (err) {
      setError('Не удалось войти. Попробуйте ещё раз.');
      setStatus('signed-out');
    }
  }, [loadData]);

  const handleSignOut = useCallback(() => {
    signOut();
    setTransactions([]);
    setCategories([]);
    setStatus('signed-out');
  }, []);

  const createSheet = useCallback(async () => {
    setError(null);
    const id = await initSpreadsheet();
    localStorage.setItem(LS_SPREADSHEET_ID, id);
    setSpreadsheetId(id);
    await loadData(id);
    setStatus('ready');
    return id;
  }, [loadData]);

  const useExistingSheet = useCallback(
    async (id) => {
      setError(null);
      await loadData(id); // проверяем доступ, попутно грузим данные
      localStorage.setItem(LS_SPREADSHEET_ID, id);
      setSpreadsheetId(id);
      setStatus('ready');
    },
    [loadData],
  );

  const refresh = useCallback(async () => {
    if (spreadsheetId) await loadData(spreadsheetId);
  }, [spreadsheetId, loadData]);

  // Обёртка мутаций: ловим AuthError и сбрасываем на экран входа.
  const withAuthGuard = useCallback(async (fn) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AuthError) {
        handleSignOut();
      }
      throw err;
    }
  }, [handleSignOut]);

  const addTransaction = useCallback(
    (tx) =>
      withAuthGuard(async () => {
        await apiAddTransaction(spreadsheetId, tx);
        setTransactions((prev) => [...prev, tx]);
      }),
    [spreadsheetId, withAuthGuard],
  );

  const addCategory = useCallback(
    (cat) =>
      withAuthGuard(async () => {
        await apiAddCategory(spreadsheetId, cat);
        await loadData(spreadsheetId); // перечитываем, чтобы получить корректный row
      }),
    [spreadsheetId, withAuthGuard, loadData],
  );

  const setCategoryStatus = useCallback(
    (row, newStatus) =>
      withAuthGuard(async () => {
        await apiSetCategoryStatus(spreadsheetId, row, newStatus);
        setCategories((prev) =>
          prev.map((c) => (c.row === row ? { ...c, status: newStatus } : c)),
        );
      }),
    [spreadsheetId, withAuthGuard],
  );

  const value = {
    status,
    spreadsheetId,
    categories,
    transactions,
    error,
    signIn: handleSignIn,
    signOut: handleSignOut,
    createSheet,
    useExistingSheet,
    refresh,
    addTransaction,
    addCategory,
    setCategoryStatus,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp должен использоваться внутри AppProvider');
  return ctx;
}
