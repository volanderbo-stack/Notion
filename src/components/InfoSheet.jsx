// «Інфо»: дата, розмір, роздільна здатність, теми, теги, підпис і примітка (з автозбереженням)
import { useEffect, useMemo, useState } from 'react'
import { Pencil, Heart } from 'lucide-react'
import Sheet from './Sheet'
import { TagInput } from './ThemeParts'
import { toggleFavorite, updateItem, useStore } from '../lib/store'
import { allTags, themeLabel } from '../lib/selectors'
import { openPicker, setUI, useUI } from '../lib/ui'
import { navigate } from '../lib/nav'
import { useDebounced } from '../lib/hooks'
import { TYPE_LABELS, formatBytes, formatDate, formatDuration } from '../lib/format'

export default function InfoSheet() {
  const id = useUI((u) => u.info)
  const item = useStore((s) => (id ? s.items.find((i) => i.id === id) : null))
  const items = useStore((s) => s.items)
  const themes = useStore((s) => s.themes)
  const tagSugg = useMemo(() => allTags(items), [items])
  const [draft, setDraft] = useState(null)
  const save = useDebounced((itemId, patch) => updateItem(itemId, patch), 400)

  useEffect(() => {
    if (item) setDraft({ caption: item.caption, note: item.note, text: item.text })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setUI({ info: null })
  const change = (patch) => {
    setDraft((d) => ({ ...d, ...patch }))
    save(item.id, patch)
  }

  const rows = item ? [
    ['Тип', TYPE_LABELS[item.type]],
    ['Дата', formatDate(item.createdAt)],
    item.addedAt && Math.abs(item.addedAt - item.createdAt) > 60000 && ['Додано', formatDate(item.addedAt)],
    item.size > 0 && ['Розмір', formatBytes(item.size)],
    item.width > 0 && ['Роздільна здатність', `${item.width} × ${item.height}${item.width * item.height > 1e6 ? ` (${(item.width * item.height / 1e6).toFixed(1).replace('.', ',')} Мп)` : ''}`],
    item.duration > 0 && ['Тривалість', formatDuration(item.duration)],
    item.name && ['Файл', item.name],
    item.url && ['Адреса', <a key="u" href={item.url} target="_blank" rel="noopener noreferrer" className="break">{item.url}</a>],
    item.edits && ['Редагування', 'Змінено (оригінал збережено)'],
  ].filter(Boolean) : []

  return (
    <Sheet open={!!item} onClose={close} title="Інформація" full>
      {item && draft && (
        <div className="form">
          <input className="input" value={draft.caption} onChange={(e) => change({ caption: e.target.value })} placeholder={item.type === 'text' ? 'Заголовок' : 'Підпис'} />
          {item.type === 'text' && (
            <textarea className="input textarea tall" value={draft.text} onChange={(e) => change({ text: e.target.value })} placeholder="Текст" />
          )}
          <textarea className="input textarea" value={draft.note} onChange={(e) => change({ note: e.target.value })} placeholder="Примітка" />

          <button className={`toggle-row ${item.favorite ? 'is-on' : ''}`} onClick={() => toggleFavorite([item.id], !item.favorite)}>
            <Heart size={20} fill={item.favorite ? 'currentColor' : 'none'} /> {item.favorite ? 'В улюбленому' : 'Додати в улюблене'}
          </button>

          <div className="label-row">
            <label className="label">Теми</label>
            <button className="link-btn" onClick={() => openPicker([item.id], 'add')}><Pencil size={14} /> Змінити</button>
          </div>
          <div className="chips wrap">
            {item.themeIds.length === 0 && <span className="muted small">Не в жодній темі</span>}
            {item.themeIds.map((tid) => {
              const t = themes.find((x) => x.id === tid)
              return t && (
                <button key={tid} className="chip" style={{ '--tc': t.color }} onClick={() => navigate('/theme/' + tid)}>
                  {t.emoji} {themeLabel(themes, tid)}
                </button>
              )
            })}
          </div>

          <label className="label">Теги</label>
          <TagInput value={item.tags} onChange={(tags) => updateItem(item.id, { tags })} suggestions={tagSugg} />

          <dl className="info-table">
            {rows.map(([k, v]) => (
              <div key={k} className="info-row"><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </Sheet>
  )
}
