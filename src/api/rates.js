// Курсы валют через бесплатный currency-api (fawazahmed0), без ключа и с CORS.
// Исторические курсы (по дате) кэшируются навсегда. Текущие — одна запись
// «последние известные курсы» на базовую валюту: свежие раз в день, а без сети
// (или пока идёт запрос) работаем на последних сохранённых — офлайн суммы в
// других валютах не пропадают.

import { todayIso } from '../utils/format';

const LS_PREFIX = 'freemoney:rates:';

const PRIMARY = (base, date) =>
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${base}.json`;
const FALLBACK = (base, date) =>
  `https://${date}.currency-api.pages.dev/v1/currencies/${base}.json`;

function cacheKey(base, date) {
  return `${LS_PREFIX}${date}:${base}`;
}

function readCache(base, date) {
  try {
    const raw = localStorage.getItem(cacheKey(base, date));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(base, date, map) {
  try {
    localStorage.setItem(cacheKey(base, date), JSON.stringify(map));
  } catch {
    /* переполнение/недоступность — не критично */
  }
}

const latestKey = (base) => `${LS_PREFIX}latest:${base}`;

// Последние сохранённые текущие курсы: { date: 'YYYY-MM-DD', map } или null.
// Для обратной совместимости смотрит и старые записи «по дате» (раньше текущие
// курсы кэшировались под сегодняшней датой) — берёт самую свежую.
export function getCachedLatest(base) {
  const lower = base.toLowerCase();
  try {
    const raw = localStorage.getItem(latestKey(lower));
    if (raw) return JSON.parse(raw);
    let best = null;
    const today = todayIso();
    for (let i = 0; i < localStorage.length; i++) {
      const m = /^freemoney:rates:(\d{4}-\d{2}-\d{2}):(.+)$/.exec(localStorage.key(i) || '');
      if (m && m[2] === lower && m[1] <= today && (!best || m[1] > best)) best = m[1];
    }
    return best ? { date: best, map: readCache(lower, best) } : null;
  } catch {
    return null;
  }
}

async function fetchMap(lower, date) {
  for (const url of [PRIMARY(lower, date), FALLBACK(lower, date)]) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data[lower]) return data[lower];
    } catch {
      /* пробуем следующий источник */
    }
  }
  return null;
}

// Текущие курсы: { date, map }. Сегодняшние — из кэша; иначе запрос, а при
// сбое — последние сохранённые (могут быть старыми; date это показывает).
// null — курсов нет вообще (ни сети, ни кэша).
export async function getLatestRates(base) {
  const lower = base.toLowerCase();
  const cached = getCachedLatest(lower);
  const today = todayIso();
  if (cached?.map && cached.date === today) return cached;
  const map = await fetchMap(lower, 'latest');
  if (map) {
    const fresh = { date: today, map };
    try {
      localStorage.setItem(latestKey(lower), JSON.stringify(fresh));
    } catch {
      /* переполнение/недоступность — не критично */
    }
    return fresh;
  }
  return cached?.map ? cached : null;
}

// Карта курсов { код: курс } для базовой валюты на дату (или на сегодня).
// date === 'latest' | 'YYYY-MM-DD'. Возвращает { ...rates } либо null при сбое.
export async function getRatesMap(base, date = 'latest') {
  const lower = base.toLowerCase();
  if (date === 'latest') return (await getLatestRates(lower))?.map ?? null;
  const cached = readCache(lower, date);
  if (cached) return cached;
  const map = await fetchMap(lower, date);
  if (map) writeCache(lower, date, map);
  return map;
}

// Курс: сколько единиц `to` за 1 единицу `from` на дату.
export async function getRate(from, to, date = 'latest') {
  if (from === to) return 1;
  const map = await getRatesMap(from, date);
  const rate = map?.[to.toLowerCase()];
  return typeof rate === 'number' ? rate : null;
}

// Конвертация суммы. Возвращает null, если курс недоступен.
export async function convert(amount, from, to, date = 'latest') {
  const rate = await getRate(from, to, date);
  return rate == null ? null : amount * rate;
}
