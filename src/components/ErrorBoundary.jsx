import { Component } from 'react';
import { BUILD_LABEL } from '../config';

// Если приложение упало при отрисовке — вместо пустого экрана показываем
// ошибку (по ней можно понять причину) и способы восстановиться. Данные не
// трогаются: «Сбросить кэш» удаляет только service worker и кэш файлов.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('FreeMoney упал:', error, info?.componentStack);
  }

  resetCache = async () => {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = (await window.caches?.keys?.()) || [];
      await Promise.all(keys.map((k) => caches.delete(k)));
    } finally {
      window.location.reload();
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash">
        <h1>Что-то сломалось</h1>
        <p className="muted">Ваши данные не тронуты. Пришлите, пожалуйста, текст ниже разработчику.</p>
        <pre className="crash__text">{`${error?.name || 'Error'}: ${error?.message || error}\n${(error?.stack || '').split('\n').slice(1, 6).join('\n')}\n${BUILD_LABEL}\n${navigator.userAgent}`}</pre>
        <div className="crash__actions">
          <button className="btn btn--primary" onClick={() => window.location.reload()}>Перезагрузить</button>
          <button className="btn" onClick={this.resetCache}>Сбросить кэш приложения</button>
        </div>
      </div>
    );
  }
}
