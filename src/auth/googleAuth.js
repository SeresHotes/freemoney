// Авторизация Google. Два режима:
//  - AUTH_BACKEND задан → authorization code flow через мини-бэкенд
//    (refresh-токен на сервере, редкий вход);
//  - AUTH_BACKEND пуст → браузерный token flow через Google Identity Services
//    (короткий токен ~1 час).

import { GOOGLE_CLIENT_ID, OAUTH_SCOPE, AUTH_BACKEND } from '../config';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const LS_TOKEN = 'freemoney:token';
const LS_SID = 'freemoney:sid';

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0; // timestamp в мс, когда токен считаем протухшим

// --- Кэш access-токена (общий для обоих режимов) ----------------------------
function persistToken() {
  try {
    localStorage.setItem(LS_TOKEN, JSON.stringify({ token: accessToken, expiry: tokenExpiry }));
  } catch {
    /* localStorage недоступен — не критично */
  }
}

function loadCachedToken() {
  try {
    const raw = localStorage.getItem(LS_TOKEN);
    if (!raw) return;
    const { token, expiry } = JSON.parse(raw);
    if (token && expiry && Date.now() < expiry) {
      accessToken = token;
      tokenExpiry = expiry;
    }
  } catch {
    /* повреждённый кэш — игнорируем */
  }
}

// После возврата с бэкенда в URL приходит ?sid=... — сохраняем и чистим адрес.
function captureSidFromUrl() {
  if (!AUTH_BACKEND) return;
  try {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('sid');
    if (!sid) return;
    localStorage.setItem(LS_SID, sid);
    params.delete('sid');
    params.delete('auth');
    const query = params.toString();
    const newUrl = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
    window.history.replaceState(null, '', newUrl);
  } catch {
    /* ignore */
  }
}

captureSidFromUrl();
loadCachedToken();

// --- Бэкенд-режим -----------------------------------------------------------
async function fetchTokenFromBackend() {
  const sid = localStorage.getItem(LS_SID);
  if (!sid) throw new Error('no_session');
  const resp = await fetch(`${AUTH_BACKEND}/auth/token?sid=${encodeURIComponent(sid)}`);
  if (!resp.ok) {
    if (resp.status === 401) {
      // сессия/refresh-токен недействительны — сбрасываем.
      localStorage.removeItem(LS_SID);
    }
    throw new Error('backend_token_failed');
  }
  const data = await resp.json();
  accessToken = data.access_token;
  const ttl = Number(data.expires_in) || 3600;
  tokenExpiry = Date.now() + (ttl - 60) * 1000;
  persistToken();
  return accessToken;
}

// --- GIS-режим --------------------------------------------------------------
function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Не удалось загрузить Google Identity Services')));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Не удалось загрузить Google Identity Services'));
    document.head.appendChild(script);
  });
}

function requestGisToken({ prompt }) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Авторизация не инициализирована'));
      return;
    }
    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      accessToken = response.access_token;
      const ttl = Number(response.expires_in) || 3600;
      tokenExpiry = Date.now() + (ttl - 60) * 1000;
      persistToken();
      resolve(accessToken);
    };
    tokenClient.error_callback = (err) => reject(new Error(err?.type || 'token_error'));
    tokenClient.requestAccessToken({ prompt });
  });
}

// --- Публичный интерфейс ----------------------------------------------------
export async function initAuth() {
  if (AUTH_BACKEND) return; // бэкенд-режиму GIS не нужен
  await loadGisScript();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: OAUTH_SCOPE,
      callback: () => {},
    });
  }
}

// Явный вход по клику.
export function signIn() {
  if (AUTH_BACKEND) {
    // Полный редирект на бэкенд → Google → возврат с sid на текущий адрес/канал.
    const ret = window.location.origin + import.meta.env.BASE_URL;
    window.location.href = `${AUTH_BACKEND}/auth/login?return=${encodeURIComponent(ret)}`;
    return new Promise(() => {});
  }
  return requestGisToken({ prompt: 'consent' });
}

// Получить действующий access-токен (кэш → бэкенд/тихое продление).
export async function ensureToken() {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }
  if (AUTH_BACKEND) return fetchTokenFromBackend();
  return requestGisToken({ prompt: '' });
}

export function isSignedIn() {
  if (accessToken && Date.now() < tokenExpiry) return true;
  if (AUTH_BACKEND) return Boolean(localStorage.getItem(LS_SID));
  return false;
}

export function signOut() {
  if (AUTH_BACKEND) {
    const sid = localStorage.getItem(LS_SID);
    if (sid) {
      fetch(`${AUTH_BACKEND}/auth/logout?sid=${encodeURIComponent(sid)}`, { method: 'POST' }).catch(() => {});
    }
    localStorage.removeItem(LS_SID);
  } else if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiry = 0;
  try {
    localStorage.removeItem(LS_TOKEN);
  } catch {
    /* ignore */
  }
}
