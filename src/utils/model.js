// Нормализация записей к актуальной модели данных. Все функции ИДЕМПОТЕНТНЫ:
// применение к уже-новой записи ничего не меняет, к старой — приводит к новой.
// Поэтому их безопасно звать на каждом чтении из любого бэкенда (миграция «на
// лету») и повторно — двойного применения бояться не нужно.
//
// Что меняется относительно старой схемы:
//   • Тип операции: transfer_in/out → transfer, adjust_in/out → adjust,
//     interest_in/out → interest; expense/income остаются. Направление теперь
//     живёт в ЗНАКЕ amount, а не в суффиксе типа.
//   • amount — знаковый: расход/перевод-из/списание < 0, доход/перевод-в > 0.
//   • Метки-контейнеры (кошелёк/категория/тег): строковый status active/archived
//     заменён булевым archived. deleted (tombstone) остаётся отдельным флагом.

// Укрупнённый тип без суффикса направления.
export function normalizeType(type) {
  return String(type || 'expense').replace(/_(in|out)$/, '');
}

// Знаковая величина операции по (возможно, старому) type+amount. Не аллоцирует —
// годится для горячих циклов расчёта баланса. Работает и на старых записях
// (положительный amount + суффикс/expense), и на новых (знаковый amount).
export function signedAmount(type, amount) {
  const raw = String(type || '');
  const num = Number(amount) || 0;
  if (raw.endsWith('_out') || raw === 'expense') return -Math.abs(num);
  if (raw.endsWith('_in') || raw === 'income') return Math.abs(num);
  return num; // объединённые типы (transfer/adjust/interest) — amount уже знаковый
}

// Привести операцию к новой модели: слитый тип + знаковый amount.
export function normalizeTx(t) {
  return { ...t, type: normalizeType(t.type), amount: signedAmount(t.type, t.amount) };
}

// Флаг «в архиве»: новый булев archived, либо старый status === 'archived'.
export function isArchived(rec) {
  if (typeof rec.archived === 'boolean') return rec.archived;
  return rec.status === 'archived';
}

// Привести метку-контейнер к новой модели: булев archived вместо строки status.
export function normalizeArchivable(rec) {
  const { status, ...rest } = rec;
  return { ...rest, archived: isArchived(rec) };
}
