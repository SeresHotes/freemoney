// Миграция операций из старого «монефи»-подобного формата в каноничную модель.
//
// Старый формат (укрупнённые типы + суммы со знаком):
//   expense  — сумма со знаком «−»
//   income   — сумма со знаком «+»
//   transfer — сумма со знаком, две ноги без transferId
//   adjust   — сумма со знаком
// Каноничная модель (её ждут signedDelta и экран «Операции»):
//   expense/income          — сумма всегда ≥ 0, знак берётся из типа
//   transfer_out/transfer_in — сумма ≥ 0, парные ноги связаны transferId
//   adjust_out/adjust_in     — сумма ≥ 0
//
// Функция идемпотентна: операции уже в новой модели проходят без изменений.

// Стабильный синтетический transferId для легаси-ноги перевода: одинаков для
// обеих ног пары и не меняется между загрузками (чтобы не плодить дубли).
function legacyTransferId(t, index) {
  const time = String(t.time || '000000').replace(/\D/g, '');
  return `legacy-${t.date}-${time}-${index}`;
}

// Разбивает легаси-переводы на пары «ушло/пришло» в пределах одного момента
// (дата + время) и назначает каждой паре общий transferId. Возвращает карту
// id операции → назначенный transferId.
function pairLegacyTransfers(txs) {
  const groups = new Map();
  for (const t of txs) {
    if (t.type !== 'transfer') continue;
    const key = `${t.date} ${t.time || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const transferIdById = new Map();
  for (const legs of groups.values()) {
    const outs = legs.filter((t) => (Number(t.amount) || 0) < 0);
    const ins = legs.filter((t) => (Number(t.amount) || 0) >= 0);
    const pairs = Math.max(outs.length, ins.length);
    for (let i = 0; i < pairs; i += 1) {
      const anchor = outs[i] || ins[i];
      const id = anchor.transferId || legacyTransferId(anchor, i);
      if (outs[i]) transferIdById.set(outs[i].id, outs[i].transferId || id);
      if (ins[i]) transferIdById.set(ins[i].id, ins[i].transferId || id);
    }
  }
  return transferIdById;
}

export function normalizeLegacyTransactions(txs) {
  if (!Array.isArray(txs)) return txs;
  const transferIdById = pairLegacyTransfers(txs);

  return txs.map((t) => {
    const amount = Number(t.amount) || 0;
    switch (t.type) {
      case 'transfer':
        return {
          ...t,
          type: amount < 0 ? 'transfer_out' : 'transfer_in',
          amount: Math.abs(amount),
          transferId: transferIdById.get(t.id) || t.transferId || '',
        };
      case 'adjust':
        return { ...t, type: amount < 0 ? 'adjust_out' : 'adjust_in', amount: Math.abs(amount) };
      case 'expense':
      case 'income':
        // Знак теперь несёт тип; приводим сумму к модулю (идемпотентно).
        return { ...t, amount: Math.abs(amount) };
      default:
        // transfer_in/out, adjust_in/out, interest_* — уже каноничны.
        return t;
    }
  });
}
