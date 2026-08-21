import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { initAuth, signIn, signOut, ensureToken } from '../auth/googleAuth';
import { AuthError } from '../api/sheets';
import { initSpreadsheet } from '../api/store';
import { createGoogleBackend } from '../api/googleBackend';
import { createLocalBackend, isLocalStoreReady, initLocalStore } from '../api/localBackend';
import { createDeviceBackend, isDeviceStoreReady, initDeviceStore } from '../api/deviceBackend';
import { exportBackup, importBackup } from '../api/backup';
import { LS_SPREADSHEET_ID, LS_MODE, DEFAULT_BASE_CURRENCY, IS_CLIENT_ID_CONFIGURED } from '../config';
import { newId, todayIso } from '../utils/format';
import { walletBalance } from '../utils/finance';

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
  const [busy, setBusy] = useState(false);

  const backendRef = useRef(null);

  // Индикатор загрузки: показываем, только если операция длится дольше секунды.
  const inflight = useRef(0);
  const busyTimer = useRef(null);
  const track = useCallback(async (fn) => {
    inflight.current += 1;
    if (inflight.current === 1) {
      busyTimer.current = setTimeout(() => setBusy(true), 1000);
    }
    try {
      return await fn();
    } finally {
      inflight.current -= 1;
      if (inflight.current === 0) {
        clearTimeout(busyTimer.current);
        setBusy(false);
      }
    }
  }, []);

  // Загрузка всех данных с нормализацией операций (кошелёк/валюта по умолчанию).
  const loadData = useCallback(async (backend) => {
    // Одно чтение всех данных (для Google — один запрос вместо пяти).
    const { categories: cats, transactions: txs, wallets: wls, tags: tgs, settings } =
      await backend.fetchAll();
    const base = settings.baseCurrency || DEFAULT_BASE_CURRENCY;
    const defaultWallet = wls.find((w) => w.status === 'active') || wls[0];
    const walletCurrency = Object.fromEntries(wls.map((w) => [w.id, w.currency]));
    const normalized = txs.map((t) => {
      const wallet = t.wallet || defaultWallet?.id || '';
      const currency = t.currency || walletCurrency[wallet] || base;
      return { ...t, wallet, currency };
    });

    // Разовый перенос: наполняем список тегов из уже проставленных в операциях.
    let tagList = tgs;
    if (settings.tagsBackfilled !== '1') {
      const used = new Set();
      txs.forEach((t) => (t.tags || []).forEach((x) => used.add(x)));
      const missing = [...used].filter((x) => !tgs.includes(x));
      for (const name of missing) await backend.addTag(name);
      await backend.setSetting('tagsBackfilled', '1');
      if (missing.length) tagList = [...tgs, ...missing];
    }

    setCategories(cats);
    setWallets(wls);
    setTags(tagList);
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

  const activateDevice = useCallback(async () => {
    if (!(await isDeviceStoreReady())) await initDeviceStore();
    await activateBackend(createDeviceBackend());
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
        if (savedMode === 'device') {
          await activateDevice();
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
  }, [activateGoogle, activateLocal, activateDevice]);

  const chooseMode = useCallback(
    async (chosen) => {
      setError(null);
      localStorage.setItem(LS_MODE, chosen);
      setMode(chosen);
      if (chosen === 'local') {
        setStatus('loading');
        await activateLocal();
      } else if (chosen === 'device') {
        setStatus('loading');
        await activateDevice();
      } else if (!IS_CLIENT_ID_CONFIGURED) {
        setStatus('no-config');
      } else {
        setStatus('signed-out');
      }
    },
    [activateLocal, activateDevice],
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

  const refresh = useCallback(
    () => track(async () => {
      if (backendRef.current) await loadData(backendRef.current);
    }),
    [loadData, track],
  );

  // Обёртка мутаций: индикатор загрузки + перехват AuthError.
  const withAuthGuard = useCallback(
    (fn) =>
      track(async () => {
        try {
          return await fn();
        } catch (err) {
          if (err instanceof AuthError) handleSignOut();
          throw err;
        }
      }),
    [handleSignOut, track],
  );

  // Регистрирует новые теги в управляемом списке (для подсказок).
  const registerTags = useCallback(
    async (list) => {
      const missing = (list || []).filter((t) => !tags.includes(t));
      for (const name of missing) await backendRef.current.addTag(name);
      if (missing.length) setTags((prev) => [...new Set([...prev, ...missing])]);
    },
    [tags],
  );

  // --- Операции -------------------------------------------------------------
  const addTransaction = useCallback(
    (tx) =>
      withAuthGuard(async () => {
        await backendRef.current.addTransaction(tx);
        await registerTags(tx.tags);
        setTransactions((prev) => [...prev, tx]);
      }),
    [withAuthGuard, registerTags],
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

  const updateTransaction = useCallback(
    (tx) =>
      withAuthGuard(async () => {
        await backendRef.current.updateTransaction(tx);
        await registerTags(tx.tags);
        setTransactions((prev) => prev.map((t) => (t.id === tx.id ? tx : t)));
      }),
    [withAuthGuard, registerTags],
  );

  // Удаление операции; для перевода удаляются обе связанные ноги.
  const deleteTransaction = useCallback(
    (id) =>
      withAuthGuard(async () => {
        const tx = transactions.find((t) => t.id === id);
        const ids = tx?.transferId
          ? transactions.filter((t) => t.transferId === tx.transferId).map((t) => t.id)
          : [id];
        for (const legId of ids) await backendRef.current.deleteTransaction(legId);
        setTransactions((prev) => prev.filter((t) => !ids.includes(t.id)));
      }),
    [withAuthGuard, transactions],
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

  // Задать реальный баланс кошелька — создаёт операцию-корректировку на разницу.
  const setWalletBalance = useCallback(
    (wallet, actual) =>
      withAuthGuard(async () => {
        const current = walletBalance(transactions, wallet.id);
        const diff = actual - current;
        if (Math.abs(diff) < 0.005) return; // уже совпадает
        const tx = {
          id: newId(),
          date: todayIso(),
          type: diff > 0 ? 'adjust_in' : 'adjust_out',
          amount: Math.abs(diff),
          category: '',
          note: 'Корректировка баланса',
          tags: [],
          wallet: wallet.id,
          currency: wallet.currency,
          origAmount: null,
          origCurrency: '',
          transferId: '',
        };
        await backendRef.current.addTransaction(tx);
        setTransactions((prev) => [...prev, tx]);
      }),
    [withAuthGuard, transactions],
  );

  // --- Теги -----------------------------------------------------------------
  const addTag = useCallback(
    (name) => withAuthGuard(async () => { await backendRef.current.addTag(name); setTags(await backendRef.current.fetchTags()); }),
    [withAuthGuard],
  );
  // Удаление тега = убрать из списка подсказок. Историю операций не трогаем.
  const deleteTag = useCallback(
    (name) => withAuthGuard(async () => {
      await backendRef.current.deleteTag(name);
      setTags((prev) => prev.filter((t) => t !== name));
    }),
    [withAuthGuard],
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
    (text) =>
      track(async () => {
        const result = await importBackup(text, backendRef.current, { wallets, categories, tags, transactions });
        await loadData(backendRef.current);
        return result;
      }),
    [wallets, categories, tags, transactions, track, loadData],
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
    busy,
    chooseMode,
    resetMode,
    signIn: handleSignIn,
    signOut: handleSignOut,
    createSheet,
    useExistingSheet,
    refresh,
    addTransaction,
    addTransfer,
    updateTransaction,
    deleteTransaction,
    addCategory,
    setCategoryStatus,
    updateCategory,
    addWallet,
    updateWallet,
    setWalletStatus,
    setWalletBalance,
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
