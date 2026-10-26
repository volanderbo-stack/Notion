// Тема: обкладинка, підтеми, елементи (разом з елементами підтем)
import { useMemo, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, MoreVertical, Pencil, Plus, ArrowUpDown, FolderPlus, Trash2, SortDesc, Inbox } from 'lucide-react'
import { Header, Empty } from '../components/Chrome'
import ItemGrid from '../components/ItemGrid'
import SelectionBar, { SelectionHeader } from '../components/SelectionBar'
import { ReorderList, ThemeCard, ThemeCover, confirmDeleteTheme } from '../components/ThemeParts'
import { reorderThemes, useStore } from '../lib/store'
import { childThemes, isLive, sortItems, themeItems, themePath } from '../lib/selectors'
import { choose, openAdd, openThemeEditor } from '../lib/ui'
import { navigate } from '../lib/nav'
import { useSelection } from '../lib/hooks'
import { TYPE_LABELS, pluralItems } from '../lib/format'

export const SORTS = [
  { id: 'new', label: 'Спочатку нові' },
  { id: 'old', label: 'Спочатку старі' },
  { id: 'name', label: 'За назвою' },
  { id: 'fav', label: 'Спочатку улюблені' },
]

export async function pickSort(current) {
  return choose({ title: 'Сортування', actions: SORTS.map((s) => ({ ...s, active: s.id === current, label: (s.id === current ? '✓ ' : '') + s.label })) })
}

function TypeChips({ items, value, onChange }) {
  const types = [...new Set(items.map((i) => i.type))]
  if (types.length < 2) return null
  return (
    <div className="chips scroll pad-x">
      <button className={`chip ${!value ? 'is-active' : ''}`} onClick={() => onChange(null)}>Усе</button>
      {Object.keys(TYPE_LABELS).filter((t) => types.includes(t)).map((t) => (
        <button key={t} className={`chip ${value === t ? 'is-active' : ''}`} onClick={() => onChange(t)}>{TYPE_LABELS[t]}</button>
      ))}
    </div>
  )
}

export default function ThemeDetail({ id }) {
  const themes = useStore((s) => s.themes)
  const items = useStore((s) => s.items)
  const theme = themes.find((t) => t.id === id)
  const [sort, setSort] = useState('new')
  const [type, setType] = useState(null)
  const [reorder, setReorder] = useState(false)
  const sel = useSelection()

  const subs = useMemo(() => childThemes(themes, id), [themes, id])
  const all = useMemo(() => (theme ? themeItems(items, themes, id) : []), [items, themes, id, theme])
  const list = useMemo(() => sortItems(type ? all.filter((i) => i.type === type) : all, sort), [all, type, sort])
  const ids = useMemo(() => list.map((i) => i.id), [list])

  if (!theme) {
    return (
      <>
        <Header title="Тема" left={<button className="icon-btn" onClick={() => navigate('/themes')} aria-label="Назад"><ArrowLeft size={22} /></button>} />
        <Empty title="Тему не знайдено" text="Можливо, її видалено." />
      </>
    )
  }
  const path = themePath(themes, id)
  const back = () => navigate(theme.parentId ? '/theme/' + theme.parentId : '/themes')

  const menu = async () => {
    const r = await choose({
      title: `${theme.emoji} ${theme.name}`,
      actions: [
        { id: 'edit', label: 'Редагувати тему', Icon: Pencil },
        { id: 'sub', label: 'Нова підтема', Icon: FolderPlus },
        subs.length > 1 && { id: 'reorder', label: 'Порядок підтем', Icon: ArrowUpDown },
        { id: 'sort', label: 'Сортування', Icon: SortDesc },
        { id: 'delete', label: 'Видалити тему', Icon: Trash2, danger: true },
      ].filter(Boolean),
    })
    if (r === 'edit') openThemeEditor({ id })
    if (r === 'delete') confirmDeleteTheme(theme)
    if (r === 'sub') openThemeEditor({ parentId: id })
    if (r === 'reorder') setReorder(true)
    if (r === 'sort') { const s = await pickSort(sort); if (s) setSort(s) }
  }

  return (
    <>
      {sel.active ? (
        <header className="header is-selecting"><SelectionHeader selection={sel} allIds={ids} /></header>
      ) : (
        <Header
          title={`${theme.emoji} ${theme.name}`}
          left={<button className="icon-btn" onClick={back} aria-label="Назад"><ArrowLeft size={22} /></button>}
          right={
            <>
              <button className="icon-btn" onClick={() => openAdd(id)} aria-label="Додати в тему"><Plus size={22} /></button>
              <button className="icon-btn" onClick={menu} aria-label="Меню теми"><MoreVertical size={21} /></button>
            </>
          }
        />
      )}

      <div className="theme-hero" style={{ '--tc': theme.color }}>
        <ThemeCover theme={theme} className="hero" />
        <div className="theme-hero-info">
          {path.length > 1 && (
            <div className="crumbs">
              {path.slice(0, -1).map((t) => (
                <button key={t.id} onClick={() => navigate('/theme/' + t.id)}>{t.emoji} {t.name}<ChevronRight size={14} /></button>
              ))}
            </div>
          )}
          <div className="theme-hero-name">{theme.emoji} {theme.name}</div>
          <div className="theme-hero-meta">{pluralItems(all.length)}{subs.length ? ` · підтем: ${subs.length}` : ''}</div>
        </div>
      </div>

      {reorder ? (
        <div className="pad">
          <div className="label-row">
            <span className="label">Порядок підтем</span>
            <button className="btn small btn-primary" onClick={() => setReorder(false)}><Check size={16} /> Готово</button>
          </div>
          <ReorderList themes={subs} onReorder={reorderThemes} />
        </div>
      ) : (
        <div className="sub-row">
          {subs.map((t) => <ThemeCard key={t.id} theme={t} />)}
          <button className="theme-card theme-card-new" onClick={() => openThemeEditor({ parentId: id })}>
            <span className="theme-cover"><Plus size={24} /></span>
            <span className="theme-card-info"><span className="theme-card-name">Підтема</span></span>
          </button>
        </div>
      )}

      <TypeChips items={all} value={type} onChange={setType} />
      {sort !== 'new' && (
        <div className="pad-x hint">{SORTS.find((s) => s.id === sort).label} · <button className="link-btn" onClick={() => setSort('new')}>скинути</button></div>
      )}

      {list.length ? (
        <ItemGrid items={list} grouped={sort === 'new' || sort === 'old'} selection={sel} />
      ) : (
        <Empty title="У темі поки нічого" text="Додайте сюди фото, відео, посилання чи нотатку.">
          <button className="btn btn-primary" onClick={() => openAdd(id)}><Plus size={18} /> Додати</button>
        </Empty>
      )}
      {sel.active && <SelectionBar selection={sel} themeId={id} />}
    </>
  )
}

export function Unsorted() {
  const items = useStore((s) => s.items)
  const list = useMemo(() => sortItems(items.filter((i) => isLive(i) && !i.themeIds.length), 'new'), [items])
  const sel = useSelection()
  const ids = useMemo(() => list.map((i) => i.id), [list])
  return (
    <>
      {sel.active ? (
        <header className="header is-selecting"><SelectionHeader selection={sel} allIds={ids} /></header>
      ) : (
        <Header title="Без теми" subtitle={pluralItems(list.length)} left={<button className="icon-btn" onClick={() => navigate('/themes')} aria-label="Назад"><ArrowLeft size={22} /></button>} />
      )}
      {list.length ? <ItemGrid items={list} selection={sel} /> : <Empty Icon={Inbox} title="Усе розкладено по темах 🎉" />}
      {sel.active && <SelectionBar selection={sel} />}
    </>
  )
}
