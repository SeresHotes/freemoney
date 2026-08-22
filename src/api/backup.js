// Единая резервная копия: весь набор данных в одном JSON-файле.

import { downloadFile } from '../utils/csv';

const VERSION = 1;

export function exportBackup({ baseCurrency, wallets, categories, tags, transactions }) {
  const payload = {
    app: 'freemoney',
    version: VERSION,
    baseCurrency,
    wallets: wallets.map((w) => ({ id: w.id, name: w.name, currency: w.currency, status: w.status })),
    categories: categories.map((c) => ({ name: c.name, kind: c.kind, status: c.status, icon: c.icon })),
    tags,
    transactions: transactions.map((t) => ({
      id: t.id, date: t.date, type: t.type, amount: t.amount, category: t.category,
      note: t.note, tags: t.tags, wallet: t.wallet, currency: t.currency,
      origAmount: t.origAmount, origCurrency: t.origCurrency, transferId: t.transferId,
      time: t.time || '',
    })),
  };
  downloadFile('freemoney-backup.json', JSON.stringify(payload, null, 2), 'application/json');
}

// Импорт бэкапа: добавляет отсутствующее, сопоставляя кошельки по имени
// (id могут отличаться между устройствами). Возвращает счётчики добавленного.
export async function importBackup(text, backend, current) {
  // Убираем BOM (наш экспорт добавляет его для Excel) перед разбором JSON.
  const data = JSON.parse(text.replace(/^﻿/, ''));
  if (data.app !== 'freemoney') throw new Error('Не файл резервной копии FreeMoney');

  const result = { wallets: 0, categories: 0, tags: 0, transactions: 0 };

  // Кошельки — по имени. Строим карту old.id → актуальный id.
  let wallets = current.wallets;
  const walletIdByName = new Map(wallets.map((w) => [w.name, w.id]));
  const oldToNewWallet = new Map();

  for (const w of data.wallets || []) {
    if (!walletIdByName.has(w.name)) {
      await backend.addWallet({ name: w.name, currency: w.currency });
      result.wallets += 1;
      wallets = await backend.fetchWallets();
      const created = wallets.find((x) => x.name === w.name);
      if (created) walletIdByName.set(w.name, created.id);
    }
    oldToNewWallet.set(w.id, walletIdByName.get(w.name));
  }

  // Категории — по имени.
  const catNames = new Set(current.categories.map((c) => c.name.toLowerCase()));
  for (const c of data.categories || []) {
    if (!catNames.has(c.name.toLowerCase())) {
      await backend.addCategory({ name: c.name, kind: c.kind, icon: c.icon });
      catNames.add(c.name.toLowerCase());
      result.categories += 1;
    }
  }

  // Теги — по имени.
  const tagSet = new Set(current.tags);
  for (const name of data.tags || []) {
    if (!tagSet.has(name)) {
      await backend.addTag(name);
      tagSet.add(name);
      result.tags += 1;
    }
  }

  // Операции — по id, с ремапом кошелька.
  const existingIds = new Set(current.transactions.map((t) => t.id));
  const toAdd = [];
  for (const t of data.transactions || []) {
    if (existingIds.has(t.id)) continue;
    toAdd.push({ ...t, wallet: oldToNewWallet.get(t.wallet) || t.wallet });
    existingIds.add(t.id);
  }
  if (toAdd.length) {
    await backend.addTransactions(toAdd);
    result.transactions = toAdd.length;
  }

  // Базовая валюта.
  if (data.baseCurrency) await backend.setSetting('baseCurrency', data.baseCurrency);

  return result;
}
