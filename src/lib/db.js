// Єдиний модуль, що звертається до IndexedDB.
// Сховища: items (метадані), themes (теми), files (Blob-и за ключем).
// Ключі файлів: o:<id> — оригінал, t:<id> — мініатюра, e:<id> — відредаговане фото, c:<themeId> — обкладинка теми.
import { openDB } from 'idb'

let dbp
export function db() {
  if (!dbp) {
    dbp = openDB('rozumna-galereya', 1, {
      upgrade(d) {
        d.createObjectStore('items', { keyPath: 'id' })
        d.createObjectStore('themes', { keyPath: 'id' })
        d.createObjectStore('files')
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

export async function getFile(key) {
  return (await db()).get('files', key)
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

export async function clearAll() {
  const d = await db()
  const tx = d.transaction(['items', 'themes', 'files'], 'readwrite')
  await Promise.all([tx.objectStore('items').clear(), tx.objectStore('themes').clear(), tx.objectStore('files').clear()])
  await tx.done
}
