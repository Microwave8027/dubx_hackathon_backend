// Generates the three tray icons (idle slate, working blue, needs-you amber) as PNGs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng } from './png.mjs';

const SIZE = 64;
const icons = {
  idle: [148, 163, 184],
  working: [96, 165, 250],
  'needs-you': [251, 191, 36],
};

function png(rgb, kind) {
  const c = (SIZE - 1) / 2;
  return encodePng(SIZE, (x, y) => {
    const d = Math.hypot(x - c, y - c);
    const outer = Math.min(1, Math.max(0, c - 4 - d + 0.5));
    // idle is a ring, the others are filled discs
    const hole = kind === 'idle' ? Math.min(1, Math.max(0, d - (c - 17) + 0.5)) : 1;
    return [rgb[0], rgb[1], rgb[2], Math.round(outer * hole * 255)];
  });
}

mkdirSync('src/assets/tray', { recursive: true });
for (const [name, rgb] of Object.entries(icons)) {
  writeFileSync(`src/assets/tray/${name}.png`, png(rgb, name));
}
