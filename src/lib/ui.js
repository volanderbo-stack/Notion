// Глобальний стан інтерфейсу: оверлеї, тости, діалоги
import { useSyncExternalStore } from 'react'

let ui = {
  viewer: null, // { ids: [], index }
  add: null, // { themeId }
  info: null, // id елемента
  editor: null, // id фото
  picker: null, // { ids, mode: 'add'|'move', fromThemeId, onDone }
  themeEditor: null, // { id } або { parentId } для нової
  hearts: null, // { ids } — вибір кольорових сердечок
  heartLabels: false, // шторка назв сердечок
  dialog: null, // { title, text, ok, danger, input, resolve, actions }
  toast: null, // { text, action, onAction, key }
}
const listeners = new Set()

export function setUI(patch) {
  ui = { ...ui, ...patch }
  listeners.forEach((l) => l())
}
export const getUI = () => ui
export function useUI(selector) {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => selector(ui))
}

export const openViewer = (ids, index) => setUI({ viewer: { ids, index } })
export const openAdd = (themeId = null) => setUI({ add: { themeId } })
export const openInfo = (id) => setUI({ info: id })
export const openEditor = (id) => setUI({ editor: id })
export const openPicker = (ids, mode = 'add', fromThemeId = null, onDone = null) => setUI({ picker: { ids, mode, fromThemeId, onDone } })
export const openThemeEditor = (opts) => setUI({ themeEditor: opts })
export const openHearts = (ids) => setUI({ hearts: { ids } })

let toastTimer
export function toast(text, action, onAction) {
  clearTimeout(toastTimer)
  setUI({ toast: { text, action, onAction, key: Date.now() } })
  toastTimer = setTimeout(() => setUI({ toast: null }), action ? 5000 : 2600)
}

// Діалог підтвердження: await confirm({ title, text, ok, danger }) → true/false
export function confirm(opts) {
  return new Promise((resolve) => setUI({ dialog: { ok: 'Гаразд', ...opts, resolve } }))
}

// Діалог з полем: await prompt({ title, value }) → рядок або null
export function prompt(opts) {
  return new Promise((resolve) => setUI({ dialog: { ok: 'Зберегти', input: true, ...opts, resolve } }))
}

// Вибір з кількох дій: await choose({ title, actions: [{ id, label, danger }] }) → id або null
export function choose(opts) {
  return new Promise((resolve) => setUI({ dialog: { ...opts, resolve } }))
}
