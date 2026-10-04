import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import UpdatePrompt from './components/UpdatePrompt';
import './index.css';

// Документ не прокручивается (скроллится только .app__main), но при открытии
// клавиатуры браузер сдвигает его, чтобы показать поле ввода: iOS — всегда,
// Android Chrome — по умолчанию (resizes-visual). Вернуть такой сдвиг жестом
// нельзя (у html/body overflow: hidden) — верх формы уезжает за край экрана и
// не прокручивается, пока поле в фокусе. Особенно заметно на формах, где поле
// с autoFocus стоит ниже середины экрана (долг, проценты, перевод).
//
// Поэтому с открытой клавиатурой приложение подгоняем под видимую область
// (visualViewport): .app становится ниже, навбар прячется, поле в фокусе
// докручивается внутри .app__main, а сдвиг документа сразу сбрасываем в ноль.
const root = document.documentElement;
// Высота layout viewport (clientHeight) от клавиатуры не меняется — в отличие
// от visualViewport; меньшая разница — это панели браузера, не клавиатура.
const KEYBOARD_MIN = 120; // px

function isTextField(el) {
  return Boolean(el && (el.matches('input, textarea, select') || el.isContentEditable));
}

let keyboardWasOpen = false;
function syncViewport() {
  const vv = window.visualViewport;
  const keyboard = Boolean(vv) && isTextField(document.activeElement)
    && root.clientHeight - vv.height > KEYBOARD_MIN;
  if (keyboard) root.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
  else root.style.removeProperty('--app-h');
  root.classList.toggle('kb-open', keyboard);
  if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
  // Клавиатура только что открылась — после смены высоты показать поле.
  if (keyboard && !keyboardWasOpen) {
    requestAnimationFrame(() => document.activeElement?.scrollIntoView?.({ block: 'nearest' }));
  }
  keyboardWasOpen = keyboard;
}
document.addEventListener('focusin', () => setTimeout(syncViewport, 50));
document.addEventListener('focusout', () => setTimeout(syncViewport, 100));
window.visualViewport?.addEventListener('resize', syncViewport);
window.visualViewport?.addEventListener('scroll', syncViewport);
window.addEventListener('scroll', syncViewport);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    {/* Вне ErrorBoundary: баннер «Обновить» должен остаться, даже если
        приложение упало, — иначе починку не поставить. */}
    <UpdatePrompt />
  </StrictMode>,
);
