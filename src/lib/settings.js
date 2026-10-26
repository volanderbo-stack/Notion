// Налаштування в localStorage (дрібні, на одному пристрої)
import { useSyncExternalStore } from 'react'

const KEY = 'galereya:settings'
const defaults = {
  themeMode: 'system', // system | light | dark
  grid: 3, // 3 | 5 | 7
  linkPreviews: true, // завантажувати превʼю посилань через microlink.io
  galleryAll: false, // показувати в галереї не лише фото й відео
  sort: 'new',
  favHeart: null, // останній вибраний колір у «Сердечках»
}

function read() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...defaults } }
}

let settings = read()
const listeners = new Set()

export function setSetting(key, value) {
  settings = { ...settings, [key]: value }
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* приватний режим */ }
  listeners.forEach((l) => l())
}

export const getSettings = () => settings
export function useSettings() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => settings)
}
