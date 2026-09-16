// Единая резервная копия: весь набор данных в одном JSON-файле.

import { downloadFile } from '../utils/csv';

const VERSION = 1;

export function exportBackup({ baseCurrency, wallets, categories, tags, transactions }) {
  const payload = {
    app: 'freemoney',
    version: VERSION,
    baseCurrency,
    wallets: wallets.map((w) => ({ name: w.name, currency: w.currency, status: w.status, kind: w.kind || 'cash', rate: w.rate || 0 })),
    categories: categories.map((c) => ({ name: c.name, kind: c.kind, status: c.status, icon: c.icon })),
    tags: tags.map((t) => (typeof t === 'string' ? { name: t, status: 'active' } : { name: t.name, status: t.status || 'active' })),
    transactions: transactions.map((t) => ({
      id: t.id, date: t.date, type: t.type, amount: t.amount, category: t.category,
      note: t.note, tags: t.tags, wallet: t.wallet, currency: t.currency,
      origAmount: t.origAmount, origCurrency: t.origCurrency, groupId: t.groupId,
      time: t.time || '', rate: t.rate ?? null,
    })),
  };
  downloadFile('freemoney-backup.json', JSON.stringify(payload, null, 2), 'application/json');
}

// Импорт бэкапа: добавляет отсутствующее, сопоставляя кошельки по имени.
// Возвращает счётчики добавленного.
export async function importBackup(text, backend, current) {
  // Убираем BOM (наш экспорт добавляет его для Excel) перед разбором JSON.
  const data = JSON.parse(text.replace(/^﻿/, ''));
  if (data.app !== 'freemoney') throw new Error('Не файл резервной копии FreeMoney');

  const result = { wallets: 0, categories: 0, tags: 0, transactions: 0 };

  // Кошельки — по имени. Для старых бэкапов (с полем id и t.wallet=id) строим
  // карту old.id → имя, чтобы перевести ссылки операций на имя кошелька.
  const walletNames = new Set(current.wallets.map((w) => w.name));
  const oldIdToName = new Map();

  for (const w of data.wallets || []) {
    if (!walletNames.has(w.name)) {
      await backend.addWallet({ name: w.name, currency: w.currency, kind: w.kind, rate: w.rate });
      walletNames.add(w.name);
      result.wallets += 1;
    }
    if (w.id) oldIdToName.set(w.id, w.name);
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

  // Теги — по имени (старые бэкапы хранят строки, новые — {name, status}).
  const tagName = (t) => (typeof t === 'string' ? t : t.name);
  const tagSet = new Set((current.tags || []).map(tagName));
  for (const t of data.tags || []) {
    const name = tagName(t);
    if (!name || tagSet.has(name)) continue;
    await backend.addTag(name);
    const status = typeof t === 'string' ? 'active' : (t.status || 'active');
    if (status === 'archived') await backend.setTagStatus(name, 'archived');
    tagSet.add(name);
    result.tags += 1;
  }

  // Операции — по id. Кошелёк: в новых бэкапах t.wallet уже имя, в старых —
  // переводим со старого id на имя (иначе оставляем как есть).
  const existingIds = new Set(current.transactions.map((t) => t.id));
  const toAdd = [];
  for (const t of data.transactions || []) {
    if (existingIds.has(t.id)) continue;
    // Старые бэкапы хранят объединяющий id под именем transferId — переносим в groupId.
    const { transferId, ...rest } = t;
    toAdd.push({ ...rest, groupId: t.groupId ?? transferId ?? '', wallet: oldIdToName.get(t.wallet) || t.wallet });
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
