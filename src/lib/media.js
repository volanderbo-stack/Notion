// Робота з медіа: мініатюри, метадані відео/аудіо, дата EXIF, рендер відредагованого фото
export const THUMB_SIZE = 480

export function typeOfFile(file) {
  const m = file.type || ''
  if (m.startsWith('image/')) return 'photo'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'voice'
  if (/\.(heic|heif|jpe?g|png|webp|gif|avif)$/i.test(file.name)) return 'photo'
  if (/\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name)) return 'video'
  if (/\.(mp3|m4a|ogg|oga|wav|aac|opus)$/i.test(file.name)) return 'voice'
  return 'file'
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise((res) => canvas.toBlob(res, type, quality))
}

function fitSize(w, h, max) {
  const k = Math.min(1, max / Math.max(w, h))
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]
}

export async function loadBitmap(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }) } catch { /* запасний шлях нижче */ }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

const srcSize = (src) => [src.naturalWidth || src.videoWidth || src.width, src.naturalHeight || src.videoHeight || src.height]

export async function thumbFromSource(src, max = THUMB_SIZE) {
  const [w, h] = srcSize(src)
  const [tw, th] = fitSize(w, h, max)
  const c = document.createElement('canvas')
  c.width = tw
  c.height = th
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, tw, th)
  return canvasToBlob(c, 'image/jpeg', 0.8)
}

export async function imageMeta(blob) {
  try {
    const bmp = await loadBitmap(blob)
    const [width, height] = srcSize(bmp)
    const thumb = await thumbFromSource(bmp)
    bmp.close?.()
    return { width, height, thumb }
  } catch {
    return { width: 0, height: 0, thumb: null }
  }
}

export function videoMeta(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const v = document.createElement('video')
    let done = false
    const finish = async (grab) => {
      if (done) return
      done = true
      let thumb = null
      if (grab && v.videoWidth) {
        try { thumb = await thumbFromSource(v) } catch { /* без мініатюри */ }
      }
      const r = { width: v.videoWidth || 0, height: v.videoHeight || 0, duration: isFinite(v.duration) ? v.duration : 0, thumb }
      v.removeAttribute('src')
      v.load()
      URL.revokeObjectURL(url)
      resolve(r)
    }
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 0) * 0.1) }
    v.onseeked = () => finish(true)
    v.onerror = () => finish(false)
    setTimeout(() => finish(true), 10000)
    v.src = url
  })
}

export function audioDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const a = new Audio()
    let done = false
    const end = (d) => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      resolve(isFinite(d) ? d : 0)
    }
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      // Записи MediaRecorder часто мають duration=Infinity — змушуємо браузер дочитати файл
      if (a.duration === Infinity) {
        a.currentTime = 1e9
        a.ontimeupdate = () => { a.ontimeupdate = null; end(a.duration) }
      } else end(a.duration)
    }
    a.onerror = () => end(0)
    setTimeout(() => end(a.duration), 5000)
    a.src = url
  })
}

// Дата зйомки з EXIF (DateTimeOriginal / DateTime) для JPEG
export async function exifDate(blob) {
  try {
    const buf = new DataView(await blob.slice(0, 256 * 1024).arrayBuffer())
    if (buf.getUint16(0) !== 0xffd8) return null
    let off = 2
    while (off + 4 < buf.byteLength) {
      const marker = buf.getUint16(off)
      const len = buf.getUint16(off + 2)
      if (marker === 0xffe1 && buf.getUint32(off + 4) === 0x45786966) return parseTiff(buf, off + 10)
      if ((marker & 0xff00) !== 0xff00) return null
      off += 2 + len
    }
  } catch { /* битий EXIF — ігноруємо */ }
  return null
}

function parseTiff(v, t) {
  const le = v.getUint16(t) === 0x4949
  const u16 = (o) => v.getUint16(t + o, le)
  const u32 = (o) => v.getUint32(t + o, le)
  const ascii = (o, n) => {
    let s = ''
    for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint8(t + o + i))
    return s
  }
  const scan = (ifd) => {
    const out = {}
    const n = u16(ifd)
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12
      const tag = u16(e)
      if (tag === 0x8769) out.exif = u32(e + 8)
      if (tag === 0x9003 || tag === 0x0132) out[tag] = ascii(u32(e + 8), u32(e + 4))
    }
    return out
  }
  const ifd0 = scan(u32(4))
  const sub = ifd0.exif ? scan(ifd0.exif) : {}
  const s = sub[0x9003] || ifd0[0x0132]
  const m = s && s.match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/)
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  return isNaN(d) || d.getFullYear() < 1990 ? null : d.getTime()
}

// ---------- Редагування фото ----------
export const DEFAULT_EDITS = { rotate: 0, crop: null, brightness: 100, contrast: 100 }

export const isDefaultEdits = (e) =>
  !e || (!(e.rotate % 360) && !e.crop && e.brightness === 100 && e.contrast === 100)

// Розмір зображення після повороту
export function rotatedSize(src, rotate) {
  const [w, h] = srcSize(src)
  return (((rotate % 360) + 360) % 360) % 180 ? [h, w] : [w, h]
}

// Canvas: поворот → обрізка (у координатах повернутого зображення, 0..1) → яскравість/контраст
export function renderEdits(src, edits, maxSide = 4096, applyFilter = true) {
  const [w0, h0] = srcSize(src)
  const rot = ((edits.rotate % 360) + 360) % 360
  const [rw, rh] = rotatedSize(src, rot)
  const c = edits.crop || { x: 0, y: 0, w: 1, h: 1 }
  const cw = Math.max(1, Math.round(c.w * rw))
  const ch = Math.max(1, Math.round(c.h * rh))
  const [ow, oh] = fitSize(cw, ch, maxSide)
  const k = ow / cw

  const canvas = document.createElement('canvas')
  canvas.width = ow
  canvas.height = oh
  const ctx = canvas.getContext('2d')
  const needFilter = applyFilter && (edits.brightness !== 100 || edits.contrast !== 100)
  const nativeFilter = needFilter && typeof ctx.filter === 'string'
  if (nativeFilter) ctx.filter = `brightness(${edits.brightness}%) contrast(${edits.contrast}%)`
  ctx.imageSmoothingQuality = 'high'
  ctx.scale(k, k)
  ctx.translate(-c.x * rw, -c.y * rh)
  ctx.translate(rw / 2, rh / 2)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.drawImage(src, -w0 / 2, -h0 / 2)
  if (needFilter && !nativeFilter) applyFilterManually(ctx, ow, oh, edits)
  return canvas
}

function applyFilterManually(ctx, w, h, { brightness, contrast }) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const b = brightness / 100
  const c = contrast / 100
  for (let i = 0; i < d.length; i += 4) {
    for (let j = 0; j < 3; j++) {
      const v = (d[i + j] * b - 127.5) * c + 127.5
      d[i + j] = v < 0 ? 0 : v > 255 ? 255 : v
    }
  }
  ctx.putImageData(img, 0, 0)
}
