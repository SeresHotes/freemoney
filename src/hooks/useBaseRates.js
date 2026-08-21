import { useCallback, useEffect, useState } from 'react';
import { getRatesMap } from '../api/rates';

// Загружает текущие курсы для базовой валюты (кэш — раз в день) и даёт
// конвертер суммы из любой валюты в базовую.
export function useBaseRates(baseCurrency) {
  const [ratesMap, setRatesMap] = useState(null); // { код(нижн.): сколько за 1 базовую }
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRatesMap(null);
    setFailed(false);
    getRatesMap(baseCurrency, 'latest').then((map) => {
      if (cancelled) return;
      if (map) setRatesMap(map);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [baseCurrency]);

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

  return { ready: !!ratesMap, failed, toBase };
}
