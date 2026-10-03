import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedLatest, getLatestRates } from './rates';
import { todayIso } from '../utils/format';

// Простой localStorage для node-окружения тестов.
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

describe('getLatestRates', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('офлайн — отдаёт последние сохранённые курсы с их датой', async () => {
    localStorage.setItem('freemoney:rates:latest:rub', JSON.stringify({ date: '2026-09-28', map: { usd: 0.0125 } }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await getLatestRates('RUB')).toEqual({ date: '2026-09-28', map: { usd: 0.0125 } });
  });

  it('офлайн без кэша — null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await getLatestRates('RUB')).toBeNull();
  });

  it('онлайн — сохраняет свежие курсы, повторно сеть не дёргает', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rub: { usd: 0.012 } }) });
    vi.stubGlobal('fetch', fetch);
    expect(await getLatestRates('RUB')).toEqual({ date: todayIso(), map: { usd: 0.012 } });
    expect(await getLatestRates('RUB')).toEqual({ date: todayIso(), map: { usd: 0.012 } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('понимает старый формат кэша (курсы под датой) — берёт самый свежий', () => {
    localStorage.setItem('freemoney:rates:2026-09-01:rub', JSON.stringify({ usd: 0.011 }));
    localStorage.setItem('freemoney:rates:2026-09-20:rub', JSON.stringify({ usd: 0.012 }));
    localStorage.setItem('freemoney:rates:2026-09-25:usd', JSON.stringify({ rub: 80 }));
    expect(getCachedLatest('RUB')).toEqual({ date: '2026-09-20', map: { usd: 0.012 } });
  });
});
