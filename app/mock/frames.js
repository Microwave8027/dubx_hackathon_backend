// Generates small JPEG preview frames without native deps.
import jpeg from 'jpeg-js';

const W = 320;
const H = 200;

function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function makeFrame(hue, tick, progress) {
  const data = Buffer.alloc(W * H * 4);
  const [r, g, b] = hsl(hue, 0.5, 0.22);
  const [pr, pg, pb] = hsl(hue, 0.7, 0.6);
  const barX = (tick * 24) % (W - 60);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let c = [r + (y / H) * 20, g + (y / H) * 20, b + (y / H) * 20];
      if (y < 22) c = [r + 25, g + 25, b + 25]; // title bar
      if (y > 40 && y < 56 && x > 20 && x < 20 + progress * (W - 40)) c = [pr, pg, pb];
      if (y > 80 && y < 120 && x > barX && x < barX + 60) c = [255, 255, 255];
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return jpeg.encode({ data, width: W, height: H }, 55).data.toString('base64');
}

/** Small SVG "screenshot" used as an approval context image. */
export function contextScreenshotSvg(text) {
  const safe = text.replace(/[<>&"]/g, '');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">` +
    `<rect width="640" height="360" fill="#1e293b"/><rect width="640" height="32" fill="#334155"/>` +
    `<rect x="24" y="64" width="592" height="40" rx="6" fill="#0f172a"/>` +
    `<text x="40" y="90" fill="#e2e8f0" font-family="sans-serif" font-size="16">${safe.slice(0, 60)}</text>` +
    `<rect x="24" y="128" width="400" height="12" rx="4" fill="#475569"/>` +
    `<rect x="24" y="152" width="520" height="12" rx="4" fill="#475569"/>` +
    `<rect x="24" y="176" width="300" height="12" rx="4" fill="#475569"/></svg>`
  );
}
