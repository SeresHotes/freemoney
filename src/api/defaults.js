// Общие значения по умолчанию, разделяемые всеми бэкендами хранилища.

// Иконки — аутлайн Lucide ('lucide:<имя>', см. utils/icons.js); эмодзи тоже допустимы.
export const DEFAULT_ICON = 'lucide:tag';

export const DEFAULT_CATEGORIES = [
  { name: 'Зарплата', kind: 'income', icon: 'lucide:briefcase' },
  { name: 'Прочий доход', kind: 'income', icon: 'lucide:hand-coins' },
  { name: 'Продукты', kind: 'expense', icon: 'lucide:shopping-cart' },
  { name: 'Кафе и рестораны', kind: 'expense', icon: 'lucide:hamburger' },
  { name: 'Транспорт', kind: 'expense', icon: 'lucide:car-taxi-front' },
  { name: 'Жильё', kind: 'expense', icon: 'lucide:house' },
  { name: 'Развлечения', kind: 'expense', icon: 'lucide:clapperboard' },
  { name: 'Здоровье', kind: 'expense', icon: 'lucide:pill' },
  { name: 'Одежда', kind: 'expense', icon: 'lucide:shirt' },
  { name: 'Прочее', kind: 'both', icon: 'lucide:tag' },
];
