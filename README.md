# 💰 FreeMoney

PWA-приложение для учёта доходов и расходов. Данные хранятся в **вашей личной
Google Таблице** — своего бэкенда у приложения нет, оно целиком статическое и
публикуется на GitHub Pages.

## Возможности

- Вход через Google (OAuth в браузере, без сервера).
- При первом входе — создание Google Таблицы автоматически (или подключение
  существующей по ссылке).
- Учёт **расходов** и **доходов** по категориям, с заметками и датой.
- Категории трёх типов: только расход, только доход или оба; базовый набор
  создаётся сразу, можно добавлять свои.
- **Удаление категории = архивирование**: старые операции не ломаются, а из
  списков выбора категория пропадает. Архив можно посмотреть и восстановить.
- Страница статистики: баланс за месяц, разбивка расходов по категориям
  (круговая диаграмма) и динамика доход/расход по месяцам.
- Работает как устанавливаемое приложение (PWA): офлайн-оболочка, иконка на
  экране, полноэкранный режим.

## Как устроены данные

Приложение создаёт одну таблицу с двумя листами:

| Лист           | Колонки                                   |
| -------------- | ----------------------------------------- |
| `Transactions` | `id`, `date`, `type`, `amount`, `category`, `note` |
| `Categories`   | `name`, `kind`, `status`                   |

- `type` — `expense` или `income`
- `kind` — `expense`, `income` или `both`
- `status` — `active` или `archived`

Таблица обычная — её можно открыть в Google Sheets и править руками.

---

## Настройка Google OAuth (обязательно)

Без Client ID приложение не сможет авторизоваться. Делается один раз.

1. Откройте [Google Cloud Console](https://console.cloud.google.com/) и создайте
   проект (или выберите существующий).
2. **APIs & Services → Library** → включите:
   - **Google Sheets API**
   - **Google Drive API**
3. **APIs & Services → OAuth consent screen**:
   - Тип **External**, заполните название и e-mail.
   - Пока приложение в статусе *Testing*, добавьте свой Google-аккаунт в
     **Test users** (иначе вход не пройдёт).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Тип приложения — **Web application**.
   - **Authorized JavaScript origins** добавьте адреса, откуда открывается
     приложение:
     - `http://localhost:5173` — для локальной разработки
     - `https://<ваш-логин>.github.io` — для GitHub Pages
   - Redirect URI для token flow не нужен.
5. Скопируйте **Client ID** вида `xxxx.apps.googleusercontent.com`.

### Куда вписать Client ID

- **Локально:** скопируйте `.env.example` в `.env` и подставьте значение:
  ```
  VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
  ```
- **Для GitHub Pages:** в репозитории **Settings → Secrets and variables →
  Actions → New repository secret** создайте секрет с именем
  `VITE_GOOGLE_CLIENT_ID` и тем же значением. Сборка подхватит его автоматически.

> Client ID для web-приложения не является секретом в строгом смысле, но хранить
> его в секрете репозитория удобно и правильно.

---

## Локальный запуск

```bash
npm install
npm run dev
```

Откройте `http://localhost:5173`. Убедитесь, что `http://localhost:5173` добавлен
в Authorized JavaScript origins (шаг 4 выше).

## Публикация на GitHub Pages

1. Создайте репозиторий на GitHub и запушьте код в ветку `main`.
2. **Settings → Pages → Build and deployment → Source** выберите
   **GitHub Actions**.
3. Добавьте секрет `VITE_GOOGLE_CLIENT_ID` (см. выше).
4. Любой push в `main` запускает workflow `.github/workflows/deploy.yml`, который
   собирает и публикует приложение.

Приложение будет доступно по адресу
`https://<ваш-логин>.github.io/<имя-репозитория>/`.

> **Важно:** `base` в `vite.config.js` и `BASE_PATH` в workflow вычисляются из
> имени репозитория автоматически. Если публикуете под кастомным доменом или в
> корне (`<логин>.github.io`), задайте `BASE_PATH=/` при сборке.

---

## Стек

- **React + Vite** — фронтенд и сборка
- **react-router-dom** (HashRouter — работает на статике GitHub Pages без
  серверных редиректов)
- **recharts** — графики (грузится отдельным чанком только на странице
  статистики)
- **vite-plugin-pwa** — манифест и service worker
- **Google Sheets API + Drive API** — хранилище (scope `drive.file`, доступ
  только к файлам, созданным приложением)

## Структура проекта

```
src/
  auth/googleAuth.js     — OAuth через Google Identity Services
  api/sheets.js          — низкоуровневые вызовы Sheets/Drive REST API
  api/store.js           — модель данных (транзакции, категории)
  context/AppContext.jsx — состояние приложения и действия
  pages/                 — экраны (Home, AddTransaction, Categories, Stats, Gate)
  components/NavBar.jsx   — нижняя навигация
  utils/format.js        — форматирование денег и дат
  config.js              — Client ID, scope, константы
```

## Обновление иконок

Иконки генерируются из `public/icon.svg`:

```bash
npm run icons
```
