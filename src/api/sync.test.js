import { describe, it, expect } from 'vitest';
import { mergeEntity } from './sync';

// Мини-модель синхронизации двух устройств через общий лист на чистом
// mergeEntity: устройство = { recs, snap }, лист = { recs }. Применение
// результата повторяет syncNow: upsert'ы и rekey в локальный «стор» по его
// ключу (у категорий — id, у кошельков/тегов — имя), перезапись листа.
function sync(dev, sheet, entity, now) {
  const res = mergeEntity(entity, dev.recs, sheet.recs, dev.snap, now);
  const keyOf = (r) => (entity === 'categories' ? r.id : r.name);
  const m = new Map(dev.recs.map((r) => [keyOf(r), r]));
  for (const r of res.localUpserts) m.set(keyOf(r), r);
  for (const { from, rec } of res.localRekeys) { m.delete(from); m.set(keyOf(rec), rec); }
  dev.recs = [...m.values()];
  // В ячейке метка хранится посекундно.
  sheet.recs = res.remoteRecords.map((r) => ({ ...r, updatedAt: Math.floor((r.updatedAt || 0) / 1000) * 1000 }));
  dev.snap = res.snap;
}
const live = (recs) => recs.filter((r) => !r.deleted).map((r) => r.name).sort();

describe('sync: переименование категорий', () => {
  it('категории с разными id на устройствах сводятся к id из таблицы', () => {
    const sheet = { recs: [] };
    const A = { recs: [{ id: 'a1', name: 'Еда', updatedAt: 1000 }], snap: {} };
    const B = { recs: [{ id: 'b1', name: 'Еда', updatedAt: 1000 }], snap: {} };
    sync(A, sheet, 'categories', 5000);
    sync(B, sheet, 'categories', 6000);
    expect(B.recs.map((c) => c.id)).toEqual(['a1']);
  });

  it('переименование на втором устройстве не плодит дубль', () => {
    const sheet = { recs: [] };
    const A = { recs: [{ id: 'a1', name: 'Еда', updatedAt: 1000 }], snap: {} };
    const B = { recs: [{ id: 'b1', name: 'Еда', updatedAt: 1000 }], snap: {} };
    sync(A, sheet, 'categories', 5000);
    sync(B, sheet, 'categories', 6000);
    B.recs = B.recs.map((c) => ({ ...c, name: 'Продукты', updatedAt: 10000 }));
    sync(B, sheet, 'categories', 11000);
    sync(A, sheet, 'categories', 12000);
    expect(live(sheet.recs)).toEqual(['Продукты']);
    expect(live(A.recs)).toEqual(['Продукты']);
    expect(live(B.recs)).toEqual(['Продукты']);
  });

  it('переименование на первом устройстве доезжает до второго', () => {
    const sheet = { recs: [] };
    const A = { recs: [{ id: 'a1', name: 'Еда', updatedAt: 1000 }], snap: {} };
    const B = { recs: [{ id: 'b1', name: 'Еда', updatedAt: 1000 }], snap: {} };
    sync(A, sheet, 'categories', 5000);
    sync(B, sheet, 'categories', 6000);
    A.recs = A.recs.map((c) => ({ ...c, name: 'Продукты', updatedAt: 10000 }));
    sync(A, sheet, 'categories', 11000);
    sync(B, sheet, 'categories', 12000);
    expect(live(sheet.recs)).toEqual(['Продукты']);
    expect(live(B.recs)).toEqual(['Продукты']);
  });

  it('rekey не трогает категории, у которых id уже совпадает', () => {
    const res = mergeEntity(
      'categories',
      [{ id: 'x', name: 'Еда', updatedAt: 1000 }],
      [{ id: 'x', name: 'Еда', updatedAt: 1000 }],
      {}, 2000,
    );
    expect(res.localRekeys).toEqual([]);
    expect(res.localUpserts).toEqual([]);
  });
});

describe('sync: переименование кошельков и тегов', () => {
  for (const entity of ['wallets', 'tags']) {
    it(`${entity}: старое имя уходит tombstone'ом на обоих устройствах`, () => {
      const sheet = { recs: [] };
      const A = { recs: [{ name: 'Карта', updatedAt: 1000 }], snap: {} };
      const B = { recs: [{ name: 'Карта', updatedAt: 1000 }], snap: {} };
      sync(A, sheet, entity, 5000);
      sync(B, sheet, entity, 6000);
      B.recs = [{ name: 'Карта', deleted: true, updatedAt: 10500 }, { name: 'Тинькофф', updatedAt: 10500 }];
      sync(B, sheet, entity, 11000);
      sync(A, sheet, entity, 12000);
      sync(B, sheet, entity, 13000);
      expect(live(sheet.recs)).toEqual(['Тинькофф']);
      expect(live(A.recs)).toEqual(['Тинькофф']);
      expect(live(B.recs)).toEqual(['Тинькофф']);
    });
  }

  it('кошелёк: смена только регистра не теряет новое имя', () => {
    const sheet = { recs: [] };
    const A = { recs: [{ name: 'карта', updatedAt: 1000 }], snap: {} };
    sync(A, sheet, 'wallets', 5000);
    // В IndexedDB это два разных ключа: tombstone «карта» и живая «Карта».
    A.recs = [{ name: 'Карта', updatedAt: 10000 }, { name: 'карта', deleted: true, updatedAt: 10000 }];
    sync(A, sheet, 'wallets', 11000);
    expect(live(sheet.recs)).toEqual(['Карта']);
  });
});
