// Низкоуровневый слой работы с Google Sheets и Drive REST API.
// Каждый запрос подписывается свежим access_token из googleAuth.

import { ensureToken } from '../auth/googleAuth';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

// Ошибка авторизации — контекст по ней сбрасывает пользователя на экран входа.
export class AuthError extends Error {}

const MAX_RETRIES = 4;
const RATE_LIMIT_RE = /rateLimitExceeded|userRateLimitExceeded|quotaExceeded|quota/i;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Экспоненциальная задержка с джиттером: ~0.5s, 1s, 2s, 4s.
function backoffMs(attempt) {
  const base = 500 * 2 ** attempt;
  return base + Math.floor(Math.random() * 300);
}

async function authFetch(url, options = {}, attempt = 0) {
  const token = await ensureToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    throw new AuthError('Google API 401');
  }

  // 429 и 5xx — временные, повторяем с backoff.
  if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
    if (attempt < MAX_RETRIES) {
      await delay(backoffMs(attempt));
      return authFetch(url, options, attempt + 1);
    }
    throw new Error(`Google API ${response.status} (после ${MAX_RETRIES} попыток)`);
  }

  if (response.status === 403) {
    const text = await response.text();
    // Превышение квоты приходит как 403 — тоже повторяем; иначе это отказ доступа.
    if (RATE_LIMIT_RE.test(text)) {
      if (attempt < MAX_RETRIES) {
        await delay(backoffMs(attempt));
        return authFetch(url, options, attempt + 1);
      }
      throw new Error('Google API 403: превышен лимит запросов');
    }
    throw new AuthError('Google API 403');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google API ${response.status}: ${text}`);
  }
  // У некоторых ответов (например, пустой PUT) тела нет.
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

// Создать новую таблицу с заданными листами. Возвращает объект spreadsheet.
export async function createSpreadsheet(title, sheetsSpec) {
  return authFetch(SHEETS_API, {
    method: 'POST',
    body: JSON.stringify({ properties: { title }, sheets: sheetsSpec }),
  });
}

// Прочитать значения диапазона. Возвращает массив строк (массив массивов).
export async function getValues(spreadsheetId, range) {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const data = await authFetch(url);
  return data.values || [];
}

// Прочитать несколько диапазонов одним запросом. Возвращает массив значений
// в том же порядке, что и ranges (каждый элемент — массив строк).
export async function getValuesBatch(spreadsheetId, ranges) {
  const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `${SHEETS_API}/${spreadsheetId}/values:batchGet?${qs}`;
  const data = await authFetch(url);
  const byRange = data.valueRanges || [];
  return ranges.map((_, i) => byRange[i]?.values || []);
}

// Дописать строку в конец диапазона.
export async function appendRow(spreadsheetId, range, values) {
  const url =
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}` +
    ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
  return authFetch(url, { method: 'POST', body: JSON.stringify({ values: [values] }) });
}

// Дописать несколько строк одним запросом.
export async function appendRows(spreadsheetId, range, rows) {
  if (!rows.length) return {};
  const url =
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}` +
    ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
  return authFetch(url, { method: 'POST', body: JSON.stringify({ values: rows }) });
}

// Перезаписать значения конкретного диапазона.
export async function updateValues(spreadsheetId, range, values) {
  const url =
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}` +
    '?valueInputOption=RAW';
  return authFetch(url, { method: 'PUT', body: JSON.stringify({ values }) });
}

// Получить метаданные таблицы (список листов и т.п.).
export async function getSpreadsheetMeta(spreadsheetId) {
  const url = `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`;
  return authFetch(url);
}

// Создать лист с заданным заголовком (если его ещё нет — проверяет вызывающий).
export async function addSheet(spreadsheetId, title) {
  const url = `${SHEETS_API}/${spreadsheetId}:batchUpdate`;
  return authFetch(url, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });
}

// Обновить несколько диапазонов за один запрос.
// data — массив { range, values }.
export async function batchUpdateValues(spreadsheetId, data) {
  if (data.length === 0) return {};
  const url = `${SHEETS_API}/${spreadsheetId}/values:batchUpdate`;
  return authFetch(url, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  });
}

// Найти таблицы, созданные этим приложением (в рамках scope drive.file).
// Используется для восстановления, если localStorage очистился.
export async function listAppSpreadsheets() {
  const q = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
  );
  const url = `${DRIVE_API}?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`;
  const data = await authFetch(url);
  return data.files || [];
}
