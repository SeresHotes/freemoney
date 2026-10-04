// Иконки 'lucide:<имя>' — короткое время (dev-канал) категории хранили аутлайн-
// иконки Lucide. Теперь иконка снова эмодзи (рисуется стилем, см. emojiArt.js):
// такие значения переводятся в ближайший эмодзи, неизвестные — в метку.
const LUCIDE_TO_EMOJI = {
  tag: '🏷️', 'shopping-cart': '🛒', 'shopping-basket': '🧺', hamburger: '🍔', utensils: '🍴',
  coffee: '☕', pizza: '🍕', beer: '🍺', 'car-taxi-front': '🚕', car: '🚗', bus: '🚌', fuel: '⛽',
  house: '🏠', lightbulb: '💡', zap: '⚡', droplet: '💧', clapperboard: '🎬', 'gamepad-2': '🎮',
  music: '🎵', 'book-open': '📚', pill: '💊', stethoscope: '🩺', dumbbell: '🏋️', shirt: '👕',
  scissors: '✂️', gift: '🎁', plane: '✈️', 'graduation-cap': '🎓', 'paw-print': '🐾', baby: '👶',
  smartphone: '📱', laptop: '💻', wifi: '📶', wrench: '🔧', globe: '🌐', briefcase: '💼',
  'hand-coins': '💰', wallet: '👛', 'credit-card': '💳', landmark: '🏦', 'piggy-bank': '🐷',
  'trending-up': '📈', receipt: '🧾', heart: '❤️',
};
const LUCIDE = 'lucide:';

// Иконка категории в актуальном формате (эмодзи); остальное — как есть.
export function migrateIcon(icon) {
  if (typeof icon !== 'string' || !icon.startsWith(LUCIDE)) return icon;
  return LUCIDE_TO_EMOJI[icon.slice(LUCIDE.length)] || '🏷️';
}
