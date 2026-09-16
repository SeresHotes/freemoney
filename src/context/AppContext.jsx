import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { initAuth, signIn, signOut, ensureToken } from '../auth/googleAuth';
import { AuthError } from '../api/sheets';
import { initSpreadsheet, findExistingSpreadsheets } from '../api/store';
import { syncNow } from '../api/sync';
import {
  createLocalBackend, isLocalStoreReady, initLocalStore, requestPersistentStorage,
} from '../api/localBackend';
import { createDeviceBackend, isDeviceStoreReady, initDeviceStore } from '../api/deviceBackend';
import { exportBackup, importBackup } from '../api/backup';
import {
  LS_SPREADSHEET_ID, LS_MODE, LS_SYNC_ENABLED, LS_LAST_SYNC,
  DEFAULT_BASE_CURRENCY, IS_CLIENT_ID_CONFIGURED,
} from '../config';
import { newId, todayIso, nowTime } from '../utils/format';
import { walletBalance } from '../utils/finance';

const AppContext = createContext(null);

const SYNC_DEBOUNCE_MS = 1500;

export function AppProvider({ children }) {
  const [status, setStatus] = useState('loading');
  // Режим хранения источника правды: 'local' (IndexedDB) или 'device' (.csv на нативе).
  const [mode, setMode] = useState('local');
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [tags, setTags] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState(DEFAULT_BASE_CURRENCY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // --- Состояние синхронизации с Google ------------------------------------
  const [syncEnabled, setSyncEnabled] = useState(false);
  // 'disabled' | 'idle' | 'syncing' | 'error'
  const [syncStatus, setSyncStatus] = useState('disabled');
  const [lastSyncAt, setLastSyncAt] = useState(Number(localStorage.getItem(LS_LAST_SYNC)) || null);
  const [syncError, setSyncError] = useState(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const backendRef = useRef(null);
  const spreadsheetIdRef = useRef(localStorage.getItem(LS_SPREADSHEET_ID) || null);
  const syncEnabledRef = useRef(false);
  const syncingRef = useRef(false);
  const rerunRef = useRef(false);
  const syncTimer = useRef(null);

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
    // Теги — объекты { name, status } (архивирование вместо удаления).
    let tagList = tgs;
    if (settings.tagsBackfilled !== '1') {
      const known = new Set(tgs.map((t) => t.name));
      const used = new Set();
      txs.forEach((t) => (t.tags || []).forEach((x) => used.add(x)));
      const missing = [...used].filter((x) => !known.has(x));
      for (const name of missing) await backend.addTag(name);
      await backend.setSetting('tagsBackfilled', '1');
      if (missing.length) tagList = [...tgs, ...missing.map((name) => ({ name, status: 'active' }))];
    }

    setCategories(cats);
    setWallets(wls);
    setTags(tagList);
    setBaseCurrency(base);
    setTransactions(normalized);
  }, []);

  // --- Синхронизация --------------------------------------------------------
  // Один полный проход. Не блокирует UI: локальные данные уже на экране.
  const doSync = useCallback(async () => {
    const id = spreadsheetIdRef.current;
    if (!syncEnabledRef.current || !id || !IS_CLIENT_ID_CONFIGURED) return;
    if (syncingRef.current) { rerunRef.current = true; return; }
    syncingRef.current = true;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      await ensureToken();
      const res = await syncNow(id);
      if (backendRef.current) await loadData(backendRef.current);
      setLastSyncAt(res.at);
      localStorage.setItem(LS_LAST_SYNC, String(res.at));
      setNeedsSignIn(false);
      setSyncStatus('idle');
    } catch (err) {
      if (err instanceof AuthError || /session|token|no_session/i.test(err?.message || '')) {
        setNeedsSignIn(true);
        setSyncError('Нужен вход в Google, чтобы синхронизировать.');
      } else {
        setSyncError('Не удалось синхронизировать. Попробуем позже.');
      }
      setSyncStatus('error');
    } finally {
      syncingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        doSync();
      }
    }
  }, [loadData]);

  // Отложенная синхронизация после правок (батчим частые изменения).
  const scheduleSync = useCallback(() => {
    if (!syncEnabledRef.current) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => doSync(), SYNC_DEBOUNCE_MS);
  }, [doSync]);

  // Ручная синхронизация «сейчас».
  const syncNowManual = useCallback(() => {
    clearTimeout(syncTimer.current);
    return doSync();
  }, [doSync]);

  const activateLocal = useCallback(async () => {
    if (!(await isLocalStoreReady())) await initLocalStore();
    const backend = createLocalBackend();
    await backend.ensureSchema();
    await loadData(backend);
    backendRef.current = backend;
    setMode('local');
  }, [loadData]);

  const activateDevice = useCallback(async () => {
    if (!(await isDeviceStoreReady())) await initDeviceStore();
    const backend = createDeviceBackend();
    await backend.ensureSchema();
    await loadData(backend);
    backendRef.current = backend;
    setMode('device');
  }, [loadData]);

  // --- Инициализация --------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      requestPersistentStorage();
      const legacyMode = localStorage.getItem(LS_MODE);

      // Нативный режим .csv-файлов сохраняем как есть (без синхронизации).
      if (legacyMode === 'device') {
        try {
          await activateDevice();
          if (!cancelled) { setSyncStatus('disabled'); setStatus('ready'); }
        } catch {
          if (!cancelled) setStatus('ready');
        }
        return;
      }

      // Единый режим: источник правды — локальный стор.
      try {
        await activateLocal();
      } catch (err) {
        if (!cancelled) { setError('Не удалось открыть локальное хранилище.'); setStatus('ready'); }
        return;
      }
      if (cancelled) return;

      // Восстановить состояние синхронизации + миграция бывших google-пользователей.
      let enabled = localStorage.getItem(LS_SYNC_ENABLED) === '1';
      if (!enabled && legacyMode === 'google' && localStorage.getItem(LS_SPREADSHEET_ID)) {
        enabled = true;
        localStorage.setItem(LS_SYNC_ENABLED, '1');
      }
      spreadsheetIdRef.current = localStorage.getItem(LS_SPREADSHEET_ID) || null;

      // UI показываем сразу — локальные данные уже загружены.
      setStatus('ready');

      if (enabled && spreadsheetIdRef.current && IS_CLIENT_ID_CONFIGURED) {
        syncEnabledRef.current = true;
        setSyncEnabled(true);
        setSyncStatus('syncing');
        initAuth().catch(() => {});
        doSync();
      } else {
        setSyncStatus('disabled');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activateLocal, activateDevice, doSync]);

  // Досинхронизировать при возврате связи и при возвращении на вкладку.
  useEffect(() => {
    const onOnline = () => scheduleSync();
    const onVisible = () => { if (document.visibilityState === 'visible') scheduleSync(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [scheduleSync]);

  // --- Управление синхронизацией из настроек --------------------------------
  const listSyncSheets = useCallback(() => findExistingSpreadsheets(), []);

  const finalizeSync = useCallback(
    async (id) => {
      spreadsheetIdRef.current = id;
      localStorage.setItem(LS_SPREADSHEET_ID, id);
      localStorage.setItem(LS_SYNC_ENABLED, '1');
      syncEnabledRef.current = true;
      setSyncEnabled(true);
      await syncNowManual();
    },
    [syncNowManual],
  );

  // Шаг 1: вход в Google. Если таблица уже привязана — сразу включает синк и
  // возвращает false. Иначе возвращает true — нужно выбрать/создать таблицу.
  const beginSync = useCallback(async () => {
    setError(null);
    await initAuth();
    await signIn(); // в backend-режиме уходит в редирект и не возвращается
    await ensureToken();
    if (spreadsheetIdRef.current) {
      await finalizeSync(spreadsheetIdRef.current);
      return false;
    }
    return true;
  }, [finalizeSync]);

  const createSyncSheet = useCallback(
    async (title) => {
      const id = await initSpreadsheet(title);
      await finalizeSync(id);
    },
    [finalizeSync],
  );

  const connectSyncSheet = useCallback((id) => finalizeSync(id), [finalizeSync]);

  // Выключить синхронизацию (данные и вход сохраняются — можно включить снова).
  const disableSync = useCallback(() => {
    clearTimeout(syncTimer.current);
    localStorage.removeItem(LS_SYNC_ENABLED);
    localStorage.removeItem(LS_MODE); // снимаем legacy 'google', чтобы не включалось заново
    syncEnabledRef.current = false;
    setSyncEnabled(false);
    setSyncStatus('disabled');
    setSyncError(null);
    setNeedsSignIn(false);
  }, []);

  // Полностью отключить и выйти из Google (забыть таблицу).
  const disconnectSync = useCallback(() => {
    signOut();
    localStorage.removeItem(LS_SPREADSHEET_ID);
    spreadsheetIdRef.current = null;
    disableSync();
  }, [disableSync]);

  const refresh = useCallback(
    () => track(async () => {
      if (backendRef.current) await loadData(backendRef.current);
      scheduleSync();
    }),
    [loadData, track, scheduleSync],
  );

  // Обёртка мутаций: индикатор загрузки + планирование фоновой синхронизации.
  const mutate = useCallback(
    (fn) =>
      track(async () => {
        const res = await fn();
        scheduleSync();
        return res;
      }),
    [track, scheduleSync],
  );

  // --- Операции -------------------------------------------------------------
  // Теги создаются и удаляются только на странице «Теги»; операции лишь
  // проставляют уже существующие теги, новые здесь не заводятся.
  const addTransaction = useCallback(
    (tx) =>
      mutate(async () => {
        await backendRef.current.addTransaction(tx);
        setTransactions((prev) => [...prev, tx]);
      }),
    [mutate],
  );

  const addTransfer = useCallback(
    ({ fromWalletId, toWalletId, amountOut, amountIn, date, note, time }) =>
      mutate(async () => {
        const from = wallets.find((w) => w.id === fromWalletId);
        const to = wallets.find((w) => w.id === toWalletId);
        const transferId = newId();
        const legTime = time || nowTime();
        const out = {
          id: newId(), date, type: 'transfer_out', amount: amountOut, category: '',
          note: note || '', tags: [], wallet: fromWalletId, currency: from?.currency || '',
          origAmount: null, origCurrency: '', transferId, time: legTime,
        };
        const inc = {
          id: newId(), date, type: 'transfer_in', amount: amountIn, category: '',
          note: note || '', tags: [], wallet: toWalletId, currency: to?.currency || '',
          origAmount: null, origCurrency: '', transferId, time: legTime,
        };
        await backendRef.current.addTransactions([out, inc]);
        setTransactions((prev) => [...prev, out, inc]);
      }),
    [mutate, wallets],
  );

  // Долг = движение денег между рабочим и долговым кошельком (пара transfer-ног).
  const recordDebt = useCallback(
    ({ counterpartyId, newCounterpartyName, cashDirection, workWalletId, amountWork, amountDebt, date, note, time }) =>
      mutate(async () => {
        const work = wallets.find((w) => w.id === workWalletId);
        let debtId = counterpartyId;
        let debtWallet = wallets.find((w) => w.id === debtId);
        if (!debtId && newCounterpartyName) {
          await backendRef.current.addWallet({
            name: newCounterpartyName,
            currency: work?.currency || DEFAULT_BASE_CURRENCY,
            kind: 'debt',
            rate: 0,
          });
          const fresh = await backendRef.current.fetchWallets();
          setWallets(fresh);
          debtWallet = fresh.find((w) => w.kind === 'debt' && w.name === newCounterpartyName);
          debtId = debtWallet?.id;
        }
        if (!debtId || !workWalletId) throw new Error('Нужны контрагент и кошелёк');

        const workCurrency = work?.currency || '';
        const debtCurrency = debtWallet?.currency || workCurrency;
        const amtWork = Number(amountWork);
        const amtDebt = Number(amountDebt) || amtWork;
        const transferId = newId();
        const legTime = time || nowTime();
        const leg = (type, wallet, currency, amount) => ({
          id: newId(), date, type, amount, category: '', note: note || '',
          tags: [], wallet, currency, origAmount: null, origCurrency: '', transferId, time: legTime,
        });
        const legs = cashDirection === 'out'
          ? [leg('transfer_out', workWalletId, workCurrency, amtWork),
             leg('transfer_in', debtId, debtCurrency, amtDebt)]
          : [leg('transfer_out', debtId, debtCurrency, amtDebt),
             leg('transfer_in', workWalletId, workCurrency, amtWork)];
        await backendRef.current.addTransactions(legs);
        setTransactions((prev) => [...prev, ...legs]);
      }),
    [mutate, wallets],
  );

  // Правка перевода/долга: переписываем обе ноги пары одним действием.
  const updateTransfer = useCallback(
    ({ transferId, outWalletId, inWalletId, amountOut, amountIn, date, note, time }) =>
      mutate(async () => {
        const legs = transactions.filter((t) => t.transferId === transferId);
        const outLeg = legs.find((t) => t.type === 'transfer_out');
        const inLeg = legs.find((t) => t.type === 'transfer_in');
        if (!outLeg || !inLeg) throw new Error('Перевод не найден');
        const outW = wallets.find((w) => w.id === outWalletId);
        const inW = wallets.find((w) => w.id === inWalletId);
        const legTime = time || outLeg.time;
        const newOut = {
          ...outLeg, wallet: outWalletId, currency: outW?.currency || outLeg.currency,
          amount: Number(amountOut), date, note: note || '', time: legTime,
        };
        const newIn = {
          ...inLeg, wallet: inWalletId, currency: inW?.currency || inLeg.currency,
          amount: Number(amountIn), date, note: note || '', time: legTime,
        };
        await backendRef.current.updateTransaction(newOut);
        await backendRef.current.updateTransaction(newIn);
        setTransactions((prev) =>
          prev.map((t) => (t.id === newOut.id ? newOut : t.id === newIn.id ? newIn : t)),
        );
      }),
    [mutate, transactions, wallets],
  );

  // Начислить/списать проценты — отдельный тип операции (interest_in/out).
  const accrueInterest = useCallback(
    ({ wallet, base, rate, date, time, direction = 'add', note = '' }) =>
      mutate(async () => {
        const r = Number(rate) || 0;
        const amount = Math.abs((Number(base) * r) / 100);
        if (amount < 0.005) return null;
        const subtract = direction === 'subtract';
        const tx = {
          id: newId(), date: date || todayIso(), time: time || nowTime(),
          type: subtract ? 'interest_out' : 'interest_in',
          amount, category: '', note: note || '', tags: [],
          wallet: wallet.id, currency: wallet.currency,
          origAmount: null, origCurrency: '', transferId: '', rate: r,
        };
        await backendRef.current.addTransaction(tx);
        setTransactions((prev) => [...prev, tx]);
        return { amount: tx.amount, type: tx.type };
      }),
    [mutate],
  );

  const updateTransaction = useCallback(
    (tx) =>
      mutate(async () => {
        await backendRef.current.updateTransaction(tx);
        setTransactions((prev) => prev.map((t) => (t.id === tx.id ? tx : t)));
      }),
    [mutate],
  );

  // Удаление операции; для перевода удаляются обе связанные ноги.
  const deleteTransaction = useCallback(
    (id) =>
      mutate(async () => {
        const tx = transactions.find((t) => t.id === id);
        const ids = tx?.transferId
          ? transactions.filter((t) => t.transferId === tx.transferId).map((t) => t.id)
          : [id];
        for (const legId of ids) await backendRef.current.deleteTransaction(legId);
        setTransactions((prev) => prev.filter((t) => !ids.includes(t.id)));
      }),
    [mutate, transactions],
  );

  // --- Категории ------------------------------------------------------------
  const addCategory = useCallback(
    (cat) =>
      mutate(async () => {
        await backendRef.current.addCategory(cat);
        setCategories(await backendRef.current.fetchCategories());
      }),
    [mutate],
  );

  const setCategoryStatus = useCallback(
    (id, newStatus) =>
      mutate(async () => {
        await backendRef.current.setCategoryStatus(id, newStatus);
        setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c)));
      }),
    [mutate],
  );

  const updateCategory = useCallback(
    (id, patch) =>
      mutate(async () => {
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
    [mutate, categories],
  );

  // --- Кошельки -------------------------------------------------------------
  const reloadWallets = async () => setWallets(await backendRef.current.fetchWallets());

  const addWallet = useCallback(
    (w) => mutate(async () => { await backendRef.current.addWallet(w); await reloadWallets(); }),
    [mutate],
  );
  const updateWallet = useCallback(
    (wallet, patch) => mutate(async () => { await backendRef.current.updateWallet(wallet, patch); await reloadWallets(); }),
    [mutate],
  );
  const setWalletStatus = useCallback(
    (wallet, s) => mutate(async () => { await backendRef.current.setWalletStatus(wallet, s); await reloadWallets(); }),
    [mutate],
  );

  // Задать реальный баланс кошелька — создаёт операцию-корректировку на разницу.
  const setWalletBalance = useCallback(
    (wallet, actual) =>
      mutate(async () => {
        const current = walletBalance(transactions, wallet.id);
        const diff = actual - current;
        if (Math.abs(diff) < 0.005) return; // уже совпадает
        const tx = {
          id: newId(),
          date: todayIso(),
          time: nowTime(),
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
    [mutate, transactions],
  );

  // --- Теги -----------------------------------------------------------------
  const addTag = useCallback(
    (name) => mutate(async () => { await backendRef.current.addTag(name); setTags(await backendRef.current.fetchTags()); }),
    [mutate],
  );
  // «Удаление» тега = архивирование (status): убираем из подсказок, но храним и
  // можем вернуть. Историю операций не трогаем.
  const setTagStatus = useCallback(
    (name, newStatus) => mutate(async () => {
      await backendRef.current.setTagStatus(name, newStatus);
      setTags((prev) => prev.map((t) => (t.name === name ? { ...t, status: newStatus } : t)));
    }),
    [mutate],
  );
  // Переименование тега применяется и к списку, и ко всем операциям.
  const renameTag = useCallback(
    (oldName, newName) => mutate(async () => {
      await backendRef.current.renameTag(oldName, newName);
      setTags((prev) => prev.map((t) => (t.name === oldName ? { ...t, name: newName } : t)));
      setTransactions((prev) =>
        prev.map((t) => (
          (t.tags || []).includes(oldName)
            ? { ...t, tags: [...new Set(t.tags.map((x) => (x === oldName ? newName : x)))] }
            : t
        )),
      );
    }),
    [mutate],
  );

  // --- Настройки ------------------------------------------------------------
  const setBaseCurrencyPref = useCallback(
    (currency) =>
      mutate(async () => {
        await backendRef.current.setSetting('baseCurrency', currency);
        setBaseCurrency(currency);
      }),
    [mutate],
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
        scheduleSync();
        return result;
      }),
    [wallets, categories, tags, transactions, track, loadData, scheduleSync],
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
    // синхронизация
    syncEnabled,
    syncStatus,
    lastSyncAt,
    syncError,
    needsSignIn,
    isClientConfigured: IS_CLIENT_ID_CONFIGURED,
    beginSync,
    listSyncSheets,
    createSyncSheet,
    connectSyncSheet,
    disableSync,
    disconnectSync,
    syncNow: syncNowManual,
    refresh,
    // операции
    addTransaction,
    addTransfer,
    updateTransfer,
    recordDebt,
    accrueInterest,
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
    setTagStatus,
    renameTag,
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
