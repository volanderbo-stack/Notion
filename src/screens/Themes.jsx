// Список тем (альбомів) верхнього рівня
import { useMemo, useState } from 'react'
import { ArrowUpDown, Check, Inbox, LayoutGrid, Plus } from 'lucide-react'
import { Header, Empty } from '../components/Chrome'
import { ReorderList, ThemeCard } from '../components/ThemeParts'
import { createTheme, reorderThemes, useStore } from '../lib/store'
import { childThemes, isLive } from '../lib/selectors'
import { openThemeEditor } from '../lib/ui'
import { navigate } from '../lib/nav'
import { pluralItems } from '../lib/format'

const STARTERS = [
  { name: 'Тренування', emoji: '💪', color: '#ef4444' },
  { name: 'Французька', emoji: '🇫🇷', color: '#3b82f6' },
  { name: 'Рецепти', emoji: '🍳', color: '#f97316' },
  { name: 'Інвестиції', emoji: '📈', color: '#22c55e' },
]

export default function Themes() {
  const themes = useStore((s) => s.themes)
  const items = useStore((s) => s.items)
  const top = useMemo(() => childThemes(themes, null), [themes])
  const unsorted = useMemo(() => items.filter((i) => isLive(i) && !i.themeIds.length).length, [items])
  const [reorder, setReorder] = useState(false)

  return (
    <>
      <Header
        title="Теми"
        subtitle={top.length ? `${top.length} ${top.length === 1 ? 'тема' : top.length < 5 ? 'теми' : 'тем'}` : null}
        right={
          <>
            {top.length > 1 && (
              <button className={`icon-btn ${reorder ? 'is-active' : ''}`} onClick={() => setReorder(!reorder)} aria-label="Змінити порядок">
                {reorder ? <Check size={21} /> : <ArrowUpDown size={21} />}
              </button>
            )}
            <button className="icon-btn" onClick={() => openThemeEditor({})} aria-label="Нова тема"><Plus size={22} /></button>
          </>
        }
      />
      {reorder ? (
        <div className="pad">
          <p className="hint">Перетягуйте за ручку праворуч, щоб змінити порядок.</p>
          <ReorderList themes={top} onReorder={reorderThemes} />
        </div>
      ) : top.length ? (
        <div className="theme-grid pad">
          {top.map((t) => <ThemeCard key={t.id} theme={t} />)}
          <button className="theme-card theme-card-new" onClick={() => openThemeEditor({})}>
            <span className="theme-cover"><Plus size={30} /></span>
            <span className="theme-card-info"><span className="theme-card-name">Нова тема</span></span>
          </button>
          {unsorted > 0 && (
            <button className="theme-card theme-card-new" onClick={() => navigate('/unsorted')}>
              <span className="theme-cover"><Inbox size={28} /></span>
              <span className="theme-card-info">
                <span className="theme-card-name">Без теми</span>
                <span className="theme-card-meta">{pluralItems(unsorted)}</span>
              </span>
            </button>
          )}
        </div>
      ) : (
        <Empty Icon={LayoutGrid} title="Створіть першу тему" text="Теми — це альбоми для всього, що варто зберегти: фото, відео, посилань і нотаток.">
          <button className="btn btn-primary" onClick={() => openThemeEditor({})}><Plus size={18} /> Нова тема</button>
          <div className="starter-row">
            {STARTERS.map((s) => (
              <button key={s.name} className="chip" style={{ '--tc': s.color }} onClick={() => createTheme(s)}>{s.emoji} {s.name}</button>
            ))}
          </div>
        </Empty>
      )}
    </>
  )
}
