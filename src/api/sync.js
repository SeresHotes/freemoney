// Движок синхронизации локального стора (IndexedDB) с Google Таблицей.
//
// Модель — local-first: IndexedDB это источник правды, таблица — реплика.
// syncNow() делает полный проход: читает таблицу, сливает с локальными данными
// по правилу «последняя правка побеждает» (LWW по updatedAt) с учётом
// tombstones (deleted), применяет чужие изменения локально (compare-and-set,
// чтобы не затирать правку, сделанную во время синхронизации) и переписывает
// изменившиеся листы. Ручные правки листа (без роста updatedAt) распознаются
// сравнением со снапшотом прошлой синхронизации и считаются свежими.
//
// Идентичность сущностей:
//   transactions — по стабильному id;
//   wallets/tags/settings — по имени/ключу; tx ссылается на кошелёк/тег по
//     имени, поэтому переименование каскадится в операции, а старое имя уходит
//     tombstone'ом (см. renameWallet/renameTag).
//   categories — сначала по id, затем по имени. Сопоставление по id ловит
//     переименование (строка листа с тем же id — та же категория, а не новая),
//     сопоставление по имени — совпадение базовых категорий на разных
//     устройствах (id категории у них разный). tx ссылается на категорию по
//     имени, поэтому имя каскадится в операции при rename.
//
// Первый синк с пустым локальным стором и непустой таблицей = «adopt»: берём
// таблицу как источник (бывший google-пользователь / второе устройство), не
// смешивая её со свежесозданными дефолтами. Иначе — обычный merge без потерь.

import { ensureSyncSchema, fetchAllForSync, overwriteEntity } from './store';
import { rawDump, applyRecords, replaceAllData, getMeta, setMeta, hardDeleteSettings } from './localBackend';
import { nowStamp, newId } from '../utils/format';
import { DEFAULT_CATEGORIES } from './defaults';

const ENTITIES = ['transactions', 'categories', 'wallets', 'tags', 'settings'];

// Устаревшие служебные ключи настроек (флаги давно отработавших миграций).
// Разово вычищаем их из листа и локального стора при синке; после этого
// проверка становится no-op. У настроек нет tombstone, поэтому обычный merge
// вернул бы ключ с одной стороны на другую — чистим обе явно.
const DEAD_SETTINGS = ['tagsBackfilled', 'tagsHashStripped'];

const norm = (s) => (s || '').trim().toLowerCase();

const KEY = {
  transactions: (r) => r.id,
  categories: (r) => `n:${norm(r.name)}`,
  wallets: (r) => `n:${norm(r.name)}`,
  tags: (r) => (r.name || '').trim(),
  settings: (r) => r.key,
};

// Ключ снапшота (для детекта ручных правок листа между синками). У категорий —
// по id (стабилен при переименовании), с откатом на имя, если id ещё нет.
function snapKeyOf(entity, r) {
  if (!r) return '';
  if (entity === 'categories') return r.id || `n:${norm(r.name)}`;
  return KEY[entity](r);
}

// Поля, определяющие «содержимое» записи для сравнения (без updatedAt).
// Для категорий id исключён намеренно (см. шапку).
function contentSig(entity, r) {
  switch (entity) {
    case 'transactions':
      return JSON.stringify([
        r.id, r.date, r.time, r.type, r.amount, r.category || '', r.note || '',
        [...(r.tags || [])].map((t) => t.trim()).filter(Boolean).sort(),
        r.wallet || '', r.currency || '', r.origAmount ?? null, r.origCurrency || '',
        r.groupId || '', r.rate ?? null, !!r.deleted,
      ]);
    case 'categories':
      return JSON.stringify([r.name, r.kind || 'both', r.status || 'active', r.icon || '', r.order ?? 0, !!r.deleted]);
    case 'wallets':
      return JSON.stringify([r.name || '', r.currency || '', r.status || 'active', r.order ?? 0, r.kind || 'cash', Number(r.rate) || 0, !!r.deleted]);
    case 'tags':
      return JSON.stringify([r.name, r.status || 'active', !!r.deleted]);
    case 'settings':
      return JSON.stringify([r.key, r.value ?? '']);
    default:
      return JSON.stringify(r);
  }
}

// Эффективная метка удалённой записи с поправкой на ручные правки листа:
// если содержимое листа отличается от снапшота, но метка не выросла — правили
// руками, считаем изменение свежим (иначе оно проиграло бы локальной версии).
//
// ВАЖНО: эту поправку применяем ТОЛЬКО когда локальная сторона с прошлого синка
// не менялась. Иначе (обе стороны изменились относительно снапшота) это обычный
// конфликт — и «сейчас» на удалённой стороне затирал бы реальную локальную
// правку. Так, например, локально заархивированный кошелёк не воскресал бы из
// листа: метка листа хранится посекундно и почти всегда `<= snapEntry.ts`
// (в снапшоте — полные мс), поэтому без этой проверки любое расхождение
// сигнатуры листа ложно трактовалось как ручная правка.
function effectiveRemoteTs(entity, r, l, snapEntry, now) {
  const ts = r.updatedAt || 0;
  if (!snapEntry) return ts;
  const remoteChanged = contentSig(entity, r) !== snapEntry.sig;
  const localChanged = l != null && contentSig(entity, l) !== snapEntry.sig;
  if (remoteChanged && !localChanged && ts <= snapEntry.ts) {
    return now;
  }
  return ts;
}

// --- Сопоставление локальных и удалённых записей в пары {l, r} ---------------

function pairByKey(localRecs, remoteRecs, keyFn) {
  const lMap = new Map(localRecs.map((x) => [keyFn(x), x]));
  const rMap = new Map(remoteRecs.map((x) => [keyFn(x), x]));
  const keys = new Set([...lMap.keys(), ...rMap.keys()]);
  return [...keys].map((k) => ({ l: lMap.get(k) || null, r: rMap.get(k) || null }));
}

// Категории: пара по id (ловит rename), затем по имени (базовые на разных устройствах).
function pairCategories(localRecs, remoteRecs) {
  const rById = new Map(remoteRecs.filter((c) => c.id).map((c) => [c.id, c]));
  const rByName = new Map();
  remoteRecs.forEach((c) => { if (!rByName.has(norm(c.name))) rByName.set(norm(c.name), c); });
  const usedR = new Set();
  const pairs = [];
  for (const l of localRecs) {
    let r = (l.id && rById.get(l.id)) || null;
    if (!r) {
      const byName = rByName.get(norm(l.name));
      if (byName && !usedR.has(byName)) r = byName;
    }
    if (r) usedR.add(r);
    pairs.push({ l, r: r || null });
  }
  for (const r of remoteRecs) if (!usedR.has(r)) pairs.push({ l: null, r });
  return pairs;
}

// Общее ядро слияния по готовым парам.
function mergeCore(entity, pairs, snap, now) {
  const localUpserts = [];
  const remoteRecords = [];
  const newSnap = {};
  let remoteDirty = false;

  for (const { l, r } of pairs) {
    let winner;
    if (l && !r) winner = l;
    else if (r && !l) winner = r;
    else {
      const rEff = effectiveRemoteTs(entity, r, l, snap[snapKeyOf(entity, r)], now);
      winner = rEff > (l.updatedAt || 0) ? r : l;
    }

    // Локальная запись: у категорий сохраняем стабильный локальный id, чтобы
    // rename не плодил дубли в IndexedDB (стор с keyPath 'id').
    const localRec = entity === 'categories'
      ? { ...winner, id: (l && l.id) || (r && r.id) || newId() }
      : winner;
    // Запись для листа: у категорий сохраняем id, уже стоящий в таблице.
    const remoteRec = entity === 'categories'
      ? { ...winner, id: (r && r.id) || (l && l.id) || '' }
      : winner;

    remoteRecords.push(remoteRec);
    const winnerSig = contentSig(entity, winner);
    newSnap[snapKeyOf(entity, remoteRec)] = { ts: winner.updatedAt || 0, sig: winnerSig };

    if (!l || contentSig(entity, l) !== winnerSig || (l.updatedAt || 0) !== (winner.updatedAt || 0)) {
      localUpserts.push(localRec);
    }
    if (!r || contentSig(entity, r) !== winnerSig) {
      remoteDirty = true;
    }
  }

  return { localUpserts, remoteRecords, remoteDirty, snap: newSnap };
}

export function mergeEntity(entity, localRecs, remoteRecs, snap, now) {
  const pairs = entity === 'categories'
    ? pairCategories(localRecs, remoteRecs)
    : pairByKey(localRecs, remoteRecs, KEY[entity]);
  return mergeCore(entity, pairs, snap, now);
}

function buildSnapshot(data) {
  const snap = {};
  for (const entity of ENTITIES) {
    snap[entity] = {};
    for (const r of data[entity] || []) {
      snap[entity][snapKeyOf(entity, r)] = { ts: r.updatedAt || 0, sig: contentSig(entity, r) };
    }
  }
  return snap;
}

// У категорий из старой таблицы может не быть id — проставим для локального стора.
function withCategoryIds(remote) {
  return {
    ...remote,
    categories: (remote.categories || []).map((c) => ({ ...c, id: c.id || newId() })),
  };
}

// Полный цикл синхронизации. Кидает AuthError/ошибки сети наружу — вызывающий
// решает, что показать. Возвращает сводку изменений.
export async function syncNow(spreadsheetId) {
  await ensureSyncSchema(spreadsheetId);
  const now = nowStamp();

  const [remote, local] = await Promise.all([fetchAllForSync(spreadsheetId), rawDump()]);

  // Разовая чистка устаревших служебных ключей настроек — из листа и локально.
  const isDead = (r) => DEAD_SETTINGS.includes(r.key);
  if ((remote.settings || []).some(isDead) || (local.settings || []).some(isDead)) {
    remote.settings = (remote.settings || []).filter((r) => !isDead(r));
    local.settings = (local.settings || []).filter((r) => !isDead(r));
    await hardDeleteSettings(DEAD_SETTINGS);
    await overwriteEntity(spreadsheetId, 'settings', remote.settings);
  }

  // Первый синк с ПУСТЫМ локальным стором и непустой таблицей — принять таблицу
  // (adopt: replaceAllData затирает локальное). Это разрушающая операция, поэтому
  // «пусто» проверяем по ВСЕМ сущностям, а не только по операциям: у пользователя
  // могли быть заведены кошельки/категории/теги без единой операции — их adopt
  // затёр бы. Считаем локальное нетронутым, только если нет живых операций и
  // тегов, а кошельки/категории не превышают исходный дефолтный посев. Иначе —
  // обычный merge (union по LWW), который ничего локально не удаляет.
  const live = (rows) => (rows || []).filter((x) => !x.deleted).length;
  const localPristine =
    live(local.transactions) === 0 &&
    live(local.tags) === 0 &&
    live(local.wallets) <= 1 &&
    live(local.categories) <= DEFAULT_CATEGORIES.length;
  const firstSync = !(await getMeta('lastSync'));
  const remoteHasData = ENTITIES.some((e) => (remote[e] || []).length > 0);
  if (firstSync && localPristine && remoteHasData) {
    const adopted = withCategoryIds(remote);
    // Страховка: перед разрушающей заменой сохраняем снимок локальных данных,
    // чтобы включение синхронизации никогда не приводило к безвозвратной потере.
    await setMeta('preSyncBackup', { at: now, reason: 'adopt', data: local });
    await replaceAllData(adopted);
    await setMeta('syncSnapshot', buildSnapshot(adopted));
    await setMeta('lastSync', now);
    return { at: now, adopted: true, pulled: (adopted.transactions || []).length, pushedEntities: 0 };
  }

  const snapAll = (await getMeta('syncSnapshot')) || {};
  const newSnapAll = {};
  let pulled = 0;
  let pushedEntities = 0;

  // Разовая миграция формата ячеек: один раз на таблицу переписываем все листы,
  // чтобы «сырые»/ISO updatedAt и голые даты в datetime стали читаемым datetime
  // «YYYY-MM-DD HH:MM:SS». Содержимое не меняется — только кодировка ячеек.
  const fmtKey = `freemoney:fmtmig2:${spreadsheetId}`;
  const migrateFmt = !localStorage.getItem(fmtKey);

  for (const entity of ENTITIES) {
    const res = mergeEntity(entity, local[entity] || [], remote[entity] || [], snapAll[entity] || {}, now);
    newSnapAll[entity] = res.snap;
    if (res.localUpserts.length) {
      await applyRecords(entity, res.localUpserts);
      pulled += res.localUpserts.length;
    }
    if (res.remoteDirty || (migrateFmt && res.remoteRecords.length)) {
      await overwriteEntity(spreadsheetId, entity, res.remoteRecords);
      pushedEntities += 1;
    }
  }

  if (migrateFmt) localStorage.setItem(fmtKey, '1');

  await setMeta('syncSnapshot', newSnapAll);
  await setMeta('lastSync', now);
  return { at: now, adopted: false, pulled, pushedEntities };
}
