import { useRegisterSW } from 'virtual:pwa-register/react';

// Как часто фоново спрашивать service worker, не появилась ли новая версия.
// Сам SW проверяет обновление только при навигации/перезагрузке, а установленное
// PWA может месяцами не перезагружаться — поэтому пингуем сеть сами.
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 час

// Баннер «Доступна новая версия». Появляется, когда service worker скачал
// новую сборку и ждёт активации. Обновление применяется только по клику —
// молча страницу не перезагружаем, чтобы не потерять несохранённый ввод.
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      // Периодически проверяем наличие новой версии, но только когда онлайн.
      setInterval(() => {
        if (navigator.onLine) registration.update();
      }, UPDATE_CHECK_INTERVAL);
      // И сразу при возвращении в приложение (открыли вкладку/PWA заново).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          registration.update();
        }
      });
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="update-toast" role="alert">
      <span className="update-toast__text">Доступна новая версия</span>
      <div className="update-toast__actions">
        <button
          className="update-toast__btn update-toast__btn--primary"
          onClick={() => updateServiceWorker(true)}
        >
          Обновить
        </button>
        <button
          className="update-toast__btn"
          onClick={() => setNeedRefresh(false)}
        >
          Позже
        </button>
      </div>
    </div>
  );
}
