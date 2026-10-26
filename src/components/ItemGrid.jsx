// Сітка елементів з групами за датами; щипок (або Ctrl+коліщатко) змінює кількість колонок 3 → 5 → 7
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'
import Tile from './Tile'
import { groupByDate } from '../lib/selectors'
import { setSetting, getSettings, useSettings } from '../lib/settings'
import { openViewer } from '../lib/ui'

const SIZES = [3, 5, 7]

export function changeGrid(dir) {
  const cur = getSettings().grid
  const i = SIZES.indexOf(cur)
  const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))]
  if (next === cur) return
  const apply = () => setSetting('grid', next)
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(() => flushSync(apply))
  } else apply()
}

export function cycleGrid() {
  const cur = getSettings().grid
  changeGrid(cur === 7 ? -2 : 1)
}

function usePinchGrid(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start = 0
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onStart = (e) => { if (e.touches.length === 2) start = dist(e.touches) }
    const onMove = (e) => {
      if (e.touches.length !== 2 || !start) return
      e.preventDefault()
      const r = dist(e.touches) / start
      if (r > 1.25) { changeGrid(-1); start = dist(e.touches) }
      else if (r < 0.8) { changeGrid(1); start = dist(e.touches) }
    }
    const onEnd = (e) => { if (e.touches.length < 2) start = 0 }
    let wheelAcc = 0
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      wheelAcc += e.deltaY
      if (wheelAcc < -40) { changeGrid(-1); wheelAcc = 0 }
      else if (wheelAcc > 40) { changeGrid(1); wheelAcc = 0 }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('wheel', onWheel)
    }
  }, [ref])
}

export default function ItemGrid({ items, grouped = true, selection, onTap, badge, cols: fixedCols }) {
  const { grid } = useSettings()
  const cols = fixedCols || grid
  const ref = useRef()
  usePinchGrid(ref)
  const groups = useMemo(() => (grouped ? groupByDate(items) : [{ key: 'all', label: null, items }]), [items, grouped])
  const ids = useMemo(() => items.map((i) => i.id), [items])

  const tap = useCallback(
    (item) => {
      if (selection?.active) selection.toggle(item.id)
      else if (onTap) onTap(item)
      else openViewer(ids, ids.indexOf(item.id))
    },
    [selection, onTap, ids],
  )
  const long = useCallback((item) => {
    if (!selection) return
    if (selection.active) selection.toggle(item.id)
    else selection.start(item.id)
  }, [selection])

  return (
    <div ref={ref} className={`grid-wrap cols-${cols}`} style={{ '--cols': cols }}>
      {groups.map((g) => {
        const allSel = selection?.active && g.items.every((i) => selection.has(i.id))
        return (
          <section key={g.key} className="grid-section">
            {g.label && (
              <div className="grid-label">
                <span>{g.label}</span>
                {selection?.active && (
                  <button
                    className="link-btn"
                    onClick={() => {
                      const set = new Set(selection.ids)
                      g.items.forEach((i) => (allSel ? set.delete(i.id) : set.add(i.id)))
                      selection.setAll([...set])
                    }}
                  >
                    {allSel ? 'Зняти' : 'Вибрати'}
                  </button>
                )}
              </div>
            )}
            <div className="grid">
              {g.items.map((it) => (
                <Tile
                  key={it.id}
                  item={it}
                  cols={cols}
                  selecting={!!selection?.active}
                  selected={!!selection?.has(it.id)}
                  onTap={tap}
                  onLong={long}
                  badge={badge?.(it)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
