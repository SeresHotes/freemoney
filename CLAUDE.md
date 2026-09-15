# FreeMoney — память проекта

Договорённости и контекст, которые не выводятся из кода. Дополняй файл, когда узнаёшь что-то важное про проект.

## Рабочий процесс

- **Всегда доводи задачу до открытого PR** — это дефолтный финал любой задачи с изменениями кода, спрашивать «нужен ли PR» не надо.
- **НЕ мержить в `main` самостоятельно.** Открыл(а) PR (не draft) и остановился(ась) — решение о мерже принимает пользователь. Не вызывай `gh pr merge` без явного разрешения в текущем диалоге; разрешение из одной задачи не переносится на следующие.

## Каналы и деплой

Два канала живут на **разных поддоменах** (у каждого свой origin — свой service worker и своё хранилище):

- **prod** — `https://freemoney.sereshotes.dev` — GitHub Pages (ветка `gh-pages`, кастомный домен через CNAME). Сборка: base `/`, `VITE_CHANNEL=prod`.
- **dev** — `https://dev.freemoney.sereshotes.dev` — Cloudflare Pages (проект `freemoney-dev`, тех.URL `freemoney-dev.pages.dev`). Сборка: base `/`, `VITE_CHANNEL=dev`.

`config.js` держит абсолютные URL каналов (`OTHER_CHANNEL_URL`) для переключателя.

**Почему НЕ на одном домене** (важно, не воскрешать): раньше dev был подкаталогом `/dev/` того же домена — prod service worker (scope `/`) перехватывал `/dev/`-навигацию и отдавал prod-оболочку, плюс на кастомном домене не совпадали base-пути. Разные origin решают это радикально.

## Авто-интеграция dev-канала

Воркфлоу `.github/workflows/integration-dev.yml` на любое событие `pull_request` (opened/synchronize/reopened/closed): берёт свежий `main` → вмерживает head-ветки всех открытых PR (конфликтные пропускает, пишет в job summary) → force-push в ветку `dev` → билд `VITE_CHANNEL=dev` → `wrangler pages deploy`.

Итог: `dev` = `main` + все незакрытые PR; закрытый PR сам выпадает. Ветка `dev` авто-управляемая (перезаписывается force-push) — **ручные пуши в неё затираются**.

- Деплой встроен в тот же прогон; требует секрет `CLOUDFLARE_API_TOKEN` (Pages:Edit).
- Если dev-деплой падает с «necessary to set a CLOUDFLARE_API_TOKEN» — токен протух, пересоздать и `gh secret set`.

## auth-backend

`auth.sereshotes.dev` (Cloudflare Worker) держит `ALLOWED_ORIGIN` со списком доменов. При новом origin — дополнять список и `wrangler deploy`. Прод-деплой воркера и правку DNS делает пользователь (OAuth wrangler под sereshotes@gmail.com для этого не годится).
