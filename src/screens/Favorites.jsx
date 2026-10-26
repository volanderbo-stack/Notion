// Улюблене: усі сердечка з усіх тем, з фільтром за темою
import { useMemo, useState } from 'react'
import { Heart, SortDesc } from 'lucide-react'
import { Header, Empty } from '../components/Chrome'
import ItemGrid from '../components/ItemGrid'
import SelectionBar, { SelectionHeader } from '../components/SelectionBar'
import { useStore } from '../lib/store'
import { descendantIds, isLive, sortItems, themeTree } from '../lib/selectors'
import { useSelection } from '../lib/hooks'
import { pluralItems } from '../lib/format'
import { SORTS, pickSort } from './ThemeDetail'

export default function Favorites() {
  const items = useStore((s) => s.items)
  const themes = useStore((s) => s.themes)
  const [themeId, setThemeId] = useState(null)
  const [sort, setSort] = useState('new')
  const sel = useSelection()

  const favs = useMemo(() => items.filter((i) => isLive(i) && i.favorite), [items])
  const chips = useMemo(
    () => themeTree(themes)
      .map(({ theme, depth }) => {
        const ids = descendantIds(themes, theme.id)
        return { theme, depth, count: favs.filter((i) => i.themeIds.some((t) => ids.has(t))).length }
      })
      .filter((c) => c.count > 0),
    [themes, favs],
  )
  const list = useMemo(() => {
    const ids = themeId ? descendantIds(themes, themeId) : null
    return sortItems(ids ? favs.filter((i) => i.themeIds.some((t) => ids.has(t))) : favs, sort)
  }, [favs, themes, themeId, sort])
  const ids = useMemo(() => list.map((i) => i.id), [list])

  return (
    <>
      {sel.active ? (
        <header className="header is-selecting"><SelectionHeader selection={sel} allIds={ids} /></header>
      ) : (
        <Header
          title="Улюблене"
          subtitle={pluralItems(favs.length)}
          right={<button className="icon-btn" onClick={async () => { const s = await pickSort(sort); if (s) setSort(s) }} aria-label="Сортування" title={SORTS.find((s) => s.id === sort).label}><SortDesc size={21} /></button>}
        >
          {chips.length > 0 && (
            <div className="chips scroll pad-x header-chips">
              <button className={`chip ${!themeId ? 'is-active' : ''}`} onClick={() => setThemeId(null)}>Усі · {favs.length}</button>
              {chips.map(({ theme, depth, count }) => (
                <button key={theme.id} className={`chip ${themeId === theme.id ? 'is-active' : ''}`} style={{ '--tc': theme.color }} onClick={() => setThemeId(themeId === theme.id ? null : theme.id)}>
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
        <Empty Icon={Heart} title="Сердечок ще немає" text="Натисніть ❤️ на будь-якому фото, відео чи нотатці — і воно з'явиться тут." />
      )}
      {sel.active && <SelectionBar selection={sel} />}
    </>
  )
}
