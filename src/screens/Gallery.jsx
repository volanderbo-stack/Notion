// Головний екран: усі фото й відео сіткою, згруповані за датами
import { useMemo } from 'react'
import { Grid2x2, Grid3x3, LayoutGrid, Settings, Plus, Images } from 'lucide-react'
import { Header, Empty } from '../components/Chrome'
import ItemGrid, { cycleGrid } from '../components/ItemGrid'
import SelectionBar, { SelectionHeader } from '../components/SelectionBar'
import { useStore } from '../lib/store'
import { isLive, isMedia, sortItems } from '../lib/selectors'
import { useSettings } from '../lib/settings'
import { useSelection } from '../lib/hooks'
import { navigate } from '../lib/nav'
import { openAdd } from '../lib/ui'
import { plural } from '../lib/format'

const GRID_ICON = { 3: Grid2x2, 5: Grid3x3, 7: LayoutGrid }

export default function Gallery() {
  const items = useStore((s) => s.items)
  const { galleryAll, grid } = useSettings()
  const list = useMemo(() => sortItems(items.filter((i) => isLive(i) && (galleryAll || isMedia(i))), 'new'), [items, galleryAll])
  const sel = useSelection()
  const ids = useMemo(() => list.map((i) => i.id), [list])
  const GridIcon = GRID_ICON[grid] || Grid3x3
  const photos = list.filter((i) => i.type === 'photo').length
  const videos = list.filter((i) => i.type === 'video').length

  return (
    <>
      {sel.active ? (
        <header className="header is-selecting"><SelectionHeader selection={sel} allIds={ids} /></header>
      ) : (
        <Header
          title="Галерея"
          subtitle={galleryAll ? plural(list.length, ['елемент', 'елементи', 'елементів']) : `${plural(photos, ['фото', 'фото', 'фото'])} · ${plural(videos, ['відео', 'відео', 'відео'])}`}
          right={
            <>
              <button className="icon-btn" onClick={cycleGrid} aria-label={`Розмір сітки: ${grid} в ряд`} title="Розмір сітки (або щипок)"><GridIcon size={21} /></button>
              <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="Налаштування"><Settings size={21} /></button>
            </>
          }
        />
      )}
      {list.length ? (
        <ItemGrid items={list} selection={sel} />
      ) : (
        <Empty Icon={Images} title="Тут поки порожньо" text="Додайте фото й відео з телефону, посилання або нотатки — і розкладіть їх по темах.">
          <button className="btn btn-primary" onClick={() => openAdd()}><Plus size={18} /> Додати</button>
        </Empty>
      )}
      {sel.active && <SelectionBar selection={sel} />}
    </>
  )
}
