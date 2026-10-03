// Generates the three tray icons (idle slate, working blue, needs-you amber) as PNGs.
import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const SIZE = 64;
const icons = {
  idle: [148, 163, 184],
  working: [96, 165, 250],
  'needs-you': [251, 191, 36],
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(rgb, kind) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  const c = (SIZE - 1) / 2;
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0;
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - c, y - c);
      const outer = Math.min(1, Math.max(0, c - 4 - d + 0.5));
      // idle is a ring, the others are filled discs
      const hole = kind === 'idle' ? Math.min(1, Math.max(0, d - (c - 17) + 0.5)) : 1;
      const a = outer * hole;
      const i = y * (SIZE * 4 + 1) + 1 + x * 4;
      raw[i] = rgb[0];
      raw[i + 1] = rgb[1];
      raw[i + 2] = rgb[2];
      raw[i + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('src/assets/tray', { recursive: true });
for (const [name, rgb] of Object.entries(icons)) {
  writeFileSync(`src/assets/tray/${name}.png`, png(rgb, name));
}
