// Пошук по підписах, примітках, тегах і назвах тем + фільтри й сортування
import { useMemo, useState } from 'react'
import { Search as SearchIcon, SlidersHorizontal, X, Heart } from 'lucide-react'
import { Header, Empty } from '../components/Chrome'
import ItemGrid from '../components/ItemGrid'
import SelectionBar, { SelectionHeader } from '../components/SelectionBar'
import { useHeartLabels, useStore } from '../lib/store'
import { HEARTS, heartLabel } from '../lib/hearts'
import { allTags, searchItems, themeTree } from '../lib/selectors'
import { useSelection } from '../lib/hooks'
import { TYPE_LABELS, pluralItems } from '../lib/format'
import { SORTS } from './ThemeDetail'

const EMPTY = { q: '', types: [], themeId: '', favOnly: false, hearts: [], from: '', to: '', sort: 'new' }
let saved = { ...EMPTY } // фільтри зберігаються між переходами

export default function Search() {
  const items = useStore((s) => s.items)
  const themes = useStore((s) => s.themes)
  const labels = useHeartLabels()
  const [f, setF0] = useState(saved)
  const [panel, setPanel] = useState(false)
  const sel = useSelection()
  const setF = (patch) => setF0((x) => (saved = { ...x, ...patch }))

  const tags = useMemo(() => allTags(items).slice(0, 30), [items])
  const tree = useMemo(() => themeTree(themes), [themes])
  const activeFilters = f.types.length + (f.themeId ? 1 : 0) + (f.favOnly || f.hearts.length ? 1 : 0) + (f.from || f.to ? 1 : 0)
  const searching = f.q.trim() || activeFilters
  const results = useMemo(() => (searching ? searchItems(items, themes, f, labels) : []), [items, themes, f, searching, labels])
  const ids = useMemo(() => results.map((i) => i.id), [results])
  const toggleType = (t) => setF({ types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] })
  const addToken = (tok) => setF({ q: f.q.split(/\s+/).includes(tok) ? f.q : `${f.q} ${tok}`.trim() })

  return (
    <>
      {sel.active ? (
        <header className="header is-selecting"><SelectionHeader selection={sel} allIds={ids} /></header>
      ) : (
        <Header title="Пошук">
          <div className="search-row pad-x">
            <label className="search-box">
              <SearchIcon size={18} />
              <input type="search" value={f.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Підписи, примітки, #теги, теми…" enterKeyHint="search" />
              {f.q && <button onClick={() => setF({ q: '' })} aria-label="Очистити"><X size={16} /></button>}
            </label>
            <button className={`icon-btn boxed ${panel || activeFilters ? 'is-active' : ''}`} onClick={() => setPanel(!panel)} aria-label="Фільтри" aria-expanded={panel}>
              <SlidersHorizontal size={20} />
              {activeFilters > 0 && <span className="dot-count">{activeFilters}</span>}
            </button>
          </div>
        </Header>
      )}

      {panel && !sel.active && (
        <div className="filters pad">
          <div className="label">Тип контенту</div>
          <div className="chips wrap">
            {Object.entries(TYPE_LABELS).map(([t, l]) => (
              <button key={t} className={`chip ${f.types.includes(t) ? 'is-active' : ''}`} onClick={() => toggleType(t)}>{l}</button>
            ))}
          </div>
          <div className="filter-grid">
            <label>
              <span className="label">Тема</span>
              <select className="input" value={f.themeId} onChange={(e) => setF({ themeId: e.target.value })}>
                <option value="">Усі теми</option>
                {tree.map(({ theme, depth }) => <option key={theme.id} value={theme.id}>{' '.repeat(depth * 3)}{theme.emoji} {theme.name}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Сортування</span>
              <select className="input" value={f.sort} onChange={(e) => setF({ sort: e.target.value })}>
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Від</span>
              <input className="input" type="date" value={f.from} onChange={(e) => setF({ from: e.target.value })} />
            </label>
            <label>
              <span className="label">До</span>
              <input className="input" type="date" value={f.to} onChange={(e) => setF({ to: e.target.value })} />
            </label>
          </div>
          <span className="label">Сердечка</span>
          <div className="chips wrap">
            <button className={`chip ${f.favOnly ? 'is-active' : ''}`} onClick={() => setF({ favOnly: !f.favOnly, hearts: [] })}>
              <Heart size={15} fill={f.favOnly ? 'currentColor' : 'none'} /> Будь-яке
            </button>
            {HEARTS.map((h) => {
              const on = f.hearts.includes(h.id)
              return (
                <button key={h.id} className={`chip heart-chip ${on ? 'is-active' : ''}`} style={{ '--tc': h.color }}
                  onClick={() => setF({ favOnly: false, hearts: on ? f.hearts.filter((x) => x !== h.id) : [...f.hearts, h.id] })}>
                  <Heart size={15} fill={on ? h.color : 'none'} color={h.color} /> {heartLabel(h.id, labels)}
                </button>
              )
            })}
          </div>
          {activeFilters > 0 && <button className="link-btn" onClick={() => setF({ ...EMPTY, q: f.q })}>Скинути фільтри</button>}
        </div>
      )}

      {searching ? (
        results.length ? (
          <>
            <div className="pad-x hint result-count">Знайдено: {pluralItems(results.length)}</div>
            <ItemGrid items={results} grouped={f.sort === 'new' || f.sort === 'old'} selection={sel} />
          </>
        ) : (
          <Empty Icon={SearchIcon} title="Нічого не знайдено" text="Спробуйте інше слово або змініть фільтри." />
        )
      ) : (
        <div className="pad search-start">
          {tags.length > 0 && (
            <>
              <div className="label">Теги</div>
              <div className="chips wrap">
                {tags.map((t) => <button key={t} className="chip" onClick={() => addToken('#' + t)}>#{t}</button>)}
              </div>
            </>
          )}
          {tree.length > 0 && (
            <>
              <div className="label">Теми</div>
              <div className="chips wrap">
                {tree.map(({ theme, depth }) => (
                  <button key={theme.id} className="chip" style={{ '--tc': theme.color }} onClick={() => setF({ themeId: theme.id })}>
                    {depth ? '↳ ' : ''}{theme.emoji} {theme.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="label">Тип</div>
          <div className="chips wrap">
            {Object.entries(TYPE_LABELS).map(([t, l]) => <button key={t} className="chip" onClick={() => toggleType(t)}>{l}</button>)}
          </div>
        </div>
      )}
      {sel.active && <SelectionBar selection={sel} />}
    </>
  )
}
