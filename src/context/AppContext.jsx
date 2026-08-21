import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { initAuth, signIn, signOut, ensureToken } from '../auth/googleAuth';
import { AuthError } from '../api/sheets';
import { initSpreadsheet } from '../api/store';
import { createGoogleBackend } from '../api/googleBackend';
import { createLocalBackend, isLocalStoreReady, initLocalStore } from '../api/localBackend';
import { exportBackup, importBackup } from '../api/backup';
import { LS_SPREADSHEET_ID, LS_MODE, DEFAULT_BASE_CURRENCY, IS_CLIENT_ID_CONFIGURED } from '../config';
import { newId } from '../utils/format';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [mode, setMode] = useState(() => localStorage.getItem(LS_MODE) || null);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [tags, setTags] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState(DEFAULT_BASE_CURRENCY);
  const [error, setError] = useState(null);

  const backendRef = useRef(null);

  // Загрузка всех данных с нормализацией операций (кошелёк/валюта по умолчанию).
  const loadData = useCallback(async (backend) => {
    const [cats, txs, wls, tgs, settings] = await Promise.all([
      backend.fetchCategories(),
      backend.fetchTransactions(),
      backend.fetchWallets(),
      backend.fetchTags(),
      backend.fetchSettings(),
    ]);
    const base = settings.baseCurrency || DEFAULT_BASE_CURRENCY;
    const defaultWallet = wls.find((w) => w.status === 'active') || wls[0];
    const walletCurrency = Object.fromEntries(wls.map((w) => [w.id, w.currency]));
    const normalized = txs.map((t) => {
      const wallet = t.wallet || defaultWallet?.id || '';
      const currency = t.currency || walletCurrency[wallet] || base;
      return { ...t, wallet, currency };
    });
    setCategories(cats);
    setWallets(wls);
    setTags(tgs);
    setBaseCurrency(base);
    setTransactions(normalized);
  }, []);

  const activateBackend = useCallback(
    async (backend) => {
      await backend.ensureSchema();
      await loadData(backend);
      backendRef.current = backend;
      setStatus('ready');
    },
    [loadData],
  );

  const activateGoogle = useCallback(async () => {
    const savedId = localStorage.getItem(LS_SPREADSHEET_ID);
    if (savedId) {
      await activateBackend(createGoogleBackend(savedId));
    } else {
      setStatus('no-sheet');
    }
  }, [activateBackend]);

  const activateLocal = useCallback(async () => {
    if (!(await isLocalStoreReady())) await initLocalStore();
    await activateBackend(createLocalBackend());
  }, [activateBackend]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let savedMode = localStorage.getItem(LS_MODE);
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
        if (!IS_CLIENT_ID_CONFIGURED) {
          setStatus('no-config');
          return;
        }
        await initAuth().catch(() => {});
        await ensureToken();
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

  const resetMode = useCallback(() => {
    signOut();
    localStorage.removeItem(LS_MODE);
    backendRef.current = null;
    setMode(null);
    setCategories([]);
    setTransactions([]);
    setWallets([]);
    setTags([]);
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
    setWallets([]);
    setTags([]);
    setStatus('signed-out');
  }, []);

  const createSheet = useCallback(
    async (title) => {
      setError(null);
      const id = await initSpreadsheet(title);
      localStorage.setItem(LS_SPREADSHEET_ID, id);
      await activateBackend(createGoogleBackend(id));
    },
    [activateBackend],
  );

  const useExistingSheet = useCallback(
    async (id) => {
      setError(null);
      await activateBackend(createGoogleBackend(id));
      localStorage.setItem(LS_SPREADSHEET_ID, id);
    },
    [activateBackend],
  );

  const refresh = useCallback(async () => {
    if (backendRef.current) await loadData(backendRef.current);
  }, [loadData]);

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

  // --- Операции -------------------------------------------------------------
  const addTransaction = useCallback(
    (tx) =>
      withAuthGuard(async () => {
        await backendRef.current.addTransaction(tx);
        setTransactions((prev) => [...prev, tx]);
      }),
    [withAuthGuard],
  );

  const addTransfer = useCallback(
    ({ fromWalletId, toWalletId, amountOut, amountIn, date, note }) =>
      withAuthGuard(async () => {
        const from = wallets.find((w) => w.id === fromWalletId);
        const to = wallets.find((w) => w.id === toWalletId);
        const transferId = newId();
        const out = {
          id: newId(), date, type: 'transfer_out', amount: amountOut, category: '',
          note: note || '', tags: [], wallet: fromWalletId, currency: from?.currency || '',
          origAmount: null, origCurrency: '', transferId,
        };
        const inc = {
          id: newId(), date, type: 'transfer_in', amount: amountIn, category: '',
          note: note || '', tags: [], wallet: toWalletId, currency: to?.currency || '',
          origAmount: null, origCurrency: '', transferId,
        };
        await backendRef.current.addTransactions([out, inc]);
        setTransactions((prev) => [...prev, out, inc]);
      }),
    [withAuthGuard, wallets],
  );

  // --- Категории ------------------------------------------------------------
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
        setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c)));
      }),
    [withAuthGuard],
  );

  const updateCategory = useCallback(
    (id, patch) =>
      withAuthGuard(async () => {
        const current = categories.find((c) => c.id === id);
        const oldName = current?.name;
        await backendRef.current.updateCategory(id, patch);
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

  // --- Кошельки -------------------------------------------------------------
  const reloadWallets = async () => setWallets(await backendRef.current.fetchWallets());

  const addWallet = useCallback(
    (w) => withAuthGuard(async () => { await backendRef.current.addWallet(w); await reloadWallets(); }),
    [withAuthGuard],
  );
  const updateWallet = useCallback(
    (wallet, patch) => withAuthGuard(async () => { await backendRef.current.updateWallet(wallet, patch); await reloadWallets(); }),
    [withAuthGuard],
  );
  const setWalletStatus = useCallback(
    (wallet, s) => withAuthGuard(async () => { await backendRef.current.setWalletStatus(wallet, s); await reloadWallets(); }),
    [withAuthGuard],
  );

  // --- Теги -----------------------------------------------------------------
  const addTag = useCallback(
    (name) => withAuthGuard(async () => { await backendRef.current.addTag(name); setTags(await backendRef.current.fetchTags()); }),
    [withAuthGuard],
  );
  const deleteTag = useCallback(
    (name) => withAuthGuard(async () => { await backendRef.current.deleteTag(name); await refresh(); }),
    [withAuthGuard, refresh],
  );

  // --- Настройки ------------------------------------------------------------
  const setBaseCurrencyPref = useCallback(
    (currency) =>
      withAuthGuard(async () => {
        await backendRef.current.setSetting('baseCurrency', currency);
        setBaseCurrency(currency);
      }),
    [withAuthGuard],
  );

  // --- Резервная копия (единый JSON) ----------------------------------------
  const exportAll = useCallback(
    () => exportBackup({ baseCurrency, wallets, categories, tags, transactions }),
    [baseCurrency, wallets, categories, tags, transactions],
  );

  const importAll = useCallback(
    async (text) => {
      const result = await importBackup(text, backendRef.current, { wallets, categories, tags, transactions });
      await refresh();
      return result;
    },
    [wallets, categories, tags, transactions, refresh],
  );

  const value = {
    status,
    mode,
    categories,
    transactions,
    wallets,
    tags,
    baseCurrency,
    error,
    chooseMode,
    resetMode,
    signIn: handleSignIn,
    signOut: handleSignOut,
    createSheet,
    useExistingSheet,
    refresh,
    addTransaction,
    addTransfer,
    addCategory,
    setCategoryStatus,
    updateCategory,
    addWallet,
    updateWallet,
    setWalletStatus,
    addTag,
    deleteTag,
    setBaseCurrencyPref,
    exportAll,
    importAll,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp должен использоваться внутри AppProvider');
  return ctx;
}
