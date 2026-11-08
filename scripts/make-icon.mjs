/**
 * Generates build/icon.ico + build/icon.png from the Shrike mark.
 * Pure Node: no image dependencies. Renders at 4x then downsamples for clean edges.
 */

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "build");
const SIZE = 256;
const SS = 4; // supersample factor
const N = SIZE * SS;

const BG = [15, 18, 19, 255];
const BORDER = [43, 50, 52, 255];
const ACCENT = [217, 164, 65, 255];

function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    r
  );
}

function drawSegment(px, x0, y0, x1, y1, half) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - half - 1));
  const maxX = Math.min(N - 1, Math.ceil(Math.max(x0, x1) + half + 1));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - half - 1));
  const maxY = Math.min(N - 1, Math.ceil(Math.max(y0, y1) + half + 1));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy || 1;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      let t = ((cx - x0) * dx + (cy - y0) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const ex = x0 + t * dx - cx;
      const ey = y0 + t * dy - cy;
      if (Math.hypot(ex, ey) <= half) {
        const i = (y * N + x) * 4;
        px[i] = ACCENT[0];
        px[i + 1] = ACCENT[1];
        px[i + 2] = ACCENT[2];
        px[i + 3] = 255;
      }
    }
  }
}

function render() {
  const buf = new Uint8ClampedArray(N * N * 4);
  const cx = N / 2;
  const cy = N / 2;

  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const i = (y * N + x) * 4;
      const d = sdRoundRect(x + 0.5, y + 0.5, cx, cy, N / 2, N / 2, 180);
      if (d >= 0) continue;
      // 6px inner hairline border
      const edge = d > -14 ? BORDER : BG;
      buf[i] = edge[0];
      buf[i + 1] = edge[1];
      buf[i + 2] = edge[2];
      buf[i + 3] = 255;
    }
  }

  // Mark: 16-unit viewBox mapped into 96..928 with 52px units.
  const u = (v) => 96 + v * 52;
  const half = 0.55 * 52;

  drawSegment(buf, u(8), u(0.8), u(8), u(15.2), half);
  const strokes = [
    [4.6, 0.9, 8, 3.2],
    [4.2, 3.3, 8, 5.6],
    [4.2, 5.7, 8, 8],
    [4.2, 8.1, 8, 10.4],
    [11.4, 0.9, 8, 3.2],
    [11.8, 3.3, 8, 5.6],
    [11.8, 5.7, 8, 8],
    [11.8, 8.1, 8, 10.4],
  ];
  for (const [x0, y0, x1, y1] of strokes) {
    drawSegment(buf, u(x0), u(y0), u(x1), u(y1), half);
  }

  // Box downsample.
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const i = ((y * SS + sy) * N + (x * SS + sx)) * 4;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
          a += buf[i + 3];
        }
      }
      const o = (y * SIZE + x) * 4;
      out[o] = Math.round(r / (SS * SS));
      out[o + 1] = Math.round(g / (SS * SS));
      out[o + 2] = Math.round(b / (SS * SS));
      out[o + 3] = Math.round(a / (SS * SS));
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = SIZE * 4;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = 0; // 256px encoded as 0
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12);

  return Buffer.concat([header, entry, png]);
}

async function logoIcon() {
  const logoPath = path.join(OUT_DIR, "logo.png");
  try { await fs.access(logoPath); } catch { return false; }
  const out = path.join(OUT_DIR, "icon.png");
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    `$src=[System.Drawing.Image]::FromFile('${logoPath.replace(/'/g, "''")}')`,
    `$bmp=New-Object System.Drawing.Bitmap ${SIZE},${SIZE}`,
    "$g=[System.Drawing.Graphics]::FromImage($bmp)",
    "$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
    "$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::HighQuality",
    "$g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality",
    `$g.DrawImage($src,0,0,${SIZE},${SIZE})`,
    `$bmp.Save('${out.replace(/'/g, "''")}',[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$g.Dispose(); $bmp.Dispose(); $src.Dispose()",
  ].join("; ");
  execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
    windowsHide: true,
    stdio: "ignore",
  });
  const png = await fs.readFile(out);
  await fs.writeFile(path.join(OUT_DIR, "icon.ico"), encodeIco(png));
  await fs.mkdir(path.join(ROOT, "src", "assets"), { recursive: true });
  await fs.copyFile(out, path.join(ROOT, "src", "assets", "logo.png"));
  console.log(`Wrote ${path.join(OUT_DIR, "icon.ico")} from build/logo.png`);
  return true;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  if (await logoIcon()) return;
  const png = encodePng(render());
  await fs.writeFile(path.join(OUT_DIR, "icon.png"), png);
  await fs.writeFile(path.join(OUT_DIR, "icon.ico"), encodeIco(png));
  console.log(`Wrote ${path.join(OUT_DIR, "icon.ico")} (${SIZE}x${SIZE})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
