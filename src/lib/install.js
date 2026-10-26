// Встановлення PWA: ловимо beforeinstallprompt і показуємо власну кнопку
import { useSyncExternalStore } from 'react'

let deferred = null
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
let snapshot = { canInstall: false, installed: standalone(), ios: /iphone|ipad|ipod/i.test(navigator.userAgent) }
const update = () => {
  snapshot = { ...snapshot, canInstall: !!deferred && !standalone(), installed: standalone() }
  emit()
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e
  update()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  update()
})

export async function installApp() {
  if (!deferred) return
  deferred.prompt()
  await deferred.userChoice.catch(() => {})
  deferred = null
  update()
}

export function useInstallState() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => snapshot)
}
