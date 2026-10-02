// Популярные иконки категорий — показываются первой группой пикера и доступны
// сразу, пока полный набор (emojiData.json) догружается.
export const EMOJI_PALETTE = [
  '🏷️', '🛒', '🍔', '☕', '🚕', '⛽', '🏠', '💡',
  '🎬', '🎮', '🎵', '📚', '💊', '🏋️', '👕', '✂️',
  '🎁', '✈️', '🎓', '🐾', '📱', '💻', '🔧', '🌐',
  '💼', '💰', '💳', '🏦', '📈', '🍺', '🧾', '❤️',
];

// Полный набор эмодзи: [{ name, icon, items: [[emoji, 'название|ключевые слова']] }].
// Лениво — отдельным чанком, чтобы не утяжелять основной бандл.
let dataPromise = null;
export function loadEmojiData() {
  if (!dataPromise) {
    dataPromise = import('./emojiData.json').then((m) => m.default).catch((e) => {
      dataPromise = null;
      throw e;
    });
  }
  return dataPromise;
}

const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').trim();
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

// Поиск по названиям и тегам (рус + англ). Все слова запроса должны встретиться;
// выше — совпадения с началом названия, затем с началом любого слова.
export function searchEmoji(groups, query, limit = 240) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const scored = [];
  for (const g of groups) {
    for (const [emoji, text] of g.items) {
      const hay = norm(text);
      if (!tokens.every((t) => hay.includes(t))) continue;
      const label = hay.slice(0, hay.indexOf('|'));
      const first = tokens[0];
      const score = label.startsWith(first) ? 0
        : (` ${hay.replace('|', ' ')}`).includes(` ${first}`) ? 1 : 2;
      scored.push({ emoji, label: text.slice(0, text.indexOf('|')), score, order: scored.length });
    }
  }
  scored.sort((a, b) => a.score - b.score || a.order - b.order);
  return scored.slice(0, limit);
}

// Эмодзи, вставленный прямо в поле поиска (с клавиатуры телефона) — тоже валидная иконка.
export function extractEmoji(query) {
  const s = query.trim();
  if (!s || !EMOJI_RE.test(s)) return null;
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)][0]?.segment
    : s;
  return seg && EMOJI_RE.test(seg) ? seg : null;
}
