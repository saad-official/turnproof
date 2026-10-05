// Development-only sample photos for `seedDemoData()`: a tiny two-colour PNG is encoded here
// (stored deflate blocks, no compression library), upscaled by expo-image-manipulator into a soft
// 1200×900 gradient and saved as a JPEG in the photos directory, then hashed like a real capture.
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { sha256OfFile } from './capture';
import { adoptPhotoFile, deletePhotoFile } from './photo-files';

const W = 8;
const H = 6;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const x of bytes) {
    a = (a + x) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function chunk(type: string, data: Uint8Array): number[] {
  const typeBytes = Array.from(type, (ch) => ch.charCodeAt(0));
  const body = new Uint8Array([...typeBytes, ...data]);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

const hexToRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** An 8×6 RGB PNG blending `from` (top-left) to `to` (bottom-right). */
function gradientPng(from: string, to: string): Uint8Array {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const raw: number[] = [];
  for (let y = 0; y < H; y++) {
    raw.push(0); // filter: none
    for (let x = 0; x < W; x++) {
      const t = (x / (W - 1) + y / (H - 1)) / 2;
      for (let k = 0; k < 3; k++) raw.push(Math.round(a[k]! + (b[k]! - a[k]!) * t));
    }
  }
  const data = new Uint8Array(raw);
  // zlib stream with one stored (uncompressed) deflate block.
  const zlib = new Uint8Array([0x78, 0x01, 0x01, data.length & 255, data.length >>> 8, ~data.length & 255, (~data.length >>> 8) & 255, ...data, ...u32(adler32(data))]);
  const ihdr = new Uint8Array([...u32(W), ...u32(H), 8, 2, 0, 0, 0]);
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', ihdr), ...chunk('IDAT', zlib), ...chunk('IEND', new Uint8Array())]);
}

/** Writes a sample JPEG for photo `id` and returns it like a capture (file, size, sha256). */
export async function makeDemoPhoto(
  id: string,
  colors: { from: string; to: string },
): Promise<{ localUri: string; width: number; height: number; sha256: string }> {
  const png = new File(Paths.cache, `demo-${id}.png`);
  if (png.exists) png.delete();
  png.create();
  png.write(gradientPng(colors.from, colors.to));
  const context = ImageManipulator.manipulate(png.uri).resize({ width: 1200, height: 900 });
  try {
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    image.release();
    const localUri = adoptPhotoFile(saved.uri, id);
    return { localUri, width: saved.width, height: saved.height, sha256: await sha256OfFile(localUri) };
  } finally {
    context.release();
    deletePhotoFile(png.uri);
  }
}
