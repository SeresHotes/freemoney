import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base — путь, по которому приложение публикуется на GitHub Pages.
// Для https://<user>.github.io/freemoney/ это '/freemoney/'.
// Если имя репозитория другое — задайте переменную BASE_PATH при сборке
// или поправьте значение по умолчанию ниже.
const base = process.env.BASE_PATH || '/freemoney/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'FreeMoney — учёт денег',
        short_name: 'FreeMoney',
        description: 'Учёт доходов и расходов с хранением в Google Таблицах',
        theme_color: '#0f172a',
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
