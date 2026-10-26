// Маршрути через hash (#/theme/<id>) і закриття оверлеїв кнопкою «Назад»
import { useEffect, useRef, useState } from 'react'

export function parseRoute(hash) {
  const [, name = '', id] = (hash || '').replace(/^#/, '').split('/')
  return { name: name || 'gallery', id: id ? decodeURIComponent(id) : null }
}

export function useRoute() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const f = () => setHash(location.hash)
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return parseRoute(hash)
}

// Стек відкритих оверлеїв: кожен має запис в історії, «Назад» закриває верхній
const stack = []
let skip = 0
let afterPop = null

window.addEventListener('popstate', () => {
  if (skip > 0) {
    skip--
    if (!skip && afterPop) {
      const f = afterPop
      afterPop = null
      f()
    }
    return
  }
  const top = stack.pop()
  if (top) {
    top.done = true
    top.close()
  }
})

// Esc на комп'ютері = «Назад» для верхнього оверлею
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) history.back()
})

export function useBackClose(open, close) {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => {
    if (!open) return
    const entry = { done: false, close: () => ref.current() }
    stack.push(entry)
    history.pushState({ overlay: stack.length }, '')
    return () => {
      if (entry.done) return
      entry.done = true
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      skip++
      history.back()
    }
  }, [open])
}

// Перехід на екран: спершу закриваємо всі оверлеї, потім змінюємо hash
export function navigate(path) {
  const hash = '#' + path
  if (!stack.length) {
    if (location.hash !== hash) location.hash = hash
    return
  }
  const n = stack.length
  const entries = stack.splice(0)
  entries.forEach((e) => { e.done = true; e.close() })
  skip++
  afterPop = () => { if (location.hash !== hash) location.hash = hash }
  history.go(-n)
}
