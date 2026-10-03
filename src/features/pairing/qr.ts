import QRCode from 'qrcode';

/** Pure-JS SVG QR as a data URI (no canvas, no innerHTML). */
export async function qrDataUri(text: string): Promise<string> {
  const svg = await QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
