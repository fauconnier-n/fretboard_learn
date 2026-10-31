// Animated GIFs from PNG screenshots, without dependencies (dev tool for browser-check.mjs).
//   encodeGif(pngBuffers, delaysMs) -> Buffer
// PNG frames (8-bit RGB or RGBA, as Chrome writes them) are decoded with zlib, reduced to one
// shared 256-colour palette (the most common colours, at 5 bits per channel), and LZW-coded.
import { inflateSync } from 'node:zlib';

function decodePng(buf) {
  let p = 8;
  let w = 0;
  let h = 0;
  let type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const kind = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('only 8-bit, non-interlaced PNGs');
      type = data[9];
    } else if (kind === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp) throw new Error('only RGB or RGBA PNGs');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = new Uint8Array(w * h * 3);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) out.set(cur.subarray(x * bpp, x * bpp + 3), (y * w + x) * 3);
    prev = cur;
  }
  return { w, h, rgb: out };
}

const key5 = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

function palette(frames) {
  const count = new Uint32Array(32768);
  const sum = new Float64Array(32768 * 3);
  for (const { rgb } of frames) {
    for (let i = 0; i < rgb.length; i += 3) {
      const k = key5(rgb[i], rgb[i + 1], rgb[i + 2]);
      count[k]++;
      sum[k * 3] += rgb[i];
      sum[k * 3 + 1] += rgb[i + 1];
      sum[k * 3 + 2] += rgb[i + 2];
    }
  }
  const keys = [...count.keys()].filter((k) => count[k]).sort((a, b) => count[b] - count[a]).slice(0, 256);
  return keys.map((k) => [0, 1, 2].map((c) => Math.round(sum[k * 3 + c] / count[k])));
}

function indexer(pal) {
  const cache = new Int16Array(32768).fill(-1);
  return (r, g, b) => {
    const k = key5(r, g, b);
    if (cache[k] >= 0) return cache[k];
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const d = (pal[i][0] - r) ** 2 + (pal[i][1] - g) ** 2 + (pal[i][2] - b) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return (cache[k] = best);
  };
}

// GIF LZW with 8-bit pixels: codes from 9 bits up to 12, then a clear code.
function lzw(pixels) {
  const out = [];
  let acc = 0;
  let bits = 0;
  let size = 9;
  const emit = (code) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
  };
  let dict = new Map();
  let next = 258;
  emit(256);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const id = prefix * 256 + k;
    const hit = dict.get(id);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(id, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(256);
      dict = new Map();
      next = 258;
      size = 9;
    }
    prefix = k;
  }
  emit(prefix);
  emit(257);
  if (bits) out.push(acc & 255);
  return out;
}

/** @param {Buffer[]} pngs @param {number[]} delaysMs */
export function encodeGif(pngs, delaysMs) {
  const frames = pngs.map(decodePng);
  const { w, h } = frames[0];
  const pal = palette(frames);
  while (pal.length < 256) pal.push([0, 0, 0]);
  const index = indexer(pal);
  const bytes = [];
  const u16 = (v) => bytes.push(v & 255, v >> 8);
  bytes.push(...Buffer.from('GIF89a'));
  u16(w);
  u16(h);
  bytes.push(0xf7, 0, 0); // global colour table of 256 entries
  for (const c of pal) bytes.push(...c);
  bytes.push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0); // loop forever
  frames.forEach((fr, n) => {
    bytes.push(0x21, 0xf9, 4, 0);
    u16(Math.max(2, Math.round((delaysMs[n] ?? 100) / 10)));
    bytes.push(0, 0);
    bytes.push(0x2c);
    u16(0);
    u16(0);
    u16(fr.w);
    u16(fr.h);
    bytes.push(0, 8);
    const px = new Uint8Array(fr.w * fr.h);
    for (let i = 0; i < px.length; i++) px[i] = index(fr.rgb[i * 3], fr.rgb[i * 3 + 1], fr.rgb[i * 3 + 2]);
    const data = lzw(px);
    for (let i = 0; i < data.length; i += 255) {
      const block = data.slice(i, i + 255);
      bytes.push(block.length, ...block);
    }
    bytes.push(0);
  });
  bytes.push(0x3b);
  return Buffer.from(bytes);
}
