import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { initAuth, signIn, signOut, ensureToken, isSignedIn, consumeAuthError } from '../auth/googleAuth';
import { AuthError } from '../api/sheets';
import { initSpreadsheet, findExistingSpreadsheets } from '../api/store';
import { syncNow } from '../api/sync';
import {
  createLocalBackend, isLocalStoreReady, initLocalStore, requestPersistentStorage,
  prepareWalletKeyMigration, hasPreSyncBackup, restorePreSyncBackup,
} from '../api/localBackend';
import { createDeviceBackend, isDeviceStoreReady, initDeviceStore } from '../api/deviceBackend';
import { exportBackup, importBackup } from '../api/backup';
import {
  LS_SPREADSHEET_ID, LS_MODE, LS_SYNC_ENABLED, LS_SYNC_PENDING, LS_LAST_SYNC,
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
  // Вошли в Google, но таблица ещё не выбрана — нужно показать выбор таблицы
  // (в т.ч. после возврата из редиректа входа в backend-режиме).
  const [syncSetup, setSyncSetup] = useState(false);
  // Есть страховочный снимок локальных данных (сделан перед adopt-синком) —
  // значит можно предложить откат, если синхронизация заменила данные.
  const [hasBackup, setHasBackup] = useState(false);

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
    const walletCurrency = Object.fromEntries(wls.map((w) => [w.name, w.currency]));
    const normalized = txs.map((t) => {
      const wallet = t.wallet || defaultWallet?.name || '';
      const currency = t.currency || walletCurrency[wallet] || base;
      return { ...t, wallet, currency };
    });

    setCategories(cats);
    setWallets(wls);
    setTags(tgs);
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
      if (res.adopted) setHasBackup(true); // синк заменил локальные данные — есть откат
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
    // Разовая подготовка миграции кошельков на ключ-имя (до открытия БД v4).
    await prepareWalletKeyMigration();
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
        console.error('Не удалось открыть локальное хранилище:', err);
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

      // Возврат из входа в Google (backend-режим — полный редирект). Если Google
      // отказал — показываем причину, а не молчим.
      const authErr = consumeAuthError();
      if (authErr && !cancelled) {
        setSyncError('Google не выдал доступ. Попробуйте включить синхронизацию ещё раз.');
      }
      // Мы намеренно начинали вход (LS_SYNC_PENDING) и теперь вошли — доводим
      // включение до конца: либо синк на уже привязанной таблице, либо выбор новой.
      const pending = localStorage.getItem(LS_SYNC_PENDING) === '1';
      const resuming = pending && isSignedIn() && IS_CLIENT_ID_CONFIGURED;
      if (pending) {
        // Снимаем намерение в любом исходе: либо доводим сейчас, либо вход не
        // удался (нет сессии) — чтобы флаг не залипал до следующего входа.
        localStorage.removeItem(LS_SYNC_PENDING);
      }
      if (resuming && spreadsheetIdRef.current) {
        enabled = true;
        localStorage.setItem(LS_SYNC_ENABLED, '1');
      }

      // UI показываем сразу — локальные данные уже загружены.
      setStatus('ready');
      hasPreSyncBackup().then((v) => { if (!cancelled) setHasBackup(v); }).catch(() => {});

      if (enabled && spreadsheetIdRef.current && IS_CLIENT_ID_CONFIGURED) {
        syncEnabledRef.current = true;
        setSyncEnabled(true);
        setSyncStatus('syncing');
        initAuth().catch(() => {});
        doSync();
      } else {
        setSyncStatus('disabled');
        // Вошли, но таблицы ещё нет — предложить выбрать/создать её.
        if (resuming && !spreadsheetIdRef.current && !cancelled) setSyncSetup(true);
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
      localStorage.removeItem(LS_SYNC_PENDING);
      syncEnabledRef.current = true;
      setSyncEnabled(true);
      setSyncSetup(false);
      await syncNowManual();
    },
    [syncNowManual],
  );

  // Шаг 1: вход в Google. Если таблица уже привязана — сразу включает синк и
  // возвращает false. Иначе возвращает true — нужно выбрать/создать таблицу.
  const beginSync = useCallback(async () => {
    setError(null);
    setSyncError(null);

    // Довести включение до конца при действующем токене: таблица привязана —
    // включаем синк (false = выбор таблицы не нужен), иначе просим выбрать (true).
    const finishWithToken = async () => {
      await ensureToken();
      if (spreadsheetIdRef.current) {
        await finalizeSync(spreadsheetIdRef.current);
        return false;
      }
      return true;
    };

    // Уже вошли в Google — пробуем без редиректа: после «Выключить» повторное
    // включение становится одним кликом (сессия сохранена). Если сессия
    // недействительна (refresh-токен протух/отозван) — падаем в полноценный вход.
    if (isSignedIn()) {
      try {
        await initAuth();
        return await finishWithToken();
      } catch {
        /* сессия недействительна — ниже полноценный вход */
      }
    }

    // Полноценный вход. Флаг LS_SYNC_PENDING выставляем ДО входа: в backend-режиме
    // signIn уводит в редирект и не возвращается, поэтому продолжение подхватит
    // маунт-эффект после возврата. В GIS-режиме signIn резолвится здесь же.
    localStorage.setItem(LS_SYNC_PENDING, '1');
    await initAuth();
    await signIn();
    localStorage.removeItem(LS_SYNC_PENDING);
    return finishWithToken();
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
    localStorage.removeItem(LS_SYNC_PENDING);
    localStorage.removeItem(LS_MODE); // снимаем legacy 'google', чтобы не включалось заново
    syncEnabledRef.current = false;
    setSyncEnabled(false);
    setSyncStatus('disabled');
    setSyncError(null);
    setNeedsSignIn(false);
    setSyncSetup(false);
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
    ({ fromWallet, toWallet, amountOut, amountIn, date, note, time }) =>
      mutate(async () => {
        const from = wallets.find((w) => w.name === fromWallet);
        const to = wallets.find((w) => w.name === toWallet);
        const transferId = newId();
        const legTime = time || nowTime();
        const out = {
          id: newId(), date, type: 'transfer_out', amount: amountOut, category: '',
          note: note || '', tags: [], wallet: fromWallet, currency: from?.currency || '',
          origAmount: null, origCurrency: '', transferId, time: legTime,
        };
        const inc = {
          id: newId(), date, type: 'transfer_in', amount: amountIn, category: '',
          note: note || '', tags: [], wallet: toWallet, currency: to?.currency || '',
          origAmount: null, origCurrency: '', transferId, time: legTime,
        };
        await backendRef.current.addTransactions([out, inc]);
        setTransactions((prev) => [...prev, out, inc]);
      }),
    [mutate, wallets],
  );

  // Долг = движение денег между рабочим и долговым кошельком (пара transfer-ног).
  const recordDebt = useCallback(
    ({ counterparty, newCounterpartyName, cashDirection, workWallet, amountWork, amountDebt, date, note, time }) =>
      mutate(async () => {
        const work = wallets.find((w) => w.name === workWallet);
        let debtName = counterparty;
        let debtWallet = wallets.find((w) => w.name === debtName);
        if (!debtName && newCounterpartyName) {
          await backendRef.current.addWallet({
            name: newCounterpartyName,
            currency: work?.currency || DEFAULT_BASE_CURRENCY,
            kind: 'debt',
            rate: 0,
          });
          const fresh = await backendRef.current.fetchWallets();
          setWallets(fresh);
          debtWallet = fresh.find((w) => w.kind === 'debt' && w.name === newCounterpartyName);
          debtName = debtWallet?.name;
        }
        if (!debtName || !workWallet) throw new Error('Нужны контрагент и кошелёк');

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
          ? [leg('transfer_out', workWallet, workCurrency, amtWork),
             leg('transfer_in', debtName, debtCurrency, amtDebt)]
          : [leg('transfer_out', debtName, debtCurrency, amtDebt),
             leg('transfer_in', workWallet, workCurrency, amtWork)];
        await backendRef.current.addTransactions(legs);
        setTransactions((prev) => [...prev, ...legs]);
      }),
    [mutate, wallets],
  );

  // Правка перевода/долга: переписываем обе ноги пары одним действием.
  const updateTransfer = useCallback(
    ({ transferId, outWallet, inWallet, amountOut, amountIn, date, note, time }) =>
      mutate(async () => {
        const legs = transactions.filter((t) => t.transferId === transferId);
        const outLeg = legs.find((t) => t.type === 'transfer_out');
        const inLeg = legs.find((t) => t.type === 'transfer_in');
        if (!outLeg || !inLeg) throw new Error('Перевод не найден');
        const outW = wallets.find((w) => w.name === outWallet);
        const inW = wallets.find((w) => w.name === inWallet);
        const legTime = time || outLeg.time;
        const newOut = {
          ...outLeg, wallet: outWallet, currency: outW?.currency || outLeg.currency,
          amount: Number(amountOut), date, note: note || '', time: legTime,
        };
        const newIn = {
          ...inLeg, wallet: inWallet, currency: inW?.currency || inLeg.currency,
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
          wallet: wallet.name, currency: wallet.currency,
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
  // Кошелёк идентифицируется по имени. Смена имени = переименование с каскадом
  // в операции (t.wallet) и tombstone старого имени; остальные поля правятся
  // по имени-ключу.
  const updateWallet = useCallback(
    (wallet, patch) => mutate(async () => {
      const oldName = wallet.name;
      const newName = patch.name?.trim() || oldName;
      if (newName !== oldName) {
        await backendRef.current.renameWallet(oldName, newName);
        setTransactions((prev) =>
          prev.map((t) => (t.wallet === oldName ? { ...t, wallet: newName } : t)),
        );
      }
      await backendRef.current.updateWallet(newName, {
        currency: patch.currency, kind: patch.kind, rate: patch.rate,
      });
      await reloadWallets();
    }),
    [mutate],
  );
  const setWalletStatus = useCallback(
    (wallet, s) => mutate(async () => { await backendRef.current.setWalletStatus(wallet.name, s); await reloadWallets(); }),
    [mutate],
  );

  // Задать реальный баланс кошелька — создаёт операцию-корректировку на разницу.
  const setWalletBalance = useCallback(
    (wallet, actual) =>
      mutate(async () => {
        const current = walletBalance(transactions, wallet.name);
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
          wallet: wallet.name,
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

  const clearSyncSetup = useCallback(() => setSyncSetup(false), []);

  // Откатить локальные данные к снимку, сделанному перед adopt-синком. После
  // восстановления отправляем данные в таблицу (scheduleSync), чтобы реплика
  // тоже пришла в согласованное состояние.
  const restoreLocalBackup = useCallback(
    () => track(async () => {
      const ok = await restorePreSyncBackup();
      if (ok && backendRef.current) {
        await loadData(backendRef.current);
        setHasBackup(false);
        scheduleSync();
      }
      return ok;
    }),
    [track, loadData, scheduleSync],
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
    syncSetup,
    clearSyncSetup,
    hasBackup,
    restoreLocalBackup,
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
