// Генерация PNG-иконок из public/icon.svg для PWA-манифеста.
// Запуск: npm run icons
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'icon.svg'));

const sizes = [192, 512];

for (const size of sizes) {
  const out = join(root, 'public', `icon-${size}.png`);
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(out);
  console.log(`✓ ${out}`);
}
