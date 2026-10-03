import { useCallback, useEffect, useState } from 'react';
import { getCachedLatest, getLatestRates } from '../api/rates';

// Текущие курсы для базовой валюты и конвертер суммы из любой валюты в базовую.
// Сохранённые курсы отдаются сразу (работает офлайн), свежие подтягиваются в
// фоне (раз в день). ratesDate — дата курсов (старее сегодняшней, если сети
// давно не было); failed — курсов нет совсем (ни сети, ни кэша).
export function useBaseRates(baseCurrency) {
  const [rates, setRates] = useState(() => getCachedLatest(baseCurrency)); // { date, map }
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRates(getCachedLatest(baseCurrency));
    setFailed(false);
    getLatestRates(baseCurrency).then((r) => {
      if (cancelled) return;
      if (r) setRates(r);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [baseCurrency]);

  const ratesMap = rates?.map;
  // Перевод суммы из валюты `cur` в базовую. null, если курс неизвестен.
  const toBase = useCallback(
    (amount, cur) => {
      if (!cur || cur === baseCurrency) return amount;
      const rate = ratesMap?.[cur.toLowerCase()];
      if (!rate) return null;
      return amount / rate;
    },
    [ratesMap, baseCurrency],
  );

  return { ready: !!ratesMap, failed, ratesDate: rates?.date ?? null, toBase };
}
