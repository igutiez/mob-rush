// Genera los iconos PNG de la PWA sin dependencias (dibujo por SDF + codificador PNG mínimo).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const sdBox = (px, py, cx, cy, hx, hy, r) => {
  const dx = Math.abs(px - cx) - hx + r, dy = Math.abs(py - cy) - hy + r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function render(size, fullBleed, inset) {
  const buf = Buffer.alloc(size * size * 4);
  const top = hex('#3d8bff'), bot = hex('#1d4fd6');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      const px = 0.5 + (u - 0.5) / inset, py = 0.5 + (v - 0.5) / inset;
      const aa = 1 / (size * inset);
      const cov = (d) => Math.min(1, Math.max(0, 0.5 - d / aa));
      let col = top.map((c, i) => c + (bot[i] - c) * v);
      let alpha = fullBleed ? 1 : cov(sdBox(u, v, 0.5, 0.5, 0.5, 0.5, 0.22));
      const over = (rgb, a) => { col = col.map((c, i) => c + (rgb[i] - c) * a); };
      over(hex('#ef3b3b'), cov(sdBox(px, py, 0.5, 0.19, 0.24, 0.065, 0.03)));
      over(hex('#ffc531'), cov(Math.abs(sdBox(px, py, 0.5, 0.54, 0.3, 0.245, 0.06)) - 0.028));
      for (const [hx, hy] of [[0.375, 0.52], [0.5, 0.49], [0.625, 0.52]]) {
        over([255, 255, 255], cov(Math.hypot(px - hx, py - hy) - 0.056));
        over([255, 255, 255], cov(sdBox(px, py, hx, hy + 0.12, 0.055, 0.065, 0.045)));
      }
      const o = (y * size + x) * 4;
      buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]; buf[o + 3] = Math.round(alpha * 255);
    }
  }
  return png(size, buf);
}

writeFileSync('game/icons/icon-192.png', render(192, false, 1));
writeFileSync('game/icons/icon-512.png', render(512, false, 1));
writeFileSync('game/icons/maskable-512.png', render(512, true, 0.78));
writeFileSync('game/icons/apple-touch-icon.png', render(180, true, 0.92));
console.log('iconos generados');
