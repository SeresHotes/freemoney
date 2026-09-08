// FreeMoney auth backend (Cloudflare Worker).
// Задача: держать refresh-токен Google на сервере и по запросу выдавать
// свежий access-токен приложению. Данные пользователя через воркер не идут —
// приложение обращается к Google Sheets напрямую с полученным токеном.
//
// Маршруты:
//   GET  /auth/login    — редирект на согласие Google (authorization code flow)
//   GET  /auth/callback — обмен кода на токены, сохранение refresh-токена в KV
//   GET  /auth/token    — выдать свежий access-токен по sid
//   POST /auth/logout   — удалить сессию
//
// Переменные окружения (wrangler.toml [vars] + secret):
//   GOOGLE_CLIENT_ID      — public
//   GOOGLE_CLIENT_SECRET  — secret (wrangler secret put)
//   APP_URL               — куда вернуть пользователя (адрес приложения)
//   ALLOWED_ORIGIN        — origin приложения для CORS
// KV binding: SESSIONS

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 дней в KV (refresh-токен живёт меньше в Testing)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname === '/auth/login') return login(url, env);
      if (url.pathname === '/auth/callback') return callback(url, env);
      if (url.pathname === '/auth/token') return issueToken(url, env, cors);
      if (url.pathname === '/auth/logout') return logout(url, env, cors);
      if (url.pathname === '/' ) return html(HOMEPAGE, env);
      if (url.pathname === '/privacy') return html(PRIVACY, env);
      if (url.pathname === '/terms') return html(TERMS, env);
    } catch (e) {
      return json({ error: 'server_error', detail: String(e) }, 500, cors);
    }
    return new Response('Not found', { status: 404, headers: cors });
  },
};

function html(body, env) {
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

const HOMEPAGE = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FreeMoney — учёт денег</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;background:#0f172a;color:#f1f5f9;line-height:1.6}
a{color:#60a5fa}h1{font-size:1.8rem}.card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:20px;margin:20px 0}</style>
</head><body>
<h1>💰 FreeMoney</h1>
<p>Простое приложение для учёта личных доходов и расходов. Данные хранятся в вашей собственной Google Таблице — у приложения нет своего сервера с вашими финансами.</p>
<div class="card">
<p><b>Открыть приложение:</b> <a href="https://sereshotes.github.io/freemoney/">sereshotes.github.io/freemoney</a></p>
</div>
<p><a href="/privacy">Политика конфиденциальности</a></p>
</body></html>`;

const PRIVACY = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FreeMoney — Политика конфиденциальности</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;background:#0f172a;color:#f1f5f9;line-height:1.6}
h1{font-size:1.6rem}h2{font-size:1.15rem;margin-top:1.5em}a{color:#60a5fa}</style>
</head><body>
<h1>Политика конфиденциальности FreeMoney</h1>
<p>Обновлено: 2026.</p>

<h2>Кто мы</h2>
<p>FreeMoney — персональное приложение для учёта доходов и расходов, разработанное частным лицом. Контакт: <a href="mailto:sereshotes@gmail.com">sereshotes@gmail.com</a>.</p>

<h2>Какие данные мы используем</h2>
<p>Приложению для работы требуется доступ к Google Drive в объёме scope <code>drive.file</code> — это доступ <b>только к тем файлам, которые создало само приложение</b> (ваша таблица учёта). Приложение не имеет доступа к остальным файлам вашего Google Drive.</p>

<h2>Где хранятся данные</h2>
<p>Все ваши финансовые данные (операции, категории, кошельки) хранятся <b>в вашей собственной Google Таблице</b>, в вашем аккаунте Google. Мы не храним и не передаём эти данные на своих серверах.</p>

<h2>Вспомогательный сервер авторизации</h2>
<p>Чтобы вам не приходилось входить каждый час, вспомогательный сервер (на Cloudflare) хранит только токен обновления Google, необходимый для продления доступа. Через него не проходят ваши финансовые данные. Токен можно отозвать в любой момент в настройках вашего аккаунта Google (Сторонние приложения) или выйдя из приложения.</p>

<h2>Передача третьим лицам</h2>
<p>Мы не продаём, не передаём и не публикуем ваши данные. Данные не используются для рекламы или аналитики.</p>

<h2>Удаление данных</h2>
<p>Вы можете в любой момент удалить свою Google Таблицу и отозвать доступ приложения в настройках Google-аккаунта. После этого у приложения не остаётся никакого доступа к вашим данным.</p>

<h2>Изменения</h2>
<p>Актуальная версия политики всегда доступна по этому адресу.</p>
</body></html>`;

const TERMS = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FreeMoney — Условия использования</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;background:#0f172a;color:#f1f5f9;line-height:1.6}
h1{font-size:1.6rem}h2{font-size:1.15rem;margin-top:1.5em}a{color:#60a5fa}</style>
</head><body>
<h1>Условия использования FreeMoney</h1>
<p>Обновлено: 2026.</p>

<h2>О сервисе</h2>
<p>FreeMoney — бесплатное персональное приложение для учёта личных доходов и расходов, разработанное частным лицом. Контакт: <a href="mailto:sereshotes@gmail.com">sereshotes@gmail.com</a>.</p>

<h2>Использование</h2>
<p>Приложение предоставляется «как есть» (as is), без каких-либо гарантий. Вы используете его на свой риск. Приложение предназначено для личного учёта финансов и не является финансовой, бухгалтерской или инвестиционной консультацией.</p>

<h2>Ваши данные</h2>
<p>Все ваши данные хранятся в вашей собственной Google Таблице (в вашем аккаунте Google). Вы полностью контролируете их и можете удалить в любой момент. Подробнее — в <a href="/privacy">Политике конфиденциальности</a>.</p>

<h2>Ответственность</h2>
<p>Автор не несёт ответственности за возможные потери данных, неточности расчётов или иной ущерб, связанный с использованием приложения. Резервное копирование данных — на стороне пользователя (в приложении есть экспорт).</p>

<h2>Изменения</h2>
<p>Условия могут обновляться; актуальная версия всегда доступна по этому адресу.</p>
</body></html>`;

// redirect_uri вычисляем из адреса воркера — его же регистрируем в Google Cloud.
function redirectUri(url) {
  return `${url.origin}/auth/callback`;
}

// Разрешённые origin приложения (для CORS и возврата после логина).
function allowedOrigins(env) {
  return (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Куда вернуть пользователя после логина: ?return=... (если origin разрешён),
// иначе APP_URL. Защищает от open-redirect.
function safeReturnUrl(url, env) {
  const ret = url.searchParams.get('return');
  if (ret) {
    try {
      if (allowedOrigins(env).includes(new URL(ret).origin)) return ret;
    } catch { /* невалидный URL */ }
  }
  return env.APP_URL;
}

function login(url, env) {
  const returnUrl = safeReturnUrl(url, env);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(url),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // чтобы получить refresh-токен
    prompt: 'consent', // гарантированно выдать refresh-токен
    include_granted_scopes: 'true',
    state: btoa(returnUrl), // куда вернуться после callback
  });
  return Response.redirect(`${GOOGLE_AUTH}?${params}`, 302);
}

// Добавить query-параметр к URL (учитывая, что там уже может быть '?').
function appendQuery(target, key, value) {
  const sep = target.includes('?') ? '&' : '?';
  return `${target}${sep}${key}=${encodeURIComponent(value)}`;
}

// Куда вернуться из callback: берём из state, но проверяем origin по allowlist.
function returnFromState(url, env) {
  const state = url.searchParams.get('state');
  if (state) {
    try {
      const decoded = atob(state);
      if (allowedOrigins(env).includes(new URL(decoded).origin)) return decoded;
    } catch { /* игнорируем */ }
  }
  return env.APP_URL;
}

async function callback(url, env) {
  const returnUrl = returnFromState(url, env);
  const code = url.searchParams.get('code');
  if (!code) return Response.redirect(appendQuery(returnUrl, 'auth', 'error'), 302);

  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(url),
    grant_type: 'authorization_code',
  });
  const resp = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await resp.json();
  if (!data.refresh_token) {
    return Response.redirect(appendQuery(returnUrl, 'auth', 'error'), 302);
  }

  const sid = crypto.randomUUID() + crypto.randomUUID();
  await env.SESSIONS.put(sid, JSON.stringify({ refresh_token: data.refresh_token }), {
    expirationTtl: SESSION_TTL,
  });
  return Response.redirect(appendQuery(returnUrl, 'sid', sid), 302);
}

async function issueToken(url, env, cors) {
  const sid = url.searchParams.get('sid');
  if (!sid) return json({ error: 'no_sid' }, 400, cors);

  const rec = await env.SESSIONS.get(sid);
  if (!rec) return json({ error: 'invalid_session' }, 401, cors);

  const { refresh_token } = JSON.parse(rec);
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token,
    grant_type: 'refresh_token',
  });
  const resp = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await resp.json();
  if (!data.access_token) {
    // refresh-токен протух/отозван (в Testing — через 7 дней) — чистим сессию.
    await env.SESSIONS.delete(sid);
    return json({ error: 'refresh_failed' }, 401, cors);
  }
  return json({ access_token: data.access_token, expires_in: data.expires_in }, 200, cors);
}

async function logout(url, env, cors) {
  const sid = url.searchParams.get('sid');
  if (sid) await env.SESSIONS.delete(sid);
  return json({ ok: true }, 200, cors);
}

function corsHeaders(env, request) {
  const allowed = allowedOrigins(env);
  const origin = request?.headers?.get('Origin') || '';
  const allow = allowed.includes(origin) ? origin : (allowed[0] || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
