#!/usr/bin/env node
// Placeholder app icons in the "fresh linen" identity: a deep-green camera whose lens holds a check
// mark, on linen. Writes:
//   assets/icons/icon.png                       1024² opaque: linen + glyph (iOS / primary icon)
//   assets/icons/icon-foreground.png            1024² transparent glyph inside the adaptive safe zone
//   assets/icons/icon-background.png            1024² solid linen (Android adaptive background)
//   assets/icons/icon-monochrome.png            1024² white silhouette (Android 13 themed icon, notification icon)
//   assets/widget-preview/next-turnover-2x2.png Android widget picker preview
// Colours are read from packages/shared/src/tokens.ts (light scheme), so a token change is one re-run
// away: `pnpm --filter mobile icons`. PNGs are encoded with sharp when it resolves from the
// workspace, otherwise with the small zlib encoder below. Replace with designed art before release.
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const tokensPath = join(appRoot, '..', '..', 'packages', 'shared', 'src', 'tokens.ts');
const iconsDir = join(appRoot, 'assets', 'icons');
const previewDir = join(appRoot, 'assets', 'widget-preview');
const SIZE = 1024;

// ---------------------------------------------------------------------------
// Tokens (plain-text parse: the source is TypeScript)

function readTokens() {
  const src = readFileSync(tokensPath, 'utf8');
  const light = src.match(/light:\s*\{([\s\S]*?)\n\s{2}\},/)?.[1] ?? '';
  const get = (name, fallback) => light.match(new RegExp(`\\b${name}:\\s*"(#[0-9A-Fa-f]{6})"`))?.[1] ?? fallback;
  return {
    linen: get('surface', '#FAF8F4'),
    card: get('surfaceElevated', '#FFFFFF'),
    sunken: get('surfaceSunken', '#F1EDE5'),
    ink: get('text', '#1A1F24'),
    green: get('accent', '#1F6B4A'),
    greenSoft: get('accentSoft', '#E1EFE6'),
    issue: get('issue', '#E0633F'),
  };
}

// ---------------------------------------------------------------------------
// Rasteriser: RGBA buffer, shapes as signed distance fields (negative inside), 1-px anti-aliasing

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function canvas(w, h, fill = [0, 0, 0, 0]) {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set(fill, i * 4);
  return { w, h, px };
}

function blend(c, x, y, rgb, alpha) {
  if (alpha <= 0) return;
  const i = (y * c.w + x) * 4;
  const a0 = c.px[i + 3] / 255;
  const a = alpha + a0 * (1 - alpha);
  for (let k = 0; k < 3; k++) c.px[i + k] = a > 0 ? Math.round((rgb[k] * alpha + c.px[i + k] * a0 * (1 - alpha)) / a) : 0;
  c.px[i + 3] = Math.round(a * 255);
}

/** Removes coverage (punches a hole) instead of painting. */
function erase(c, x, y, alpha) {
  if (alpha <= 0) return;
  const i = (y * c.w + x) * 4;
  c.px[i + 3] = Math.round(c.px[i + 3] * (1 - alpha));
}

/** Paints `sdf` (distance in px, < 0 inside) with `rgb`, or erases when `rgb` is null. */
function paint(c, sdf, rgb, bounds = [0, 0, c.w, c.h]) {
  const [x0, y0, x1, y1] = bounds.map((v, i) => Math.max(0, Math.min(i % 2 ? c.h : c.w, Math.round(v))));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const cov = Math.max(0, Math.min(1, 0.5 - sdf(x + 0.5, y + 0.5)));
      if (cov <= 0) continue;
      if (rgb) blend(c, x, y, rgb, cov);
      else erase(c, x, y, cov);
    }
  }
}

const sdRoundRect = (cx, cy, hw, hh, r) => (x, y) => {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdCircle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const sdSegment = (ax, ay, bx, by, r) => (x, y) => {
  const pax = x - ax;
  const pay = y - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
};
const union = (...fs) => (x, y) => Math.min(...fs.map((f) => f(x, y)));

/**
 * The glyph centred at (cx, cy), `s` = its width: camera body + viewfinder bump in `body`, a lens
 * disc in `lens` (null = transparent hole), a check mark in `check`.
 */
function drawGlyph(c, { cx, cy, s, body, lens, check }) {
  const hw = s / 2;
  const hh = s * 0.36;
  const bodyTop = cy - hh + s * 0.06;
  const shape = union(
    sdRoundRect(cx, cy + s * 0.06, hw, hh, s * 0.13),
    sdRoundRect(cx - s * 0.12, bodyTop - s * 0.02, s * 0.17, s * 0.09, s * 0.06),
  );
  const pad = s * 0.1;
  const bounds = [cx - hw - pad, cy - hh - s * 0.2, cx + hw + pad, cy + hh + s * 0.2];
  paint(c, shape, body, bounds);
  const lx = cx;
  const ly = cy + s * 0.08;
  const lr = s * 0.25;
  paint(c, sdCircle(lx, ly, lr), lens, bounds);
  // Check mark inside the lens.
  const w = s * 0.045;
  const mark = union(
    sdSegment(lx - lr * 0.48, ly + lr * 0.02, lx - lr * 0.12, ly + lr * 0.38, w),
    sdSegment(lx - lr * 0.12, ly + lr * 0.38, lx + lr * 0.52, ly - lr * 0.34, w),
  );
  paint(c, mark, check, bounds);
  // Flash dot.
  paint(c, sdCircle(cx + hw * 0.66, bodyTop + s * 0.1, s * 0.035), lens ?? null, bounds);
}

// ---------------------------------------------------------------------------
// PNG encoding

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePngFallback({ w, h, px }, opaque) {
  const channels = opaque ? 3 : 4;
  const raw = Buffer.alloc((w * channels + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * channels + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = row + 1 + x * channels;
      raw[d] = px[s];
      raw[d + 1] = px[s + 1];
      raw[d + 2] = px[s + 2];
      if (!opaque) raw[d + 3] = px[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function loadSharp() {
  try {
    return createRequire(join(appRoot, 'package.json'))('sharp');
  } catch {
    return null;
  }
}

const sharp = loadSharp();

async function writePng(path, c, { opaque = false } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  if (sharp) {
    let img = sharp(c.px, { raw: { width: c.w, height: c.h, channels: 4 } });
    if (opaque) img = img.removeAlpha();
    await img.png({ compressionLevel: 9 }).toFile(path);
  } else {
    writeFileSync(path, encodePngFallback(c, opaque));
  }
}

// ---------------------------------------------------------------------------

const WHITE = [255, 255, 255];

async function main() {
  const t = readTokens();
  const linen = hexToRgb(t.linen);
  const green = hexToRgb(t.green);

  const full = canvas(SIZE, SIZE, [...linen, 255]);
  drawGlyph(full, { cx: SIZE / 2, cy: SIZE / 2 - SIZE * 0.02, s: SIZE * 0.6, body: green, lens: linen, check: green });
  await writePng(join(iconsDir, 'icon.png'), full, { opaque: true });

  // Adaptive icons show the central 66/108 of the canvas: keep the glyph well inside it.
  const fg = canvas(SIZE, SIZE);
  drawGlyph(fg, { cx: SIZE / 2, cy: SIZE / 2 - SIZE * 0.015, s: SIZE * 0.42, body: green, lens: linen, check: green });
  await writePng(join(iconsDir, 'icon-foreground.png'), fg);

  await writePng(join(iconsDir, 'icon-background.png'), canvas(SIZE, SIZE, [...linen, 255]), { opaque: true });

  // Monochrome: white body, transparent lens, white check.
  const mono = canvas(SIZE, SIZE);
  drawGlyph(mono, { cx: SIZE / 2, cy: SIZE / 2 - SIZE * 0.015, s: SIZE * 0.42, body: WHITE, lens: null, check: WHITE });
  await writePng(join(iconsDir, 'icon-monochrome.png'), mono);

  // Widget picker preview (2×2): card, rooms ring, glyph, title and subtitle bars.
  const P = 440;
  const preview = canvas(P, P);
  paint(preview, sdRoundRect(P / 2, P / 2, P / 2, P / 2, 48), hexToRgb(t.card));
  const ringAt = [P - 86, 86];
  paint(preview, (x, y) => Math.abs(Math.hypot(x - ringAt[0], y - ringAt[1]) - 46) - 7, hexToRgb(t.sunken));
  paint(
    preview,
    (x, y) => {
      const d = Math.abs(Math.hypot(x - ringAt[0], y - ringAt[1]) - 46) - 7;
      const angle = (Math.atan2(x - ringAt[0], -(y - ringAt[1])) / (2 * Math.PI) + 1) % 1;
      return angle <= 0.6 ? d : 1e9;
    },
    green,
  );
  paint(preview, sdRoundRect(130, 90, 90, 14, 7), hexToRgb(t.sunken));
  drawGlyph(preview, { cx: 104, cy: 250, s: 110, body: green, lens: hexToRgb(t.card), check: green });
  paint(preview, sdRoundRect(285, 245, 115, 16, 8), hexToRgb(t.ink));
  paint(preview, sdRoundRect(250, 292, 80, 11, 6), green);
  paint(preview, sdRoundRect(230, 360, 160, 9, 5), hexToRgb(t.sunken));
  await writePng(join(previewDir, 'next-turnover-2x2.png'), preview);

  console.log(`Icons written to assets/icons and assets/widget-preview (${sharp ? 'sharp' : 'built-in PNG encoder'}).`);
  console.log(`linen ${t.linen} · green ${t.green}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
