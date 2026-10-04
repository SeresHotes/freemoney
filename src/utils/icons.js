// Иконки категорий: аутлайн-иконки Lucide ('lucide:<имя>') или эмодзи (как раньше).
// Контуры популярных иконок — в основном бандле (lucidePopular.json), полный
// набор (lucideData.json) догружается лениво: в пикере или когда категории
// назначена непопулярная иконка. Генератор — scripts/gen-lucide.mjs.
import popular from './lucidePopular.json';

export const LUCIDE = 'lucide:';
export const isLucide = (icon) => typeof icon === 'string' && icon.startsWith(LUCIDE);
export const lucide = (name) => `${LUCIDE}${name}`;

// Популярные иконки — первая группа пикера.
export const LUCIDE_PALETTE = popular.order.map(lucide);

const svgCache = new Map(Object.entries(popular.svg));
let dataPromise = null;
// Полный набор — группы: [{ name, icon, items: [['lucide:имя', 'название|слова']] }].
export function loadLucideData() {
  if (!dataPromise) {
    dataPromise = import('./lucideData.json').then((m) => {
      const d = m.default;
      for (const [name, svg] of Object.entries(d.svg)) svgCache.set(name, svg);
      return d.groups.map((g) => ({
        name: g.name,
        icon: lucide(g.icon),
        items: g.items.map(([name, text]) => [lucide(name), text]),
      }));
    }).catch((e) => {
      dataPromise = null;
      throw e;
    });
  }
  return dataPromise;
}

// Внутренность <svg> иконки или null, если её контур ещё не загружен.
export const lucideSvg = (icon) => svgCache.get(icon.slice(LUCIDE.length)) ?? null;

// Эмодзи прежней палитры → аналог из Lucide (разовая замена у существующих категорий).
export const EMOJI_TO_LUCIDE = {
  '🏷️': 'tag', '🛒': 'shopping-cart', '🍔': 'hamburger', '☕': 'coffee', '🚕': 'car-taxi-front',
  '⛽': 'fuel', '🏠': 'house', '💡': 'lightbulb', '🎬': 'clapperboard', '🎮': 'gamepad-2',
  '🎵': 'music', '📚': 'book-open', '💊': 'pill', '🏋️': 'dumbbell', '👕': 'shirt', '✂️': 'scissors',
  '🎁': 'gift', '✈️': 'plane', '🎓': 'graduation-cap', '🐾': 'paw-print', '📱': 'smartphone',
  '💻': 'laptop', '🔧': 'wrench', '🌐': 'globe', '💼': 'briefcase', '💰': 'hand-coins',
  '💳': 'credit-card', '🏦': 'landmark', '📈': 'trending-up', '🍺': 'beer', '🧾': 'receipt', '❤️': 'heart',
};
// Иконка для категории: эмодзи прежней палитры → Lucide, остальное — как есть.
export const migrateIcon = (icon) => (EMOJI_TO_LUCIDE[icon] ? lucide(EMOJI_TO_LUCIDE[icon]) : icon);
