// Кеш object URL для файлів з IndexedDB
import { useEffect, useState } from 'react'
import { getFile } from './db'

const urls = new Map() // ключ#версія → url | null
const pending = new Map()
const bigOrder = [] // великі файли (оригінали) — тримаємо лише кілька останніх
const BIG_LIMIT = 8

const ck = (key, v) => key + '#' + (v || 0)

export function fileUrl(key, v) {
  const k = ck(key, v)
  if (urls.has(k)) return Promise.resolve(urls.get(k))
  if (pending.has(k)) return pending.get(k)
  const p = getFile(key).then((blob) => {
    const u = blob ? URL.createObjectURL(blob) : null
    urls.set(k, u)
    pending.delete(k)
    if (u && !key.startsWith('t:') && !key.startsWith('c:')) {
      bigOrder.push(k)
      while (bigOrder.length > BIG_LIMIT) {
        const old = bigOrder.shift()
        const ou = urls.get(old)
        if (ou) URL.revokeObjectURL(ou)
        urls.delete(old)
      }
    }
    return u
  })
  pending.set(k, p)
  return p
}

export function useFileUrl(key, v, enabled = true) {
  const k = key ? ck(key, v) : null
  const [state, setState] = useState(() => ({ k, url: k ? urls.get(k) : null }))
  useEffect(() => {
    if (!key || !enabled) return
    let alive = true
    fileUrl(key, v).then((url) => alive && setState({ k: ck(key, v), url }))
    return () => { alive = false }
  }, [key, v, enabled])
  if (!k) return null
  if (state.k === k) return state.url
  return urls.get(k) ?? undefined
}
