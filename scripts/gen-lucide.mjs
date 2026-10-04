// Генерация набора аутлайн-иконок Lucide для выбора иконки категории.
// Источник — lucide-static (devDependency): контуры иконок и английские теги.
// Группы иконок — из scripts/lucide-categories.json (снимок папки icons/ репозитория
// lucide: имя → категории; в npm-пакет категории не входят). Обновить снимок:
//   node scripts/gen-lucide.mjs --categories <путь к клону lucide-icons/lucide>
// Русские слова для поиска — словарь RU ниже (плюс название группы у каждой иконки).
// Результат:
//   src/utils/lucideData.json    — полный набор, грузится лениво (отдельный чанк);
//   src/utils/lucidePopular.json — популярные (POPULAR), в основном бандле, чтобы
//                                  базовые категории рисовались без догрузки.
// Запуск: npm run lucide
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catFile = join(root, 'scripts', 'lucide-categories.json');

const argIdx = process.argv.indexOf('--categories');
if (argIdx > 0) {
  const repo = process.argv[argIdx + 1];
  const dir = join(repo, 'icons');
  const out = {};
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (j.categories?.length) out[f.slice(0, -5)] = j.categories;
  }
  writeFileSync(catFile, JSON.stringify(out));
  console.log(`✓ категории: ${Object.keys(out).length} иконок`);
}

const pkg = (p) => JSON.parse(readFileSync(join(root, 'node_modules', 'lucide-static', p), 'utf8'));
const nodes = pkg('icon-nodes.json');
const tags = pkg('tags.json');
const categories = JSON.parse(readFileSync(catFile, 'utf8'));

// Вкладки пикера: русское название, иконка вкладки и категории Lucide. Иконка
// попадает в первую подходящую группу. Чисто интерфейсные категории (стрелки,
// курсоры, разметка, текст, разработка, навигация) в выбор не берём.
const GROUPS = [
  { name: 'Покупки', icon: 'shopping-cart', cats: ['shopping'] },
  { name: 'Еда', icon: 'utensils', cats: ['food-beverage'] },
  { name: 'Транспорт', icon: 'car', cats: ['transportation'] },
  { name: 'Путешествия', icon: 'plane', cats: ['travel'] },
  { name: 'Дом', icon: 'house', cats: ['home', 'buildings'] },
  { name: 'Финансы', icon: 'piggy-bank', cats: ['finance', 'charts'] },
  { name: 'Здоровье', icon: 'stethoscope', cats: ['medical'] },
  { name: 'Люди', icon: 'users', cats: ['people', 'account', 'emoji'] },
  { name: 'Природа', icon: 'leaf', cats: ['animals', 'nature', 'seasons', 'weather', 'sustainability'] },
  { name: 'Досуг', icon: 'gamepad-2', cats: ['sports', 'gaming'] },
  { name: 'Медиа', icon: 'music', cats: ['multimedia', 'photography'] },
  { name: 'Техника', icon: 'smartphone', cats: ['devices', 'connectivity'] },
  { name: 'Связь', icon: 'message-circle', cats: ['communication', 'mail', 'social', 'notifications'] },
  { name: 'Инструменты', icon: 'wrench', cats: ['tools', 'science', 'security'] },
  { name: 'Разное', icon: 'shapes', cats: ['files', 'time', 'design', 'math', 'shapes'] },
];

// Популярные — первая группа пикера и иконки базовых категорий / миграции эмодзи.
const POPULAR = [
  'tag', 'shopping-cart', 'shopping-basket', 'hamburger', 'utensils', 'coffee', 'pizza', 'beer',
  'car-taxi-front', 'car', 'bus', 'fuel', 'house', 'lightbulb', 'zap', 'droplet',
  'clapperboard', 'gamepad-2', 'music', 'book-open', 'pill', 'stethoscope', 'dumbbell', 'shirt',
  'scissors', 'gift', 'plane', 'graduation-cap', 'paw-print', 'baby', 'smartphone', 'laptop',
  'wifi', 'wrench', 'globe', 'briefcase', 'hand-coins', 'wallet', 'credit-card', 'landmark',
  'piggy-bank', 'trending-up', 'receipt', 'heart',
];
// Иконки служебных строк (операции без категории, «Другое» на кольце) — тоже в основной бандл.
const EXTRA = ['package', 'scale', 'handshake', 'arrow-left-right'];

// Русские слова для поиска (имя иконки → слова через пробел).
const RU = {
  tag: 'метка ярлык ценник прочее', 'shopping-cart': 'корзина продукты покупки магазин супермаркет',
  'shopping-basket': 'корзинка продукты покупки', 'shopping-bag': 'пакет сумка покупки шопинг',
  store: 'магазин лавка', hamburger: 'бургер фастфуд кафе еда', utensils: 'еда ресторан кафе обед столовая вилка нож',
  'utensils-crossed': 'еда ресторан кафе', coffee: 'кофе чай кофейня напиток', pizza: 'пицца еда доставка',
  beer: 'пиво бар алкоголь', wine: 'вино бар алкоголь', martini: 'коктейль бар алкоголь',
  cake: 'торт день рождения сладкое', 'cake-slice': 'торт пирожное сладкое', candy: 'конфета сладкое',
  'ice-cream-cone': 'мороженое сладкое', apple: 'яблоко фрукты продукты', carrot: 'морковь овощи продукты',
  croissant: 'круассан выпечка хлеб', sandwich: 'бутерброд сэндвич перекус', soup: 'суп обед еда',
  salad: 'салат еда', egg: 'яйцо продукты', milk: 'молоко продукты', fish: 'рыба', beef: 'мясо',
  drumstick: 'курица мясо', cookie: 'печенье сладкое', 'cup-soda': 'газировка напиток',
  'car-taxi-front': 'такси транспорт поездка', car: 'машина автомобиль авто транспорт',
  'car-front': 'машина автомобиль авто', bus: 'автобус транспорт проезд', 'train-front': 'поезд электричка метро транспорт',
  'tram-front': 'трамвай транспорт', bike: 'велосипед', 'circle-parking': 'парковка стоянка',
  fuel: 'бензин заправка топливо азс', plane: 'самолёт самолет перелёт авиабилеты путешествие',
  ship: 'корабль паром круиз', sailboat: 'лодка яхта', 'map-pin': 'место точка карта',
  map: 'карта путешествие', luggage: 'багаж чемодан путешествие', 'tent': 'палатка поход кемпинг',
  hotel: 'отель гостиница', 'bed-double': 'кровать отель гостиница', 'tree-palm': 'пальма отпуск отдых море',
  house: 'дом жильё жилье квартира аренда', building: 'здание дом офис', 'building-complex': 'жилой комплекс здание',
  key: 'ключ аренда', sofa: 'диван мебель', lamp: 'лампа свет', lightbulb: 'лампочка свет электричество коммуналка',
  zap: 'электричество энергия свет', droplet: 'вода капля коммуналка', flame: 'газ огонь отопление',
  thermometer: 'отопление температура', 'washing-machine': 'стиральная машина бытовая техника',
  'refrigerator': 'холодильник бытовая техника', hammer: 'молоток ремонт', 'paint-roller': 'ремонт покраска',
  wrench: 'ключ ремонт сервис', 'drill': 'дрель ремонт', 'brush-cleaning': 'уборка чистка',
  clapperboard: 'кино фильм развлечения', film: 'кино фильм', popcorn: 'попкорн кино', tv: 'телевизор тв подписка',
  'gamepad-2': 'игры приставка развлечения', dices: 'игры кубики настолки', music: 'музыка концерт подписка',
  headphones: 'наушники музыка', 'ticket': 'билет концерт театр', 'drama': 'театр', 'book-open': 'книга книги чтение образование',
  book: 'книга', 'library': 'библиотека книги', 'graduation-cap': 'учёба учеба образование университет',
  school: 'школа образование', 'pencil': 'карандаш канцелярия', palette: 'рисование хобби творчество',
  camera: 'фото камера', pill: 'лекарства аптека здоровье таблетки', stethoscope: 'врач медицина здоровье',
  hospital: 'больница медицина', syringe: 'укол прививка медицина', 'heart-pulse': 'здоровье пульс',
  toothbrush: 'зубы стоматолог гигиена', glasses: 'очки оптика', dumbbell: 'спорт фитнес зал тренировка',
  trophy: 'кубок победа', 'volleyball': 'волейбол спорт', 'rugby-ball': 'регби мяч',
  shirt: 'одежда футболка', footprints: 'обувь шаги', watch: 'часы',
  gem: 'украшения драгоценности', scissors: 'стрижка парикмахерская ножницы', sparkles: 'красота уход блеск',
  'spray-can': 'косметика', gift: 'подарок подарки праздник', 'party-popper': 'праздник вечеринка',
  'paw-print': 'питомцы животные кошка собака ветеринар', dog: 'собака питомец', cat: 'кошка кот питомец',
  baby: 'ребёнок ребенок дети малыш', 'users': 'люди семья', user: 'человек', 'heart-handshake': 'благотворительность помощь',
  smartphone: 'телефон смартфон связь', phone: 'телефон связь звонки', wifi: 'интернет связь вайфай',
  laptop: 'ноутбук компьютер техника', monitor: 'монитор компьютер', globe: 'интернет мир сайт',
  cloud: 'облако подписка', briefcase: 'работа зарплата портфель', 'hand-coins': 'доход деньги монеты',
  wallet: 'кошелёк кошелек деньги', 'credit-card': 'карта кредит банк', landmark: 'банк налоги госуслуги',
  'piggy-bank': 'копилка накопления сбережения', banknote: 'деньги купюры наличные', coins: 'монеты деньги',
  'trending-up': 'рост инвестиции доход', 'chart-line': 'график инвестиции', receipt: 'чек счёт счет квитанция',
  percent: 'процент скидка проценты', 'badge-percent': 'скидка процент', 'hand-heart': 'благотворительность',
  heart: 'сердце любовь здоровье', star: 'звезда избранное', 'face-grinning': 'улыбка смайл лицо', leaf: 'лист природа',
  'tree-pine': 'ёлка елка дерево', flower: 'цветы цветок', sun: 'солнце', umbrella: 'зонт страховка',
  'shield': 'страховка защита', 'shield-check': 'страховка', package: 'посылка доставка коробка другое',
  truck: 'доставка грузовик', 'scale': 'весы корректировка', handshake: 'долг сделка рукопожатие',
  'arrow-left-right': 'перевод', 'calendar': 'календарь', 'clock': 'время часы', 'mail': 'почта письмо',
  'church': 'церковь', 'cigarette': 'сигареты курение',
};

const svgInner = (name) => nodes[name]
  .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
  .join('');

const missing = [...POPULAR, ...EXTRA, ...GROUPS.map((g) => g.icon), ...Object.keys(RU)].filter((n) => !nodes[n]);
if (missing.length) console.warn('⚠ нет в Lucide:', [...new Set(missing)].join(', '));

const items = GROUPS.map(() => []);
const used = {};
for (const name of Object.keys(nodes).sort()) {
  const cats = categories[name] || [];
  const gi = GROUPS.findIndex((g) => g.cats.some((c) => cats.includes(c)));
  if (gi < 0 && !POPULAR.includes(name)) continue;
  const g = gi < 0 ? GROUPS[GROUPS.length - 1] : GROUPS[gi];
  const ru = RU[name] || '';
  const label = ru ? ru.split(' ')[0] : name.replace(/-/g, ' ');
  const keywords = [ru, g.name.toLowerCase(), name.replace(/-/g, ' '), ...(tags[name] || [])].filter(Boolean).join(' ');
  items[gi < 0 ? GROUPS.length - 1 : gi].push([name, `${label}|${keywords}`]);
  used[name] = svgInner(name);
}
for (const n of GROUPS.map((g) => g.icon)) used[n] ||= svgInner(n);

const data = {
  groups: GROUPS.map((g, i) => ({ name: g.name, icon: g.icon, items: items[i] })),
  svg: used,
};
writeFileSync(join(root, 'src', 'utils', 'lucideData.json'), JSON.stringify(data));
const popular = Object.fromEntries([...POPULAR, ...EXTRA].filter((n) => nodes[n]).map((n) => [n, svgInner(n)]));
writeFileSync(join(root, 'src', 'utils', 'lucidePopular.json'), JSON.stringify({ order: POPULAR, svg: popular }));
console.log(`✓ ${Object.keys(used).length} иконок, популярных ${POPULAR.length}`);
