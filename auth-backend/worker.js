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
    const cors = corsHeaders(env);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname === '/auth/login') return login(url, env);
      if (url.pathname === '/auth/callback') return callback(url, env);
      if (url.pathname === '/auth/token') return issueToken(url, env, cors);
      if (url.pathname === '/auth/logout') return logout(url, env, cors);
    } catch (e) {
      return json({ error: 'server_error', detail: String(e) }, 500, cors);
    }
    return new Response('FreeMoney auth backend', { headers: cors });
  },
};

// redirect_uri вычисляем из адреса воркера — его же регистрируем в Google Cloud.
function redirectUri(url) {
  return `${url.origin}/auth/callback`;
}

function login(url, env) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(url),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // чтобы получить refresh-токен
    prompt: 'consent', // гарантированно выдать refresh-токен
    include_granted_scopes: 'true',
  });
  return Response.redirect(`${GOOGLE_AUTH}?${params}`, 302);
}

async function callback(url, env) {
  const code = url.searchParams.get('code');
  if (!code) return Response.redirect(`${env.APP_URL}?auth=error`, 302);

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
    return Response.redirect(`${env.APP_URL}?auth=error`, 302);
  }

  const sid = crypto.randomUUID() + crypto.randomUUID();
  await env.SESSIONS.put(sid, JSON.stringify({ refresh_token: data.refresh_token }), {
    expirationTtl: SESSION_TTL,
  });
  return Response.redirect(`${env.APP_URL}?sid=${sid}`, 302);
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

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
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
