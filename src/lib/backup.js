// Резервна копія: ZIP-архів (без стиснення — фото й відео вже стиснуті) з backup.json і всіма файлами.
// Власний мінімальний ZIP: файли не копіюються в пам'ять, архів складається з посилань на Blob-и.
import * as DB from './db'
import { getState, load, newItem } from './store'
import { extOf } from './share'

const APP = 'rozumna-galereya'
const enc = new TextEncoder()
const dec = new TextDecoder()

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

async function crcBlob(blob) {
  let c = 0xffffffff
  const reader = blob.stream().getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    for (let i = 0; i < value.length; i++) c = CRC_TABLE[(c ^ value[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

function header(sig, size, fields) {
  const b = new Uint8Array(size)
  const v = new DataView(b.buffer)
  v.setUint32(0, sig, true)
  for (const [off, bytes, val] of fields) (bytes === 2 ? v.setUint16 : v.setUint32).call(v, off, val, true)
  return b
}

// Мінімальний ZIP без стиснення: add(шлях, Blob) … finish() → Blob
export function createZip() {
  const { time, date } = dosTime(new Date())
  const parts = []
  const central = []
  let offset = 0
  return {
    async add(path, blob) {
      const name = enc.encode(path)
      const crc = await crcBlob(blob)
      const common = [[6, 2, 0x0800], [8, 2, 0], [10, 2, time], [12, 2, date], [14, 4, crc], [18, 4, blob.size], [22, 4, blob.size], [26, 2, name.length], [28, 2, 0]]
      parts.push(header(0x04034b50, 30, [[4, 2, 20], ...common]), name, blob)
      central.push(
        header(0x02014b50, 46, [[4, 2, 20], [6, 2, 20], ...common.map(([o, b, v]) => [o + 2, b, v]), [32, 2, 0], [34, 2, 0], [36, 2, 0], [38, 4, 0], [42, 4, offset]]),
        name,
      )
      offset += 30 + name.length + blob.size
    },
    finish() {
      const count = central.length / 2
      if (count > 0xffff || offset > 0xffffffff) throw new Error('Архів завеликий (понад 4 ГБ). Видаліть частину відео або експортуйте частинами.')
      const cdSize = central.reduce((s, b) => s + b.length, 0)
      const end = header(0x06054b50, 22, [[4, 2, 0], [6, 2, 0], [8, 2, count], [10, 2, count], [12, 4, cdSize], [16, 4, offset], [20, 2, 0]])
      return new Blob([...parts, ...central, end], { type: 'application/zip' })
    },
  }
}

export async function buildBackup(onProgress) {
  const { items, themes } = getState()
  const keys = (await DB.fileKeys()).filter((k) => typeof k === 'string')
  const zip = createZip()
  const files = {}
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]
    const blob = await DB.getFile(k)
    if (blob) {
      const path = `files/${k.replace(':', '_')}.${extOf(blob.type)}`
      files[k] = { path, type: blob.type }
      await zip.add(path, blob)
    }
    onProgress?.(i + 1, keys.length)
  }
  const meta = { app: APP, version: 1, exportedAt: Date.now(), items, themes, files }
  await zip.add('backup.json', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
  return zip.finish()
}

export async function readBackup(file) {
  const tailSize = Math.min(file.size, 65557)
  const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer())
  let eocd = -1
  for (let i = tailSize - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Це не архів резервної копії')
  const count = tail.getUint16(eocd + 10, true)
  const cdSize = tail.getUint32(eocd + 12, true)
  const cdOff = tail.getUint32(eocd + 16, true)
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer())
  const entries = new Map()
  let p = 0
  for (let n = 0; n < count && cd.getUint32(p, true) === 0x02014b50; n++) {
    const nameLen = cd.getUint16(p + 28, true)
    entries.set(dec.decode(new Uint8Array(cd.buffer, p + 46, nameLen)), {
      method: cd.getUint16(p + 10, true),
      size: cd.getUint32(p + 20, true),
      local: cd.getUint32(p + 42, true),
    })
    p += 46 + nameLen + cd.getUint16(p + 30, true) + cd.getUint16(p + 32, true)
  }

  const dataOf = async (e, type = '') => {
    const lh = new DataView(await file.slice(e.local, e.local + 30).arrayBuffer())
    const start = e.local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true)
    const raw = file.slice(start, start + e.size, type)
    if (e.method === 0) return raw
    if (e.method === 8) {
      const b = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob()
      return new Blob([b], { type })
    }
    throw new Error('Непідтримуваний формат стиснення')
  }

  const metaEntry = entries.get('backup.json')
  if (!metaEntry) throw new Error('В архіві немає backup.json')
  const meta = JSON.parse(await (await dataOf(metaEntry)).text())
  if (meta.app !== APP) throw new Error('Це резервна копія іншого застосунку')

  return {
    meta,
    async blob(key) {
      const f = meta.files?.[key]
      const e = f && entries.get(f.path)
      return e ? dataOf(e, f.type) : null
    },
  }
}

// mode: 'merge' — додати відсутнє, 'replace' — замінити все
export async function applyBackup(backup, mode, onProgress) {
  const { meta } = backup
  const { items: curItems, themes: curThemes } = getState()
  const haveItems = mode === 'merge' ? new Set(curItems.map((i) => i.id)) : new Set()
  const haveThemes = mode === 'merge' ? new Set(curThemes.map((t) => t.id)) : new Set()
  const items = (meta.items || []).filter((i) => !haveItems.has(i.id)).map((i) => ({ ...newItem(), ...i }))
  const themes = (meta.themes || []).filter((t) => !haveThemes.has(t.id))
  const owners = new Set([...items.map((i) => i.id), ...themes.map((t) => t.id)])
  const keys = Object.keys(meta.files || {}).filter((k) => owners.has(k.slice(2)))

  if (mode === 'replace') await DB.clearAll()
  for (let i = 0; i < keys.length; i += 10) {
    const batch = keys.slice(i, i + 10)
    const blobs = await Promise.all(batch.map((k) => backup.blob(k)))
    await DB.putFiles(batch.map((k, j) => [k, blobs[j]]))
    onProgress?.(Math.min(i + 10, keys.length), keys.length)
  }
  await DB.putMany('themes', themes)
  await DB.putMany('items', items)
  await load()
  return { items: items.length, themes: themes.length }
}
