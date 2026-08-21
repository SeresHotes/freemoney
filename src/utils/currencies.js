// Набор валют для выбора. code — ISO 4217, symbol — для отображения.
export const CURRENCIES = [
  { code: 'RUB', symbol: '₽', name: 'Рубль' },
  { code: 'USD', symbol: '$', name: 'Доллар США' },
  { code: 'EUR', symbol: '€', name: 'Евро' },
  { code: 'AMD', symbol: '֏', name: 'Армянский драм' },
  { code: 'GEL', symbol: '₾', name: 'Грузинский лари' },
  { code: 'KZT', symbol: '₸', name: 'Тенге' },
  { code: 'TRY', symbol: '₺', name: 'Турецкая лира' },
  { code: 'GBP', symbol: '£', name: 'Фунт стерлингов' },
  { code: 'AED', symbol: 'د.إ', name: 'Дирхам ОАЭ' },
  { code: 'RSD', symbol: 'дин.', name: 'Сербский динар' },
  { code: 'UAH', symbol: '₴', name: 'Гривна' },
  { code: 'CNY', symbol: '¥', name: 'Юань' },
  { code: 'THB', symbol: '฿', name: 'Тайский бат' },
];

const byCode = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

export function currencySymbol(code) {
  return byCode[code]?.symbol || code;
}

export function formatAmount(amount, code) {
  const value = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(
    Math.round((amount || 0) * 100) / 100,
  );
  return `${value} ${currencySymbol(code)}`;
}
