// Экран загрузки, пока поднимается локальное хранилище. Выбор способа хранения
// больше не нужен: данные всегда локальные, а синхронизация с Google —
// необязательная опция в Настройках.

export function LoadingScreen() {
  return (
    <div className="gate">
      <div className="gate__box">
        <div className="spinner" />
        <p className="muted">Загрузка…</p>
      </div>
    </div>
  );
}
