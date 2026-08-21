// Авторизация через Google Identity Services (GIS) — token flow.
// GitHub Pages статичен, бэкенда нет, поэтому весь OAuth идёт в браузере:
// получаем короткоживущий access_token и ходим с ним в Google Sheets/Drive API.

import { GOOGLE_CLIENT_ID, OAUTH_SCOPE } from '../config';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0; // timestamp в мс, когда токен считаем протухшим

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

// Инициализация. Вызывается один раз при старте приложения.
export async function initAuth() {
  await loadGisScript();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: OAUTH_SCOPE,
      callback: () => {}, // реальный колбэк ставится на каждый запрос
    });
  }
}

function requestToken({ prompt }) {
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
      // expires_in в секундах; минусуем минуту на дорогу.
      tokenExpiry = Date.now() + (Number(response.expires_in) - 60) * 1000;
      resolve(accessToken);
    };
    tokenClient.error_callback = (err) => {
      reject(new Error(err?.type || 'token_error'));
    };
    tokenClient.requestAccessToken({ prompt });
  });
}

// Явный вход по клику пользователя — показывает окно выбора аккаунта/согласия.
export function signIn() {
  return requestToken({ prompt: 'consent' });
}

// Тихое получение токена: вернёт кэш, если он ещё жив, иначе попробует
// обновить без UI (сработает, если согласие уже выдано и сессия Google активна).
export async function ensureToken() {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }
  return requestToken({ prompt: '' });
}

export function isSignedIn() {
  return Boolean(accessToken) && Date.now() < tokenExpiry;
}

export function signOut() {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiry = 0;
}
