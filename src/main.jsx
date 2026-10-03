import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// Документ не прокручивается (скроллится только .app__main), но iOS при
// открытии клавиатуры всё равно сдвигает его, чтобы показать поле ввода, и
// после закрытия иногда не возвращает — навбар остаётся висеть над низом
// экрана. Возвращаем документ в ноль, как только он «уехал».
// Пока поле в фокусе (клавиатура открыта), не мешаем iOS — сдвиг нужен.
function resetDocumentScroll() {
  const el = document.activeElement;
  if (el && (el.matches('input, textarea, select') || el.isContentEditable)) return;
  if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
}
document.addEventListener('focusout', () => setTimeout(resetDocumentScroll, 100));
window.visualViewport?.addEventListener('resize', resetDocumentScroll);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
