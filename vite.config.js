import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Версия приложения для показа в интерфейсе и отладки.
// Приоритет: явная VITE_APP_VERSION (можно задать в CI) → git describe
// (тег вида v1.2.3, иначе короткий SHA коммита) → 'dev' как fallback.
function getAppVersion() {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION;
  try {
    return execSync('git describe --tags --always --dirty', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

const appVersion = getAppVersion();

// base — путь, по которому приложение публикуется на GitHub Pages.
// Для https://<user>.github.io/freemoney/ это '/freemoney/'.
// Если имя репозитория другое — задайте переменную BASE_PATH при сборке
// или поправьте значение по умолчанию ниже.
const base = process.env.BASE_PATH || '/freemoney/';

// Канал сборки: 'prod' (по умолчанию) или 'dev'. Задаётся в CI (VITE_CHANNEL).
// Для dev меняем имя и тему PWA, чтобы иконка на телефоне отличалась от prod,
// а отдельный base (/…/dev/) даёт свой scope установленного приложения.
const channel = process.env.VITE_CHANNEL || 'prod';
const isDev = channel === 'dev';

// «канал · версия» в inline-скрипте index.html — экран ошибки, когда бандл не
// загрузился (в React-части то же берётся из config.js).
const buildLabelHtml = {
  name: 'build-label-html',
  transformIndexHtml: (html) => html.replace('%BUILD_LABEL%', `FreeMoney ${channel} · ${appVersion}`),
};

export default defineConfig({
  base,
  // Версия доступна в коде как глобальная константа __APP_VERSION__.
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  // Рисовки иконок (src/utils/emojiArt, ~7 МБ на все стили) — в отдельную папку:
  // service worker их не предкэширует, а кэширует по мере загрузки (см. workbox).
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: (chunk) => (chunk.facadeModuleId?.includes('/emojiArt/')
          ? 'assets/emoji-art/[name]-[hash].js'
          : 'assets/[name]-[hash].js'),
      },
    },
  },
  plugins: [
    react(),
    buildLabelHtml,
    VitePWA({
      // 'prompt' — не обновляемся молча: показываем пользователю баннер
      // «Доступна новая версия», обновление применяется по клику
      // (см. src/components/UpdatePrompt.jsx). Так не теряется несохранённый ввод.
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: isDev ? 'FreeMoney dev' : 'FreeMoney — учёт денег',
        short_name: isDev ? 'FM dev' : 'FreeMoney',
        description: 'Учёт доходов и расходов с хранением в Google Таблицах',
        lang: 'ru',
        theme_color: isDev ? '#7c2d12' : '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Скриншоты для «богатого» диалога установки Chrome.
        // wide → desktop, narrow (form_factor не задан «wide») → mobile.
        // Генерируются скриптом scripts/gen-screenshots.mjs (npm run screenshots).
        screenshots: [
          {
            src: 'screenshot-wide.png',
            sizes: '1600x900',
            type: 'image/png',
            form_factor: 'wide',
            label: 'FreeMoney на компьютере',
          },
          {
            src: 'screenshot-mobile.png',
            sizes: '1080x1920',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'FreeMoney на телефоне',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Рисовки иконок грузятся по группам только для выбранного стиля —
        // предкэшировать все стили (~7 МБ) незачем.
        globIgnores: ['**/emoji-art/**'],
        // Запросы к Google API никогда не кэшируем — всегда идём в сеть.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://sheets.googleapis.com' ||
              url.origin === 'https://www.googleapis.com' ||
              url.origin === 'https://accounts.google.com',
            handler: 'NetworkOnly',
          },
          {
            // Файлы с хэшем в имени не меняются — раз загруженные берём из кэша (и офлайн).
            urlPattern: ({ url }) => url.pathname.includes('/assets/emoji-art/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'emoji-art',
              expiration: { maxEntries: 60 },
            },
          },
        ],
      },
    }),
  ],
});
