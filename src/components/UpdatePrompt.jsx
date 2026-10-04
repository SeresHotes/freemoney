import { useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Как часто фоново спрашивать service worker, не появилась ли новая версия.
// Сам SW проверяет обновление только при навигации/перезагрузке, а установленное
// PWA может месяцами не перезагружаться — поэтому пингуем сеть сами.
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 час

// Сколько ждать активации нового SW после клика «Обновить», прежде чем
// перезагрузить страницу принудительно. Страховка на случай, когда события
// от SW не приходят (см. applyUpdate).
const RELOAD_FALLBACK_MS = 4000;

const SKIP_WAITING = { type: 'SKIP_WAITING' };

// Применяет ожидающее обновление и перезагружает страницу.
//
// Не используем updateServiceWorker() из vite-plugin-pwa: он перезагружает
// страницу только по событию `controlling` с флагом isUpdate, который
// workbox-window выставляет по наличию контролирующего SW в момент регистрации.
// Если страница загрузилась без контроллера (жёсткая перезагрузка, первый
// заход после сброса SW), флаг ложный — клик молча отправляет SKIP_WAITING,
// новый SW активируется, но перезагрузки не происходит; повторный клик уже
// не находит ожидающего воркера и тоже ничего не делает. Плюс сгенерированный
// SW не вызывает clientsClaim(), так что в этом случае не приходит даже
// controllerchange. Поэтому работаем с регистрацией напрямую и в любом
// исходе заканчиваем перезагрузкой.
export async function applyUpdate(registration) {
  let done = false;
  const reload = () => {
    if (done) return;
    done = true;
    window.location.reload();
  };

  const sw = navigator.serviceWorker;
  if (!sw) return reload();

  const reg = registration ?? (await sw.getRegistration().catch(() => null));
  if (!reg) return reload();

  // Новый SW взял страницу под контроль — самый обычный путь.
  sw.addEventListener('controllerchange', reload, { once: true });
  // Страховка: если ни одно событие не пришло, всё равно перезагружаемся —
  // пользователь явно попросил обновиться.
  setTimeout(reload, RELOAD_FALLBACK_MS);

  const activateWhenWaiting = (worker) => {
    // Страница без контроллера не получит controllerchange (нет clientsClaim),
    // поэтому дополнительно следим за состоянием самого воркера.
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') reload();
    });
    worker.postMessage(SKIP_WAITING);
  };

  if (reg.waiting) {
    activateWhenWaiting(reg.waiting);
    return;
  }

  // Между двумя деплоями: предыдущий ожидающий SW уже вытеснен, а новый ещё
  // устанавливается — дождёмся, пока он перейдёт в waiting.
  const installing = reg.installing;
  if (installing) {
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && reg.waiting) {
        activateWhenWaiting(reg.waiting);
      } else if (installing.state === 'redundant') {
        reload();
      }
    });
    return;
  }

  // Ждать нечего: новая версия уже активна (например, её активировала другая
  // вкладка) — просто перезагружаемся, чтобы её подхватить.
  reload();
}

// Кнопка «Обновить» на экране ошибки: баннер мог ещё не появиться (новую
// версию не успели скачать), поэтому сначала спрашиваем сервер, а потом
// применяем найденное. Нет новой версии — applyUpdate просто перезагрузит.
export async function checkAndApplyUpdate() {
  const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  if (reg) await reg.update().catch(() => {});
  return applyUpdate(reg);
}

// Баннер «Доступна новая версия». Появляется, когда service worker скачал
// новую сборку и ждёт активации. Обновление применяется только по клику —
// молча страницу не перезагружаем, чтобы не потерять несохранённый ввод.
export default function UpdatePrompt() {
  const registrationRef = useRef(null);
  const [updating, setUpdating] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      registrationRef.current = registration;
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
      // workbox-window считает любое обновление, найденное позже минуты после
      // регистрации, «внешним» и после первого такого перестаёт слушать
      // updatefound. Для долго открытого PWA это значит, что второй деплой
      // (например, после нажатия «Позже») баннер уже не покажет. Следим сами.
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          // Первую установку (ещё нет активного SW) не считаем обновлением.
          if (worker.state === 'installed' && registration.active) {
            setNeedRefresh(true);
          }
        });
      });
    },
  });

  if (!needRefresh) return null;

  const onUpdate = () => {
    if (updating) return;
    setUpdating(true);
    applyUpdate(registrationRef.current);
  };

  return (
    <div className="update-toast" role="alert">
      <span className="update-toast__text">Доступна новая версия</span>
      <div className="update-toast__actions">
        <button
          className="update-toast__btn update-toast__btn--primary"
          onClick={onUpdate}
          disabled={updating}
        >
          {updating ? 'Обновляем…' : 'Обновить'}
        </button>
        <button
          className="update-toast__btn"
          onClick={() => setNeedRefresh(false)}
          disabled={updating}
        >
          Позже
        </button>
      </div>
    </div>
  );
}
