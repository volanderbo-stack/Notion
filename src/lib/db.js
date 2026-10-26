// Єдиний модуль, що звертається до IndexedDB.
// Сховища: items (метадані), themes (теми), files (Blob-и за ключем),
// meta (налаштування галереї, напр. назви сердечок), outbox (що ще не надіслано в спільну галерею).
// Ключі файлів: o:<id> — оригінал, t:<id> — мініатюра, e:<id> — відредаговане фото, c:<themeId> — обкладинка теми.
import { openDB } from 'idb'

let dbp
export function db() {
  if (!dbp) {
    dbp = openDB('rozumna-galereya', 2, {
      upgrade(d, old) {
        if (old < 1) {
          d.createObjectStore('items', { keyPath: 'id' })
          d.createObjectStore('themes', { keyPath: 'id' })
          d.createObjectStore('files')
        }
        if (old < 2) {
          d.createObjectStore('meta')
          d.createObjectStore('outbox')
        }
      },
      // Оновлення бази чекає, поки закриється стара версія застосунку в іншій вкладці
      blocked() {
        window.dispatchEvent(new Event('galereya:db-blocked'))
      },
      // Нова версія в іншій вкладці хоче оновити базу — звільняємо її і перезавантажуємось
      blocking(_cur, _next, e) {
        e.target.close()
        location.reload()
      },
    })
  }
  return dbp
}

export const fileKey = {
  orig: (id) => 'o:' + id,
  thumb: (id) => 't:' + id,
  edit: (id) => 'e:' + id,
  cover: (themeId) => 'c:' + themeId,
}

export async function getAll(store) {
  return (await db()).getAll(store)
}

export async function putMany(store, values) {
  if (!values.length) return
  const tx = (await db()).transaction(store, 'readwrite')
  for (const v of values) tx.store.put(v)
  await tx.done
}

export async function delMany(store, keys) {
  if (!keys.length) return
  const tx = (await db()).transaction(store, 'readwrite')
  for (const k of keys) tx.store.delete(k)
  await tx.done
}

// Якщо файлу немає локально — спільна галерея може його докачати
let fileFallback = null
export const setFileFallback = (fn) => { fileFallback = fn }

export async function getFile(key) {
  const blob = await getLocalFile(key)
  if (blob || !fileFallback) return blob
  return fileFallback(key)
}

export async function getLocalFile(key) {
  return (await db()).get('files', key)
}

export async function hasFile(key) {
  return !!(await (await db()).getKey('files', key))
}

export async function putFile(key, blob) {
  return (await db()).put('files', blob, key)
}

export async function putFiles(entries) {
  const tx = (await db()).transaction('files', 'readwrite')
  for (const [k, blob] of entries) if (blob) tx.store.put(blob, k)
  await tx.done
}

export async function fileKeys() {
  return (await db()).getAllKeys('files')
}

export async function getMeta(key) {
  return (await db()).get('meta', key)
}

export async function putMeta(key, value) {
  return (await db()).put('meta', value, key)
}

// outbox: ключ → { kind: 'item'|'theme'|'meta'|'file'|'unfile', id }
export async function outboxAll() {
  const d = await db()
  const [keys, values] = await Promise.all([d.getAllKeys('outbox'), d.getAll('outbox')])
  return keys.map((k, i) => [k, values[i]])
}

export async function outboxPut(entries) {
  if (!entries.length) return
  const tx = (await db()).transaction('outbox', 'readwrite')
  for (const [k, v] of entries) tx.store.put(v, k)
  await tx.done
}

// Прибрати надіслане — лише якщо поки надсилали, запис не змінився знову
export async function outboxDone(entries) {
  if (!entries.length) return
  const tx = (await db()).transaction('outbox', 'readwrite')
  await Promise.all(entries.map(async ([k, v]) => {
    const cur = await tx.store.get(k)
    if (cur && cur.seq === v.seq) await tx.store.delete(k)
  }))
  await tx.done
}

export async function outboxClear() {
  return (await db()).clear('outbox')
}

export async function clearAll() {
  const d = await db()
  const stores = ['items', 'themes', 'files', 'meta']
  const tx = d.transaction(stores, 'readwrite')
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()))
  await tx.done
}
