// Writes static/icons/icon-{16,32,48,128}.png: the life bar on a dark rounded
// tile, the same picture as windows/winres/icon.png, drawn at each size with
// 4x supersampling. Pure Node, no dependencies. Run: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const FILL = 0.62; // the static icon shows a fixed fraction; the toolbar icon is redrawn live
const SUPERSAMPLE = 4;

const lerp = (a, b, t) => a + (b - a) * t;

/** The strip gradient: green at 0, yellow at 0.5, red at 1. */
function barColor(t) {
  if (t < 0.5) {
    const u = t * 2;
    return [lerp(0x16, 0xea, u), lerp(0xa3, 0xb3, u), lerp(0x4a, 0x08, u)];
  }
  const u = (t - 0.5) * 2;
  return [lerp(0xea, 0xdc, u), lerp(0xb3, 0x26, u), lerp(0x08, 0x26, u)];
}

function render(n) {
  const S = SUPERSAMPLE;
  const N = n * S;
  const radius = (N * 48) / 256;
  const pad = N * 0.12;
  const barTop = N * 0.44;
  const barBottom = N * 0.56;
  const fill = pad + (N - 2 * pad) * FILL;
  const inside = (x, y) => {
    const cx = Math.min(Math.max(x, radius), N - radius);
    const cy = Math.min(Math.max(y, radius), N - radius);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  };
  const out = Buffer.alloc(n * n * 4);
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      let r = 0, g = 0, b = 0, covered = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = px * S + sx + 0.5;
          const y = py * S + sy + 0.5;
          if (!inside(x, y)) continue;
          let c = [0x1f, 0x24, 0x30]; // tile
          if (y >= barTop && y < barBottom && x >= pad && x < N - pad) {
            c = x < fill ? barColor((x - pad) / (N - 2 * pad)) : [0x9c, 0xa3, 0xaf];
          }
          r += c[0]; g += c[1]; b += c[2]; covered++;
        }
      }
      const i = (py * n + px) * 4;
      if (covered > 0) {
        out[i] = Math.round(r / covered);
        out[i + 1] = Math.round(g / covered);
        out[i + 2] = Math.round(b / covered);
      }
      out[i + 3] = Math.round((covered * 255) / (S * S));
    }
  }
  return out;
}

// ---- minimal PNG writer ----------------------------------------------------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('static/icons', { recursive: true });
for (const n of SIZES) {
  const file = `static/icons/icon-${n}.png`;
  writeFileSync(file, png(n, render(n)));
  console.log(`wrote ${file}`);
}
