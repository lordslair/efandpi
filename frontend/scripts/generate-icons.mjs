/**
 * Generates the favicon and PWA PNG icons from a single source image
 * (frontend/icon-source.png) using sharp.
 */
import sharp from "sharp";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceImage = join(__dirname, "..", "icon-source.png");
const publicDir = join(__dirname, "..", "public");

const icons = [
  { file: "favicon.png", size: 32 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "pwa-192.png", size: 192 },
  { file: "pwa-512.png", size: 512 },
];

for (const { file, size } of icons) {
  await sharp(sourceImage)
    .resize(size, size, { fit: "cover" })
    .png()
    .toFile(join(publicDir, file));
  console.log(`  generated public/${file} (${size}×${size})`);
}
