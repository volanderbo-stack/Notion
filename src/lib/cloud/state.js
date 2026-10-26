// Підключення до спільної галереї на цьому пристрої (localStorage).
// Окремий модуль без залежностей, щоб store.js міг читати ім'я учасника.
import { useSyncExternalStore } from 'react'

const KEY = 'galereya:cloud'
// { spaceId, spaceName, inviteCode, memberName, cursor }
function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}

let conn = read()
let status = { state: 'off', error: '', pending: 0, lastSync: 0, tooBig: 0 }
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())

export const getConn = () => conn
export function setConn(next) {
  conn = next ? { ...conn, ...next } : null
  try {
    if (conn) localStorage.setItem(KEY, JSON.stringify(conn))
    else localStorage.removeItem(KEY)
  } catch { /* приватний режим */ }
  emit()
}

export const getStatus = () => status
export function setStatus(patch) {
  status = { ...status, ...patch }
  emit()
}

const subscribe = (l) => (listeners.add(l), () => listeners.delete(l))
export const useConn = () => useSyncExternalStore(subscribe, () => conn)
export const useCloudStatus = () => useSyncExternalStore(subscribe, () => status)

export const memberName = () => conn?.memberName || ''
