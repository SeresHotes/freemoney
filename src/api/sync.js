// Движок синхронизации локального стора (IndexedDB) с Google Таблицей.
//
// Модель — local-first: IndexedDB это источник правды, таблица — реплика.
// syncNow() делает полный проход: читает таблицу, сливает с локальными данными
// по правилу «последняя правка побеждает» (LWW по updatedAt) с учётом
// tombstones (deleted), применяет чужие изменения локально и переписывает
// изменившиеся листы. Ручные правки листа (без роста updatedAt) распознаются
// сравнением со снапшотом прошлой синхронизации и считаются свежими.
//
// Идентичность сущностей:
//   transactions/wallets — по стабильному id;
//   tags/settings — по имени/ключу;
//   categories — ПО ИМЕНИ (id категории чисто локальный: в приложении категория
//     адресуется именем, rename каскадит по имени). Это исключает дубли базовых
//     категорий при подключении второго устройства.
//
// Конфликты между независимо заведёнными сторами (оба с данными до первой
// синхронизации) разрешаются без потерь: операции объединяются по id, категории
// — по имени. Единственный побочный эффект — возможен лишний пустой кошелёк
// «Основной» на втором устройстве (кошельки сливаются по id); его можно
// заархивировать. Ничего при этом не теряется.

import { ensureSyncSchema, fetchAllForSync, overwriteEntity } from './store';
import { rawDump, applyRecords, getMeta, setMeta } from './localBackend';
import { nowStamp, newId } from '../utils/format';

const ENTITIES = ['transactions', 'categories', 'wallets', 'tags', 'settings'];

const KEY = {
  transactions: (r) => r.id,
  categories: (r) => `n:${(r.name || '').trim().toLowerCase()}`,
  wallets: (r) => r.id,
  tags: (r) => (r.name || '').trim(),
  settings: (r) => r.key,
};

// Поля, определяющие «содержимое» записи для сравнения (без updatedAt).
// Для категорий id исключён намеренно (см. шапку).
function contentSig(entity, r) {
  switch (entity) {
    case 'transactions':
      return JSON.stringify([
        r.id, r.date, r.time, r.type, r.amount, r.category || '', r.note || '',
        [...(r.tags || [])].map((t) => t.trim()).filter(Boolean).sort(),
        r.wallet || '', r.currency || '', r.origAmount ?? null, r.origCurrency || '',
        r.transferId || '', r.rate ?? null, !!r.deleted,
      ]);
    case 'categories':
      return JSON.stringify([r.name, r.kind || 'both', r.status || 'active', r.icon || '', r.order ?? 0, !!r.deleted]);
    case 'wallets':
      return JSON.stringify([r.id, r.name || '', r.currency || '', r.status || 'active', r.order ?? 0, r.kind || 'cash', Number(r.rate) || 0, !!r.deleted]);
    case 'tags':
      return JSON.stringify([r.name, !!r.deleted]);
    case 'settings':
      return JSON.stringify([r.key, r.value ?? '']);
    default:
      return JSON.stringify(r);
  }
}

// Эффективная метка удалённой записи с поправкой на ручные правки листа:
// если содержимое отличается от снапшота, но метка не выросла — правили руками,
// считаем изменение свежим (иначе оно проиграло бы локальной версии).
function effectiveRemoteTs(entity, r, snapEntry, now) {
  const ts = r.updatedAt || 0;
  if (snapEntry && contentSig(entity, r) !== snapEntry.sig && ts <= snapEntry.ts) {
    return now;
  }
  return ts;
}

// Слить одну сущность. Возвращает записи для локального upsert, полный набор
// для перезаписи листа и признак того, что лист изменился.
export function mergeEntity(entity, localRecs, remoteRecs, snap, now) {
  const key = KEY[entity];
  const lMap = new Map(localRecs.map((r) => [key(r), r]));
  const rMap = new Map(remoteRecs.map((r) => [key(r), r]));
  const keys = new Set([...lMap.keys(), ...rMap.keys()]);

  const localUpserts = [];
  const remoteRecords = [];
  const newSnap = {};
  let remoteDirty = false;

  for (const k of keys) {
    const l = lMap.get(k);
    const r = rMap.get(k);

    let winner;
    if (l && !r) winner = l;
    else if (r && !l) winner = r;
    else {
      const rEff = effectiveRemoteTs(entity, r, snap[k], now);
      winner = rEff > (l.updatedAt || 0) ? r : l;
    }

    // Локальная запись: у категорий сохраняем стабильный локальный id, чтобы не
    // плодить дубли в IndexedDB (стор с keyPath 'id'); прочие ключи стабильны.
    const localRec = entity === 'categories'
      ? { ...winner, id: (l && l.id) || (r && r.id) || newId() }
      : winner;
    // Запись для листа: у категорий сохраняем id, уже стоящий в таблице.
    const remoteRec = entity === 'categories'
      ? { ...winner, id: (r && r.id) || (l && l.id) || '' }
      : winner;

    remoteRecords.push(remoteRec);
    newSnap[k] = { ts: winner.updatedAt || 0, sig: contentSig(entity, winner) };

    const winnerSig = contentSig(entity, winner);
    if (!l || contentSig(entity, l) !== winnerSig || (l.updatedAt || 0) !== (winner.updatedAt || 0)) {
      localUpserts.push(localRec);
    }
    if (!r || contentSig(entity, r) !== winnerSig) {
      remoteDirty = true;
    }
  }

  return { localUpserts, remoteRecords, remoteDirty, snap: newSnap };
}

// Полный цикл синхронизации. Кидает AuthError/ошибки сети наружу — вызывающий
// решает, что показать. Возвращает сводку изменений.
export async function syncNow(spreadsheetId) {
  await ensureSyncSchema(spreadsheetId);
  const now = nowStamp();

  const [remote, local] = await Promise.all([fetchAllForSync(spreadsheetId), rawDump()]);
  const snapAll = (await getMeta('syncSnapshot')) || {};

  const newSnapAll = {};
  let pulled = 0;
  let pushedEntities = 0;

  for (const entity of ENTITIES) {
    const res = mergeEntity(entity, local[entity] || [], remote[entity] || [], snapAll[entity] || {}, now);
    newSnapAll[entity] = res.snap;
    if (res.localUpserts.length) {
      await applyRecords(entity, res.localUpserts);
      pulled += res.localUpserts.length;
    }
    if (res.remoteDirty) {
      await overwriteEntity(spreadsheetId, entity, res.remoteRecords);
      pushedEntities += 1;
    }
  }

  await setMeta('syncSnapshot', newSnapAll);
  await setMeta('lastSync', now);
  return { at: now, pulled, pushedEntities };
}
