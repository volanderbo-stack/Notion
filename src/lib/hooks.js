// Спільні хуки: поява/зникнення з анімацією, видимість у вікні, вибір кількох елементів
import { useEffect, useRef, useState } from 'react'
import { useBackClose } from './nav'

// Тримає компонент змонтованим, поки грає анімація закриття
export function usePresence(open, ms = 260) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (open) {
      setMounted(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(r)
    }
    setVisible(false)
    const t = setTimeout(() => setMounted(false), ms)
    return () => clearTimeout(t)
  }, [open, ms])
  return { mounted, visible }
}

// Поки відкрита шторка чи перегляд, сторінка під ними не прокручується
let locks = 0
export function useScrollLock(open) {
  useEffect(() => {
    if (!open) return
    if (locks++ === 0) document.documentElement.style.overflow = 'hidden'
    return () => {
      if (--locks === 0) document.documentElement.style.overflow = ''
    }
  }, [open])
}

// Один спільний IntersectionObserver на всі мініатюри
const callbacks = new WeakMap()
let observer
function getObserver() {
  if (!observer && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && callbacks.get(e.target)?.()),
      { rootMargin: '800px 0px' },
    )
  }
  return observer
}

export function useInView(ref) {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    const obs = getObserver()
    if (!el || !obs) { setSeen(true); return }
    callbacks.set(el, () => { setSeen(true); obs.unobserve(el) })
    obs.observe(el)
    return () => obs.unobserve(el)
  }, [ref])
  return seen
}

// Режим вибору кількох елементів; «Назад» скидає вибір
export function useSelection() {
  const [sel, setSel] = useState(null)
  const clear = () => setSel(null)
  useBackClose(!!sel, clear)
  return {
    active: !!sel,
    ids: sel ? [...sel] : [],
    count: sel ? sel.size : 0,
    has: (id) => !!sel?.has(id),
    start: (id) => setSel(new Set([id])),
    toggle: (id) => setSel((s) => {
      const n = new Set(s || [])
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n.size ? n : null
    }),
    setAll: (ids) => setSel(ids.length ? new Set(ids) : null),
    clear,
  }
}

// Автозбереження з затримкою
export function useDebounced(fn, ms = 400) {
  const t = useRef()
  const f = useRef(fn)
  f.current = fn
  useEffect(() => () => clearTimeout(t.current), [])
  return (...args) => {
    clearTimeout(t.current)
    t.current = setTimeout(() => f.current(...args), ms)
  }
}
