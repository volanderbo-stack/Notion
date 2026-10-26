// Стан застосунку в пам'яті + збереження в IndexedDB.
// Компоненти читають через useStore(selector), змінюють — лише через функції цього модуля.
import { useSyncExternalStore } from 'react'
import * as DB from './db'
import { fileKey } from './db'

export const TRASH_DAYS = 30

let state = { ready: false, items: [], themes: [] }
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

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

export async function load() {
  const [items, themes] = await Promise.all([DB.getAll('items'), DB.getAll('themes')])
  setState({ ready: true, items, themes })
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
    caption: '', note: '', tags: [], themeIds: [], favorite: false, deletedAt: null,
    mime: '', size: 0, name: '', width: 0, height: 0, duration: 0,
    url: '', linkTitle: '', linkDesc: '', linkImage: '', text: '',
    hasThumb: false, thumbV: 0, edits: null,
    ...fields,
  }
}

// files: { orig?: Blob, thumb?: Blob }
export async function addItem(item, files = {}) {
  await DB.putFiles([[fileKey.orig(item.id), files.orig], [fileKey.thumb(item.id), files.thumb]])
  await DB.putMany('items', [item])
  setState({ items: [...state.items, item] })
  return item
}

export async function updateItems(ids, fn) {
  const set = new Set(ids)
  const changed = []
  const items = state.items.map((it) => {
    if (!set.has(it.id)) return it
    const next = { ...it, ...fn(it), updatedAt: Date.now() }
    changed.push(next)
    return next
  })
  setState({ items })
  await DB.putMany('items', changed)
}

export const updateItem = (id, patch) => updateItems([id], () => patch)

export const toggleFavorite = (ids, value) => updateItems(ids, () => ({ favorite: value }))

export const trashItems = (ids) => updateItems(ids, () => ({ deletedAt: Date.now() }))
export const restoreItems = (ids) => updateItems(ids, () => ({ deletedAt: null }))

export async function purgeItems(ids) {
  const set = new Set(ids)
  setState({
    items: state.items.filter((i) => !set.has(i.id)),
    themes: state.themes.map((t) => (set.has(t.coverItemId) ? { ...t, coverItemId: null } : t)),
  })
  await DB.delMany('items', ids)
  await DB.delMany('files', ids.flatMap((id) => [fileKey.orig(id), fileKey.thumb(id), fileKey.edit(id)]))
  await DB.putMany('themes', state.themes)
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
  const it = state.items.find((i) => i.id === id)
  await updateItem(id, { edits, thumbV: (it?.thumbV || 0) + 1, hasThumb: true })
}

// ---------- Теми ----------

export async function createTheme(fields) {
  const siblings = state.themes.filter((t) => (t.parentId || null) === (fields.parentId || null))
  const theme = {
    id: uid(), name: 'Нова тема', emoji: '📁', color: '#7c5cff', parentId: null,
    coverItemId: null, hasCover: false, coverV: 0, createdAt: Date.now(),
    order: siblings.reduce((m, t) => Math.max(m, t.order), -1) + 1,
    ...fields,
  }
  setState({ themes: [...state.themes, theme] })
  await DB.putMany('themes', [theme])
  return theme
}

export async function updateTheme(id, patch) {
  let next
  setState({ themes: state.themes.map((t) => (t.id === id ? (next = { ...t, ...patch }) : t)) })
  if (next) await DB.putMany('themes', [next])
}

export async function setThemeCoverFile(id, blob) {
  if (blob) await DB.putFile(fileKey.cover(id), blob)
  else await DB.delMany('files', [fileKey.cover(id)])
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
  await updateItems(affected, (it) => ({ themeIds: it.themeIds.filter((t) => !ids.has(t)) }))
}

export async function reorderThemes(orderedIds) {
  const pos = new Map(orderedIds.map((id, i) => [id, i]))
  const changed = []
  setState({
    themes: state.themes.map((t) => {
      if (!pos.has(t.id) || t.order === pos.get(t.id)) return t
      const n = { ...t, order: pos.get(t.id) }
      changed.push(n)
      return n
    }),
  })
  await DB.putMany('themes', changed)
}

// ---------- Резервна копія ----------

export async function replaceAll(items, themes) {
  setState({ items, themes })
}
