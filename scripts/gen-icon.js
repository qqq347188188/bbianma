// 纯 Node 生成 App 图标（不依赖任何图像库），输出标准 iOS 各尺寸 PNG 并写 Contents.json
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..", "Sources", "Assets.xcassets", "AppIcon.appiconset");

// ---- CRC32（PNG 分块校验需要）----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function writePNG(file, rgb) {
  const N = Math.sqrt(rgb.length / 3);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // 每行前加 filter 字节 0
  const raw = Buffer.alloc(N * (N * 3 + 1));
  for (let y = 0; y < N; y++) {
    raw[y * (N * 3 + 1)] = 0;
    rgb.copy(raw, y * (N * 3 + 1) + 1, y * N * 3, (y + 1) * N * 3);
  }
  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
  fs.writeFileSync(file, png);
}

// ---- 简易 2D 绘制 ----
function makeCanvas(N) { return Buffer.alloc(N * N * 3); }
function setPx(buf, N, x, y, r, g, b) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const i = (y * N + x) * 3; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function distToSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x0 + t * dx, cy = y0 + t * dy;
  return Math.hypot(px - cx, py - cy);
}
function thickPolyline(buf, N, pts, width, color) {
  const t = width / 2;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let d = Infinity;
      for (let i = 0; i < pts.length - 1; i++)
        d = Math.min(d, distToSeg(x + 0.5, y + 0.5, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
      if (d <= t) setPx(buf, N, x, y, color[0], color[1], color[2]);
    }
}

// ---- 绘制单个尺寸图标 ----
function drawIcon(N) {
  const buf = makeCanvas(N);
  // 渐变背景（顶部青蓝 -> 底部靛紫）
  const top = [14, 165, 233], bot = [99, 102, 241];
  for (let y = 0; y < N; y++) {
    const t = y / (N - 1);
    const r = lerp(top[0], bot[0], t), g = lerp(top[1], bot[1], t), b = lerp(top[2], bot[2], t);
    for (let x = 0; x < N; x++) setPx(buf, N, x, y, r | 0, g | 0, b | 0);
  }
  const c = N / 2;
  const white = [255, 255, 255];
  const w = N * 0.11; // 笔画粗细
  // "</>" 代码符号（归一化坐标 * N）
  const lt = (nx, ny) => [nx * N, ny * N];
  thickPolyline(buf, N, [lt(0.46, 0.28), lt(0.26, 0.50), lt(0.46, 0.72)], w, white); // <
  thickPolyline(buf, N, [lt(0.50, 0.64), lt(0.66, 0.36)], w, white);                 // /
  thickPolyline(buf, N, [lt(0.70, 0.28), lt(0.90, 0.50), lt(0.70, 0.72)], w, white); // >
  return buf;
}

// ---- 各尺寸插槽（iOS 标准）----
const SLOTS = [
  { idiom: "iphone", size: "20x20", scale: "2x", px: 40 },
  { idiom: "iphone", size: "20x20", scale: "3x", px: 60 },
  { idiom: "iphone", size: "29x29", scale: "2x", px: 58 },
  { idiom: "iphone", size: "29x29", scale: "3x", px: 87 },
  { idiom: "iphone", size: "40x40", scale: "2x", px: 80 },
  { idiom: "iphone", size: "40x40", scale: "3x", px: 120 },
  { idiom: "iphone", size: "60x60", scale: "2x", px: 120 },
  { idiom: "iphone", size: "60x60", scale: "3x", px: 180 },
  { idiom: "ipad", size: "20x20", scale: "1x", px: 20 },
  { idiom: "ipad", size: "20x20", scale: "2x", px: 40 },
  { idiom: "ipad", size: "29x29", scale: "1x", px: 29 },
  { idiom: "ipad", size: "29x29", scale: "2x", px: 58 },
  { idiom: "ipad", size: "40x40", scale: "1x", px: 40 },
  { idiom: "ipad", size: "40x40", scale: "2x", px: 80 },
  { idiom: "ipad", size: "76x76", scale: "1x", px: 76 },
  { idiom: "ipad", size: "76x76", scale: "2x", px: 152 },
  { idiom: "ipad", size: "83x83", scale: "2x", px: 166 },
  { idiom: "ios-marketing", size: "1024x1024", scale: "1x", px: 1024 },
];

fs.mkdirSync(OUT, { recursive: true });
const images = [];
for (const s of SLOTS) {
  const name = `icon-${s.px}.png`;
  writePNG(path.join(OUT, name), drawIcon(s.px));
  images.push({ idiom: s.idiom, size: s.size, scale: s.scale, filename: name });
}
const contents = { images, info: { version: 1, author: "xcode" } };
fs.writeFileSync(path.join(OUT, "Contents.json"), JSON.stringify(contents, null, 2) + "\n");

// 删除可能引发 "unassigned child" 的旧单图
const old = path.join(OUT, "icon.png");
if (fs.existsSync(old)) fs.unlinkSync(old);

console.log("生成完成：", images.length, "个图标尺寸");
