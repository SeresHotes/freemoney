// Курсы валют через бесплатный currency-api (fawazahmed0), без ключа и с CORS.
// Текущие курсы кэшируются на день, исторические (по дате) — навсегда.

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

// Карта курсов { код: курс } для базовой валюты на дату (или на сегодня).
// date === 'latest' | 'YYYY-MM-DD'. Возвращает { ...rates } либо null при сбое.
export async function getRatesMap(base, date = 'latest') {
  const lower = base.toLowerCase();
  // Ключ кэша для latest — сегодняшняя дата (обновление раз в день).
  const cacheDate = date === 'latest' ? todayIso() : date;
  const cached = readCache(lower, cacheDate);
  if (cached) return cached;

  for (const url of [PRIMARY(lower, date), FALLBACK(lower, date)]) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();
      const map = data[lower];
      if (map) {
        writeCache(lower, cacheDate, map);
        return map;
      }
    } catch {
      /* пробуем следующий источник */
    }
  }
  return null;
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
