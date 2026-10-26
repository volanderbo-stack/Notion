// Генерує PNG-іконки без залежностей: градієнтний квадрат, три плитки й сердечко
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const png = (w, h, rgba) => {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const inRound = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.min(Math.max(x, x0 + r), x1 - r)
  const cy = Math.min(Math.max(y, y0 + r), y1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
const inHeart = (x, y, cx, cy, s) => {
  const u = (x - cx) / s, v = -(y - cy) / s
  return (u * u + v * v - 1) ** 3 - u * u * v * v * v <= 0
}

// Повертає [r,g,b,a] у точці (0..1) — maskable: без заокруглення, вміст у безпечній зоні
function sample(x, y, maskable) {
  const bgR = maskable ? 0 : 0.22
  if (!maskable && !inRound(x, y, 0, 0, 1, 1, bgR)) return [0, 0, 0, 0]
  const t = (x + y) / 2
  let col = [Math.round(124 + (236 - 124) * t), Math.round(92 + (72 - 92) * t), Math.round(255 + (153 - 255) * t), 255]
  const k = maskable ? 0.72 : 1
  const o = (1 - k) / 2
  const X = (x - o) / k, Y = (y - o) / k
  const g = 0.06, a = 0.2, b = 0.8, m = (a + b) / 2
  const tiles = [[a, a, m - g / 2, m - g / 2], [m + g / 2, a, b, m - g / 2], [a, m + g / 2, m - g / 2, b]]
  for (const [x0, y0, x1, y1] of tiles) if (inRound(X, Y, x0, y0, x1, y1, 0.05)) col = [255, 255, 255, 235]
  if (inHeart(X, Y, (m + g / 2 + b) / 2, (m + g / 2 + b) / 2 + 0.012, 0.135)) col = [255, 255, 255, 255]
  return col
}

function render(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4)
  const ss = 4
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const acc = [0, 0, 0, 0]
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const c = sample((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, maskable)
      acc[0] += c[0] * c[3]; acc[1] += c[1] * c[3]; acc[2] += c[2] * c[3]; acc[3] += c[3]
    }
    const i = (py * size + px) * 4
    const a = acc[3]
    buf[i] = a ? acc[0] / a : 0; buf[i + 1] = a ? acc[1] / a : 0; buf[i + 2] = a ? acc[2] / a : 0
    buf[i + 3] = a / (ss * ss)
  }
  return png(size, size, buf)
}

const dir = new URL('../public/icons/', import.meta.url)
writeFileSync(new URL('icon-192.png', dir), render(192))
writeFileSync(new URL('icon-512.png', dir), render(512))
writeFileSync(new URL('icon-maskable-512.png', dir), render(512, true))
writeFileSync(new URL('apple-touch-icon.png', dir), render(180, true))
console.log('Іконки готові')
