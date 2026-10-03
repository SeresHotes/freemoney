import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useBaseRates } from './useBaseRates';
import { walletBalance } from '../utils/finance';
import { dateLabel, todayIso } from '../utils/format';

// Общий баланс по активным кошелькам в базовой валюте (главная, «Кошельки»).
// ratesNote — пометка о курсах, только если есть кошельки не в базовой валюте:
// курсы старые («курсы от …») или для части валют курса нет вовсе.
// Возвращает и toBase — чтобы страница не заводила второй useBaseRates.
export function useNetWorth() {
  const { wallets, transactions, baseCurrency } = useApp();
  const { toBase, ready, failed, ratesDate } = useBaseRates(baseCurrency);

  const activeWallets = useMemo(() => wallets.filter((w) => !w.archived), [wallets]);

  const { sum, hasUnknown } = useMemo(() => {
    let total = 0;
    let unknown = false;
    for (const w of activeWallets) {
      const inBase = toBase(walletBalance(transactions, w.name), w.currency);
      if (inBase == null) unknown = true;
      else total += inBase;
    }
    return { sum: total, hasUnknown: unknown };
  }, [activeWallets, transactions, toBase]);

  const needsRates = activeWallets.some((w) => w.currency && w.currency !== baseCurrency);
  let ratesNote = null;
  if (needsRates) {
    if (hasUnknown) ratesNote = ready || failed ? 'без части валют: нет курса' : 'загружаю курсы…';
    else if (ratesDate && ratesDate < todayIso()) ratesNote = `курсы от ${dateLabel(ratesDate)}`;
  }

  return { sum, ratesNote, toBase };
}
