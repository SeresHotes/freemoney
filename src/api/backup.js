// Единая резервная копия: весь набор данных в одном JSON-файле.

import { downloadFile } from '../utils/csv';
import { isArchived } from '../utils/model';

const VERSION = 2;

export function exportBackup({ baseCurrency, wallets, categories, tags, transactions }) {
  const payload = {
    app: 'freemoney',
    version: VERSION,
    baseCurrency,
    wallets: wallets.map((w) => ({ name: w.name, currency: w.currency, archived: !!w.archived, kind: w.kind || 'cash', rate: w.rate || 0 })),
    categories: categories.map((c) => ({ name: c.name, kind: c.kind, archived: !!c.archived, icon: c.icon })),
    tags: tags.map((t) => (typeof t === 'string' ? { name: t, archived: false } : { name: t.name, archived: !!t.archived })),
    transactions: transactions.map((t) => ({
      id: t.id, date: t.date, type: t.type, amount: t.amount, category: t.category,
      note: t.note, tags: t.tags, wallet: t.wallet, currency: t.currency,
      origAmount: t.origAmount, origCurrency: t.origCurrency, groupId: t.groupId,
      time: t.time || '', rate: t.rate ?? null,
    })),
  };
  downloadFile('freemoney-backup.json', JSON.stringify(payload, null, 2), 'application/json');
}

// Импорт бэкапа: перезаписывает данные из файла (upsert). Кошельки/категории/теги
// сопоставляются по имени, операции — по id; существующие обновляются, отсутствующие
// добавляются. Возвращает счётчики обработанных записей.
export async function importBackup(text, backend, current) {
  // Убираем BOM (наш экспорт добавляет его для Excel) перед разбором JSON.
  const data = JSON.parse(text.replace(/^﻿/, ''));
  if (data.app !== 'freemoney') throw new Error('Не файл резервной копии FreeMoney');

  const result = { wallets: 0, categories: 0, tags: 0, transactions: 0 };

  // Кошельки — по имени (upsert). Для старых бэкапов (с полем id и t.wallet=id)
  // строим карту old.id → имя, чтобы перевести ссылки операций на имя кошелька.
  const walletNames = new Set(current.wallets.map((w) => w.name));
  const oldIdToName = new Map();

  for (const w of data.wallets || []) {
    if (walletNames.has(w.name)) {
      await backend.updateWallet(w.name, { currency: w.currency, kind: w.kind, rate: w.rate });
    } else {
      await backend.addWallet({ name: w.name, currency: w.currency, kind: w.kind, rate: w.rate });
      walletNames.add(w.name);
    }
    await backend.setWalletArchived(w.name, isArchived(w));
    if (w.id) oldIdToName.set(w.id, w.name);
    result.wallets += 1;
  }

  // Категории — по имени (upsert). Обновление правит поля по id, поэтому сперва
  // дозаводим недостающие, затем берём свежую карту имя→id (включая новые).
  const catNames = new Set(current.categories.map((c) => c.name.toLowerCase()));
  for (const c of data.categories || []) {
    if (!catNames.has(c.name.toLowerCase())) {
      await backend.addCategory({ name: c.name, kind: c.kind, icon: c.icon });
      catNames.add(c.name.toLowerCase());
    }
  }
  const catIdByName = new Map((await backend.fetchCategories()).map((c) => [c.name.toLowerCase(), c.id]));
  for (const c of data.categories || []) {
    const id = catIdByName.get(c.name.toLowerCase());
    if (!id) continue;
    await backend.updateCategory(id, { name: c.name, kind: c.kind, icon: c.icon });
    await backend.setCategoryArchived(id, isArchived(c));
    result.categories += 1;
  }

  // Теги — по имени (upsert). Старые бэкапы: строки или {name,status}; новые — {name,archived}.
  const tagName = (t) => (typeof t === 'string' ? t : t.name);
  const tagArchived = (t) => (typeof t === 'string' ? false : isArchived(t));
  const tagSet = new Set((current.tags || []).map(tagName));
  for (const t of data.tags || []) {
    const name = tagName(t);
    if (!name) continue;
    if (!tagSet.has(name)) {
      await backend.addTag(name);
      tagSet.add(name);
    }
    await backend.setTagArchived(name, tagArchived(t));
    result.tags += 1;
  }

  // Операции — по id: новые добавляем, уже существующие ПЕРЕЗАПИСЫВАЕМ данными из
  // бэкапа (upsert). Так повторный импорт правит уже загруженные операции — напр.,
  // проставляет groupId связанным ногам перевода. Кошелёк: в новых бэкапах t.wallet
  // уже имя, в старых — переводим со старого id на имя.
  const existingIds = new Set(current.transactions.map((t) => t.id));
  const toAdd = [];
  const toUpdate = [];
  for (const t of data.transactions || []) {
    // Старые бэкапы хранят объединяющий id под именем transferId — переносим в groupId.
    const { transferId, ...rest } = t;
    const tx = { ...rest, groupId: t.groupId ?? transferId ?? '', wallet: oldIdToName.get(t.wallet) || t.wallet };
    if (existingIds.has(t.id)) {
      toUpdate.push(tx);
    } else {
      toAdd.push(tx);
      existingIds.add(t.id);
    }
  }
  if (toAdd.length) await backend.addTransactions(toAdd);
  // updateTransaction — корректный upsert во всех бэкендах (localBackend: put,
  // deviceBackend: замена по id), в отличие от addTransactions (в device дописывает).
  for (const tx of toUpdate) await backend.updateTransaction(tx);
  result.transactions = toAdd.length + toUpdate.length;

  // Базовая валюта.
  if (data.baseCurrency) await backend.setSetting('baseCurrency', data.baseCurrency);

  return result;
}
