// Generates the PWA icons: 192, 512, maskable 512 and the iOS touch icon.
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng } from './png.mjs';

const BG = [11, 15, 25];
const RING = [96, 165, 250];
const DOT = [251, 191, 36];
const clamp = (v) => Math.min(1, Math.max(0, v));

/** content: radius of the artwork as a fraction of the icon; rounded: corner radius fraction (0 = full bleed). */
function icon(size, content, rounded) {
  const c = (size - 1) / 2;
  const R = (size / 2) * content;
  return encodePng(size, (x, y) => {
    let alpha = 1;
    if (rounded > 0) {
      const r = size * rounded;
      const dx = Math.max(r - x, 0, x - (size - 1 - r));
      const dy = Math.max(r - y, 0, y - (size - 1 - r));
      alpha = clamp(r - Math.hypot(dx, dy) + 0.5);
    }
    const d = Math.hypot(x - c, y - c);
    const ring = clamp(1 - Math.abs(d - R * 0.72) / (R * 0.11) + 0.5);
    const dot = clamp(R * 0.3 - d + 0.5);
    let [r, g, b] = BG;
    r += (RING[0] - r) * ring;
    g += (RING[1] - g) * ring;
    b += (RING[2] - b) * ring;
    r += (DOT[0] - r) * dot;
    g += (DOT[1] - g) * dot;
    b += (DOT[2] - b) * dot;
    return [Math.round(r), Math.round(g), Math.round(b), Math.round(alpha * 255)];
  });
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192, 0.9, 0.2));
writeFileSync('public/icons/icon-512.png', icon(512, 0.9, 0.2));
// Maskable: full bleed, artwork inside the central 60% safe zone.
writeFileSync('public/icons/maskable-512.png', icon(512, 0.6, 0));
// iOS ignores transparency and applies its own mask.
writeFileSync('public/icons/apple-touch-icon.png', icon(180, 0.75, 0));
