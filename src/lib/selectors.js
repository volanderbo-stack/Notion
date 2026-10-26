// Чисті функції для вибірок, пошуку, сортування й групування
import { dateGroup } from './format'

export const isLive = (i) => !i.deletedAt
export const isMedia = (i) => i.type === 'photo' || i.type === 'video'

export const childThemes = (themes, parentId = null) =>
  themes.filter((t) => (t.parentId || null) === parentId).sort((a, b) => a.order - b.order)

// id теми + усіх її нащадків
export function descendantIds(themes, id) {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const t of themes) if (t.parentId && ids.has(t.parentId) && !ids.has(t.id)) { ids.add(t.id); grew = true }
  }
  return ids
}

export function themeItems(items, themes, id) {
  const ids = descendantIds(themes, id)
  return items.filter((i) => isLive(i) && i.themeIds.some((t) => ids.has(t)))
}

export function themePath(themes, id) {
  const path = []
  let t = themes.find((x) => x.id === id)
  while (t) {
    path.unshift(t)
    t = t.parentId ? themes.find((x) => x.id === t.parentId) : null
  }
  return path
}

export const themeLabel = (themes, id) => themePath(themes, id).map((t) => t.name).join(' → ')

// Плаский список тем у порядку дерева з глибиною — для списків вибору
export function themeTree(themes, parentId = null, depth = 0, out = []) {
  for (const t of childThemes(themes, parentId)) {
    out.push({ theme: t, depth })
    themeTree(themes, t.id, depth + 1, out)
  }
  return out
}

export function allTags(items) {
  const map = new Map()
  for (const i of items) if (isLive(i)) for (const t of i.tags) map.set(t, (map.get(t) || 0) + 1)
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
}

export const titleOf = (i) =>
  i.caption || i.linkTitle || (i.type === 'text' ? i.text.split('\n')[0] : '') || i.name || i.url || ''

// Нові згори; при однаковій даті — за часом додавання, потім за id (стабільний порядок)
const newer = (a, b) => b.createdAt - a.createdAt || b.addedAt - a.addedAt || (a.id < b.id ? -1 : 1)

export function sortItems(list, sort = 'new') {
  const arr = [...list]
  if (sort === 'old') arr.sort((a, b) => newer(b, a))
  else if (sort === 'name') arr.sort((a, b) => titleOf(a).localeCompare(titleOf(b), 'uk', { sensitivity: 'base' }) || newer(a, b))
  else if (sort === 'fav') arr.sort((a, b) => b.favorite - a.favorite || newer(a, b))
  else arr.sort(newer)
  return arr
}

export function groupByDate(list) {
  const groups = []
  let cur
  for (const it of list) {
    const g = dateGroup(it.createdAt)
    if (!cur || cur.key !== g.key) groups.push((cur = { ...g, items: [] }))
    cur.items.push(it)
  }
  return groups
}

export const normTag = (t) => t.trim().replace(/^#+/, '').replace(/[\s,]+/g, '_').toLowerCase()

// f: { q, types:[], themeId, favOnly, from, to (yyyy-mm-dd), sort }
export function searchItems(items, themes, f) {
  const tokens = (f.q || '').toLowerCase().split(/\s+/).filter(Boolean)
  const themeNames = new Map(themes.map((t) => [t.id, t.name.toLowerCase()]))
  const inTheme = f.themeId ? descendantIds(themes, f.themeId) : null
  const from = f.from ? new Date(f.from + 'T00:00:00').getTime() : -Infinity
  const to = f.to ? new Date(f.to + 'T23:59:59.999').getTime() : Infinity

  const res = items.filter((i) => {
    if (!isLive(i)) return false
    if (f.types?.length && !f.types.includes(i.type)) return false
    if (f.favOnly && !i.favorite) return false
    if (inTheme && !i.themeIds.some((t) => inTheme.has(t))) return false
    if (i.createdAt < from || i.createdAt > to) return false
    if (!tokens.length) return true
    const hay = [i.caption, i.note, i.text, i.name, i.url, i.linkTitle, i.linkDesc, ...i.tags.map((t) => '#' + t), ...i.themeIds.map((t) => themeNames.get(t) || '')]
      .join(' \n ').toLowerCase()
    return tokens.every((tok) => hay.includes(tok))
  })
  return sortItems(res, f.sort)
}
