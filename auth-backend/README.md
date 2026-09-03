# FreeMoney — мини-бэкенд авторизации (Cloudflare Worker)

Держит refresh-токен Google на сервере и выдаёт приложению свежий access-токен,
чтобы не входить каждый час. Данные (операции) через воркер не проходят — их
приложение пишет в Google Sheets напрямую.

## Что понадобится
- Бесплатный аккаунт **Cloudflare**.
- **Client secret** OAuth-клиента из Google Cloud Console
  (APIs & Services → Credentials → твой OAuth Web client → «Client secret»).

## Развёртывание (один раз)

Все команды — из папки `auth-backend/`.

1. Войти в Cloudflare:
   ```
   npx wrangler login
   ```

2. Создать хранилище сессий и вписать его id в `wrangler.toml` (поле `id`):
   ```
   npx wrangler kv namespace create SESSIONS
   ```
   Скопируй выданный `id` в `wrangler.toml` → `[[kv_namespaces]] id = "..."`.

3. Положить client secret (в репозиторий он не попадёт):
   ```
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
   (вставь секрет из Google Cloud).

4. Задеплоить:
   ```
   npx wrangler deploy
   ```
   Запомни адрес воркера, например: `https://freemoney-auth.ВАШ-СУБДОМЕН.workers.dev`

## Настройка Google Cloud (один раз)

APIs & Services → Credentials → твой **OAuth 2.0 Web client** →
**Authorized redirect URIs** → добавить:
```
https://freemoney-auth.ВАШ-СУБДОМЕН.workers.dev/auth/callback
```
Сохранить. (OAuth-экран остаётся в режиме **Testing**, ты уже в тест-пользователях.)

## Подключение приложения

GitHub → репозиторий → **Settings → Secrets and variables → Actions → Variables**
→ **New repository variable**:
```
Name:  VITE_AUTH_BACKEND_URL
Value: https://freemoney-auth.ВАШ-СУБДОМЕН.workers.dev
```
Затем перезапустить деплой Pages (любой push в `main` или вручную через Actions).

После этого приложение при входе будет ходить в бэкенд. Вход в режиме Testing
держится **7 дней** (refresh-токен Google), потом один клик — и снова на неделю.

## Локальная проверка воркера (необязательно)
```
npx wrangler dev
```
