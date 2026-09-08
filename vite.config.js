import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: isDev ? 'FreeMoney dev' : 'FreeMoney — учёт денег',
        short_name: isDev ? 'FM dev' : 'FreeMoney',
        description: 'Учёт доходов и расходов с хранением в Google Таблицах',
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
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Запросы к Google API никогда не кэшируем — всегда идём в сеть.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://sheets.googleapis.com' ||
              url.origin === 'https://www.googleapis.com' ||
              url.origin === 'https://accounts.google.com',
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
});
