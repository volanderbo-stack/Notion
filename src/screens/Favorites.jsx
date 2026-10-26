// Сердечка: усі позначені елементи з фільтром за кольором і темою.
// Колір запам'ятовується — на касі відкрив вкладку і одразу бачиш потрібні картки.
import { useMemo, useState } from 'react'
import { Heart, Pencil, SortDesc } from 'lucide-react'
import { Header, Empty } from '../components/Chrome'
import ItemGrid from '../components/ItemGrid'
import SelectionBar, { SelectionHeader } from '../components/SelectionBar'
import { useHeartLabels, useStore } from '../lib/store'
import { descendantIds, isLive, sortItems, themeTree } from '../lib/selectors'
import { useSelection } from '../lib/hooks'
import { pluralItems } from '../lib/format'
import { HEARTS, heartLabel } from '../lib/hearts'
import { setSetting, useSettings } from '../lib/settings'
import { setUI } from '../lib/ui'
import { SORTS, pickSort } from './ThemeDetail'

export default function Favorites({ heart: routeHeart }) {
  const items = useStore((s) => s.items)
  const themes = useStore((s) => s.themes)
  const labels = useHeartLabels()
  const { favHeart } = useSettings()
  const [themeId, setThemeId] = useState(null)
  const [sort, setSort] = useState('new')
  const sel = useSelection()

  const favs = useMemo(() => items.filter((i) => isLive(i) && i.favorite), [items])
  const counts = useMemo(() => Object.fromEntries(HEARTS.map((h) => [h.id, favs.filter((i) => i.hearts.includes(h.id)).length])), [favs])
  const wanted = routeHeart || favHeart
  const heart = wanted && counts[wanted] ? wanted : null
  const pickHeart = (h) => setSetting('favHeart', h)

  const byHeart = useMemo(() => (heart ? favs.filter((i) => i.hearts.includes(heart)) : favs), [favs, heart])
  const chips = useMemo(
    () => themeTree(themes)
      .map(({ theme, depth }) => {
        const ids = descendantIds(themes, theme.id)
        return { theme, depth, count: byHeart.filter((i) => i.themeIds.some((t) => ids.has(t))).length }
      })
      .filter((c) => c.count > 0),
    [themes, byHeart],
  )
  const list = useMemo(() => {
    const ids = themeId ? descendantIds(themes, themeId) : null
    return sortItems(ids ? byHeart.filter((i) => i.themeIds.some((t) => ids.has(t))) : byHeart, sort)
  }, [byHeart, themes, themeId, sort])
  const ids = useMemo(() => list.map((i) => i.id), [list])
  const used = HEARTS.filter((h) => counts[h.id])

  return (
    <>
      {sel.active ? (
        <header className="header is-selecting"><SelectionHeader selection={sel} allIds={ids} /></header>
      ) : (
        <Header
          title={heart ? heartLabel(heart, labels) : 'Сердечка'}
          subtitle={pluralItems(list.length)}
          right={
            <>
              <button className="icon-btn" onClick={() => setUI({ heartLabels: true })} aria-label="Назви сердечок"><Pencil size={19} /></button>
              <button className="icon-btn" onClick={async () => { const s = await pickSort(sort); if (s) setSort(s) }} aria-label="Сортування" title={SORTS.find((s) => s.id === sort).label}><SortDesc size={21} /></button>
            </>
          }
        >
          {used.length > 0 && (
            <div className="chips scroll pad-x header-chips heart-filter">
              <button className={`chip ${!heart ? 'is-active' : ''}`} onClick={() => pickHeart(null)}>Усі · {favs.length}</button>
              {used.map((h) => (
                <button key={h.id} className={`chip heart-chip ${heart === h.id ? 'is-active' : ''}`} style={{ '--tc': h.color }} onClick={() => pickHeart(heart === h.id ? null : h.id)}>
                  <Heart size={15} fill={h.color} color={h.color} /> {heartLabel(h.id, labels)} · {counts[h.id]}
                </button>
              ))}
            </div>
          )}
          {chips.length > 1 && (
            <div className="chips scroll pad-x header-chips">
              <button className={`chip small ${!themeId ? 'is-active' : ''}`} onClick={() => setThemeId(null)}>Усі теми</button>
              {chips.map(({ theme, depth, count }) => (
                <button key={theme.id} className={`chip small ${themeId === theme.id ? 'is-active' : ''}`} style={{ '--tc': theme.color }} onClick={() => setThemeId(themeId === theme.id ? null : theme.id)}>
                  {depth ? '↳ ' : ''}{theme.emoji} {theme.name} · {count}
                </button>
              ))}
            </div>
          )}
        </Header>
      )}
      {list.length ? (
        <ItemGrid items={list} grouped={sort === 'new' || sort === 'old'} selection={sel} />
      ) : (
        <Empty Icon={Heart} title="Сердечок ще немає" text="Відкрийте фото й натисніть ❤️ — виберіть колір: картки, QR-коди, документи. Тут вони будуть під рукою." />
      )}
      {sel.active && <SelectionBar selection={sel} />}
    </>
  )
}
