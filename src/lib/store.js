// Стан застосунку в пам'яті + збереження в IndexedDB.
// Компоненти читають через useStore(selector), змінюють — лише через функції цього модуля.
// Кожна зміна повідомляється хуку синхронізації (спільна галерея), якщо він підключений.
import { useSyncExternalStore } from 'react'
import * as DB from './db'
import { fileKey } from './db'
import { DEFAULT_HEART_LABELS, sortHearts } from './hearts'
import { memberName } from './cloud/state'

export const TRASH_DAYS = 30

let state = { ready: false, items: [], themes: [], hearts: { labels: DEFAULT_HEART_LABELS, updatedAt: 0 } }
const listeners = new Set()

function setState(patch) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l))
export const getState = () => state
export function useStore(selector) {
  return useSyncExternalStore(subscribe, () => selector(state))
}
export const useHeartLabels = () => useStore((s) => s.hearts.labels)

// change: { items, themes, delItems, delThemes, files, delFiles, meta }
let changeHook = null
export const setChangeHook = (fn) => { changeHook = fn }
const changed = (c) => changeHook?.(c)

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

// Старі елементи мали лише favorite: true — це червоне сердечко
export function normItem(i) {
  const hearts = Array.isArray(i.hearts) ? i.hearts : i.favorite ? ['red'] : []
  return { ...i, hearts, favorite: hearts.length > 0 }
}

export async function load() {
  const [items, themes, hearts] = await Promise.all([DB.getAll('items'), DB.getAll('themes'), DB.getMeta('hearts')])
  setState({
    ready: true,
    items: items.map(normItem),
    themes,
    hearts: hearts ? { ...hearts, labels: { ...DEFAULT_HEART_LABELS, ...hearts.labels } } : state.hearts,
  })
  // Автоочищення кошика
  const limit = Date.now() - TRASH_DAYS * 864e5
  const old = items.filter((i) => i.deletedAt && i.deletedAt < limit).map((i) => i.id)
  if (old.length) await purgeItems(old)
}

// ---------- Елементи ----------

export function newItem(fields) {
  const now = Date.now()
  return {
    id: uid(), type: 'text', createdAt: now, addedAt: now, updatedAt: now,
    caption: '', note: '', tags: [], themeIds: [], hearts: [], favorite: false, deletedAt: null,
    mime: '', size: 0, name: '', width: 0, height: 0, duration: 0,
    url: '', linkTitle: '', linkDesc: '', linkImage: '', text: '',
    hasThumb: false, thumbV: 0, edits: null, by: memberName(),
    ...fields,
  }
}

// files: { orig?: Blob, thumb?: Blob }
export async function addItem(item, files = {}) {
  item = normItem(item)
  await DB.putFiles([[fileKey.orig(item.id), files.orig], [fileKey.thumb(item.id), files.thumb]])
  await DB.putMany('items', [item])
  setState({ items: [...state.items, item] })
  changed({
    items: [item.id],
    files: [files.orig && fileKey.orig(item.id), files.thumb && fileKey.thumb(item.id)].filter(Boolean),
  })
  return item
}

export async function updateItems(ids, fn) {
  const set = new Set(ids)
  const changedItems = []
  const items = state.items.map((it) => {
    if (!set.has(it.id)) return it
    const next = { ...it, ...fn(it), updatedAt: Date.now() }
    changedItems.push(next)
    return next
  })
  setState({ items })
  await DB.putMany('items', changedItems)
  changed({ items: changedItems.map((i) => i.id) })
}

export const updateItem = (id, patch) => updateItems([id], () => patch)

// Поставити (on=true) чи зняти сердечко кольору color
export const setHeart = (ids, color, on) =>
  updateItems(ids, (it) => {
    const hearts = sortHearts(on ? [...new Set([...it.hearts, color])] : it.hearts.filter((h) => h !== color))
    return { hearts, favorite: hearts.length > 0 }
  })

export const setHearts = (ids, hearts) => updateItems(ids, () => ({ hearts: sortHearts(hearts), favorite: hearts.length > 0 }))

export const trashItems = (ids) => updateItems(ids, () => ({ deletedAt: Date.now() }))
export const restoreItems = (ids) => updateItems(ids, () => ({ deletedAt: null }))

const itemFileKeys = (id) => [fileKey.orig(id), fileKey.thumb(id), fileKey.edit(id)]

export async function purgeItems(ids) {
  const set = new Set(ids)
  const covers = state.themes.filter((t) => set.has(t.coverItemId)).map((t) => ({ ...t, coverItemId: null, updatedAt: Date.now() }))
  setState({
    items: state.items.filter((i) => !set.has(i.id)),
    themes: state.themes.map((t) => covers.find((c) => c.id === t.id) || t),
  })
  await DB.delMany('items', ids)
  await DB.delMany('files', ids.flatMap(itemFileKeys))
  await DB.putMany('themes', covers)
  changed({ delItems: ids, delFiles: ids.flatMap(itemFileKeys), themes: covers.map((t) => t.id) })
}

export const addToThemes = (ids, themeIds) =>
  updateItems(ids, (it) => ({ themeIds: [...new Set([...it.themeIds, ...themeIds])] }))

export const removeFromTheme = (ids, themeId) =>
  updateItems(ids, (it) => ({ themeIds: it.themeIds.filter((t) => t !== themeId) }))

// Перемістити: прибрати з поточної теми (або з усіх, якщо fromThemeId не задано) і додати в нові
export const moveToThemes = (ids, themeIds, fromThemeId) =>
  updateItems(ids, (it) => {
    const keep = fromThemeId ? it.themeIds.filter((t) => t !== fromThemeId) : []
    return { themeIds: [...new Set([...keep, ...themeIds])] }
  })

export async function saveEdits(id, edits, editedBlob, thumbBlob) {
  if (editedBlob) await DB.putFiles([[fileKey.edit(id), editedBlob], [fileKey.thumb(id), thumbBlob]])
  else {
    await DB.delMany('files', [fileKey.edit(id)])
    if (thumbBlob) await DB.putFile(fileKey.thumb(id), thumbBlob)
  }
  changed({
    files: [editedBlob && fileKey.edit(id), thumbBlob && fileKey.thumb(id)].filter(Boolean),
    delFiles: editedBlob ? [] : [fileKey.edit(id)],
  })
  const it = state.items.find((i) => i.id === id)
  await updateItem(id, { edits, thumbV: (it?.thumbV || 0) + 1, hasThumb: true })
}

// ---------- Теми ----------

export async function createTheme(fields) {
  const siblings = state.themes.filter((t) => (t.parentId || null) === (fields.parentId || null))
  const theme = {
    id: uid(), name: 'Нова тема', emoji: '📁', color: '#7c5cff', parentId: null,
    coverItemId: null, hasCover: false, coverV: 0, createdAt: Date.now(), updatedAt: Date.now(),
    order: siblings.reduce((m, t) => Math.max(m, t.order), -1) + 1,
    ...fields,
  }
  setState({ themes: [...state.themes, theme] })
  await DB.putMany('themes', [theme])
  changed({ themes: [theme.id] })
  return theme
}

export async function updateTheme(id, patch) {
  let next
  setState({ themes: state.themes.map((t) => (t.id === id ? (next = { ...t, ...patch, updatedAt: Date.now() }) : t)) })
  if (next) {
    await DB.putMany('themes', [next])
    changed({ themes: [id] })
  }
}

export async function setThemeCoverFile(id, blob) {
  if (blob) await DB.putFile(fileKey.cover(id), blob)
  else await DB.delMany('files', [fileKey.cover(id)])
  changed(blob ? { files: [fileKey.cover(id)] } : { delFiles: [fileKey.cover(id)] })
  const t = state.themes.find((x) => x.id === id)
  await updateTheme(id, { hasCover: !!blob, coverV: (t?.coverV || 0) + 1, coverItemId: blob ? null : t?.coverItemId })
}

// Видаляє тему разом з підтемами; елементи лишаються, лише втрачають прив'язку
export async function deleteTheme(id) {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const t of state.themes) if (t.parentId && ids.has(t.parentId) && !ids.has(t.id)) { ids.add(t.id); grew = true }
  }
  const affected = state.items.filter((i) => i.themeIds.some((t) => ids.has(t))).map((i) => i.id)
  setState({ themes: state.themes.filter((t) => !ids.has(t.id)) })
  await DB.delMany('themes', [...ids])
  await DB.delMany('files', [...ids].map(fileKey.cover))
  changed({ delThemes: [...ids], delFiles: [...ids].map(fileKey.cover) })
  await updateItems(affected, (it) => ({ themeIds: it.themeIds.filter((t) => !ids.has(t)) }))
}

export async function reorderThemes(orderedIds) {
  const pos = new Map(orderedIds.map((id, i) => [id, i]))
  const changedThemes = []
  setState({
    themes: state.themes.map((t) => {
      if (!pos.has(t.id) || t.order === pos.get(t.id)) return t
      const n = { ...t, order: pos.get(t.id), updatedAt: Date.now() }
      changedThemes.push(n)
      return n
    }),
  })
  await DB.putMany('themes', changedThemes)
  changed({ themes: changedThemes.map((t) => t.id) })
}

// ---------- Назви сердечок ----------

export async function setHeartLabels(labels) {
  const hearts = { labels: { ...state.hearts.labels, ...labels }, updatedAt: Date.now() }
  setState({ hearts })
  await DB.putMeta('hearts', hearts)
  changed({ meta: true })
}

// ---------- Зміни з інших пристроїв (без повідомлення хуку) ----------

// r: { items, themes, delItems, delThemes, hearts, delFiles }
export async function applyRemote(r) {
  const items = (r.items || []).map(normItem)
  const themes = r.themes || []
  const delItems = new Set(r.delItems || [])
  const delThemes = new Set(r.delThemes || [])
  const itemMap = new Map(items.map((i) => [i.id, i]))
  const themeMap = new Map(themes.map((t) => [t.id, t]))
  const keepItems = state.items.filter((i) => !delItems.has(i.id) && !itemMap.has(i.id))
  const keepThemes = state.themes.filter((t) => !delThemes.has(t.id) && !themeMap.has(t.id))
  setState({
    items: [...keepItems, ...items],
    themes: [...keepThemes, ...themes],
    ...(r.hearts ? { hearts: { ...r.hearts, labels: { ...DEFAULT_HEART_LABELS, ...r.hearts.labels } } } : {}),
  })
  await DB.putMany('items', items)
  await DB.putMany('themes', themes)
  await DB.delMany('items', [...delItems])
  await DB.delMany('themes', [...delThemes])
  await DB.delMany('files', [...(r.delFiles || []), ...[...delItems].flatMap(itemFileKeys), ...[...delThemes].map(fileKey.cover)])
  if (r.hearts) await DB.putMeta('hearts', r.hearts)
}

// ---------- Резервна копія ----------

// Після імпорту: усе нове треба надіслати в спільну галерею
export function notifyImported(c) {
  changed(c)
}
