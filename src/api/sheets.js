// Низкоуровневый слой работы с Google Sheets и Drive REST API.
// Каждый запрос подписывается свежим access_token из googleAuth.

import { ensureToken } from '../auth/googleAuth';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

// Ошибка авторизации — контекст по ней сбрасывает пользователя на экран входа.
export class AuthError extends Error {}

async function authFetch(url, options = {}) {
  const token = await ensureToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`Google API ${response.status}`);
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

// Дописать строку в конец диапазона.
export async function appendRow(spreadsheetId, range, values) {
  const url =
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}` +
    ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
  return authFetch(url, { method: 'POST', body: JSON.stringify({ values: [values] }) });
}

// Перезаписать значения конкретного диапазона.
export async function updateValues(spreadsheetId, range, values) {
  const url =
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}` +
    '?valueInputOption=USER_ENTERED';
  return authFetch(url, { method: 'PUT', body: JSON.stringify({ values }) });
}

// Обновить несколько диапазонов за один запрос.
// data — массив { range, values }.
export async function batchUpdateValues(spreadsheetId, data) {
  if (data.length === 0) return {};
  const url = `${SHEETS_API}/${spreadsheetId}/values:batchUpdate`;
  return authFetch(url, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
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
