// Теми: обкладинка, картка, редактор, вибір теми, поле тегів
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ImagePlus, Plus, Trash2, X, GripVertical } from 'lucide-react'
import Sheet from './Sheet'
import { fileKey } from '../lib/db'
import { useFileUrl } from '../lib/urls'
import { addToThemes, createTheme, deleteTheme, getState, moveToThemes, setThemeCoverFile, updateItems, updateTheme, useStore } from '../lib/store'
import { childThemes, descendantIds, isMedia, normTag, themeItems, themeLabel, themeTree, sortItems } from '../lib/selectors'
import { confirm, setUI, toast, useUI } from '../lib/ui'
import { navigate } from '../lib/nav'
import { pluralItems } from '../lib/format'
import { imageMeta } from '../lib/media'

export const EMOJIS = ['📁', '💪', '🏋️', '🏃', '🧘', '🇫🇷', '📚', '🎓', '🍳', '🥗', '🍰', '☕', '💰', '📈', '🏠', '✈️', '🌍', '🎵', '🎬', '📷', '🎨', '✍️', '💡', '🧠', '❤️', '⭐', '🔥', '🌿', '🐾', '👶', '🛠️', '💻', '🎮', '⚽', '🚗', '🛒', '👗', '💄', '🩺', '🙏']
export const COLORS = ['#7c5cff', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#64748b']

// Звідки брати обкладинку: завантажена → вибраний елемент → перше фото/відео теми
export function useThemeCover(theme) {
  const items = useStore((s) => s.items)
  const themes = useStore((s) => s.themes)
  const auto = useMemo(() => {
    if (theme.hasCover) return null
    const chosen = theme.coverItemId && items.find((i) => i.id === theme.coverItemId && !i.deletedAt && i.hasThumb)
    if (chosen) return chosen
    return sortItems(themeItems(items, themes, theme.id).filter((i) => i.hasThumb), 'new')[0] || null
  }, [theme, items, themes])
  const coverUrl = useFileUrl(theme.hasCover ? fileKey.cover(theme.id) : null, theme.coverV)
  const itemUrl = useFileUrl(auto ? fileKey.thumb(auto.id) : null, auto?.thumbV)
  return theme.hasCover ? coverUrl : itemUrl
}

export function ThemeCover({ theme, className = '' }) {
  const url = useThemeCover(theme)
  return (
    <div className={`theme-cover ${className}`} style={{ '--tc': theme.color }}>
      {url ? <img src={url} alt="" draggable={false} /> : <span className="theme-cover-emoji">{theme.emoji}</span>}
    </div>
  )
}

export function ThemeCard({ theme, onClick }) {
  const items = useStore((s) => s.items)
  const themes = useStore((s) => s.themes)
  const count = useMemo(() => themeItems(items, themes, theme.id).length, [items, themes, theme.id])
  const subs = themes.filter((t) => t.parentId === theme.id).length
  return (
    <button className="theme-card" onClick={onClick ?? (() => navigate('/theme/' + theme.id))} style={{ '--tc': theme.color }}>
      <ThemeCover theme={theme} />
      <span className="theme-card-info">
        <span className="theme-card-name"><span className="theme-emoji">{theme.emoji}</span>{theme.name}</span>
        <span className="theme-card-meta">
          {pluralItems(count)}{subs ? ` · ${subs} ${subs === 1 ? 'підтема' : subs < 5 ? 'підтеми' : 'підтем'}` : ''}
        </span>
      </span>
    </button>
  )
}

// Перетягування для зміни порядку (вертикальний список)
export function ReorderList({ themes, onReorder }) {
  const [order, setOrder] = useState(themes.map((t) => t.id))
  const rows = useRef({})
  const drag = useRef(null)
  useEffect(() => setOrder(themes.map((t) => t.id)), [themes])
  const byId = Object.fromEntries(themes.map((t) => [t.id, t]))

  const onDown = (e, id) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rects = order.map((oid) => rows.current[oid].getBoundingClientRect())
    drag.current = { id, startY: e.clientY, from: order.indexOf(id), to: order.indexOf(id), rects }
    rows.current[id].classList.add('is-dragging')
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.startY
    const h = d.rects[d.from].height + 8
    const to = Math.max(0, Math.min(order.length - 1, d.from + Math.round(dy / h)))
    d.to = to
    order.forEach((oid, i) => {
      const el = rows.current[oid]
      if (oid === d.id) el.style.transform = `translateY(${dy}px)`
      else if (d.from < to && i > d.from && i <= to) el.style.transform = `translateY(${-h}px)`
      else if (d.from > to && i < d.from && i >= to) el.style.transform = `translateY(${h}px)`
      else el.style.transform = ''
    })
  }
  const onUp = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    Object.values(rows.current).forEach((el) => { if (el) { el.style.transform = ''; el.classList.remove('is-dragging') } })
    if (d.from !== d.to) {
      const next = [...order]
      next.splice(d.to, 0, next.splice(d.from, 1)[0])
      setOrder(next)
      onReorder(next)
    }
  }

  return (
    <div className="reorder-list">
      {order.map((id) => byId[id] && (
        <div key={id} ref={(el) => (rows.current[id] = el)} className="reorder-row" style={{ '--tc': byId[id].color }}>
          <ThemeCover theme={byId[id]} className="small" />
          <span className="reorder-name">{byId[id].emoji} {byId[id].name}</span>
          <span className="reorder-handle" onPointerDown={(e) => onDown(e, id)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label="Перетягнути">
            <GripVertical size={22} />
          </span>
        </div>
      ))}
    </div>
  )
}

// Підтвердження й видалення теми з підтемами; елементи лишаються
export async function confirmDeleteTheme(theme) {
  const subs = descendantIds(getState().themes, theme.id).size - 1
  const ok = await confirm({
    title: `Видалити «${theme.name}»?`,
    text: `${subs ? `Разом з підтемами (${subs}). ` : ''}Самі фото й нотатки залишаться в галереї.`,
    ok: 'Видалити',
    danger: true,
  })
  if (!ok) return false
  navigate(theme.parentId ? '/theme/' + theme.parentId : '/themes')
  await deleteTheme(theme.id)
  toast('Тему видалено')
  return true
}

// ---------- Редактор теми ----------
export function ThemeEditorSheet() {
  const opts = useUI((u) => u.themeEditor)
  const themes = useStore((s) => s.themes)
  const items = useStore((s) => s.items)
  const editing = opts?.id ? themes.find((t) => t.id === opts.id) : null
  const [f, setF] = useState(null)
  const [coverBlob, setCoverBlob] = useState(undefined) // undefined — без змін, null — прибрати
  const [coverPreview, setCoverPreview] = useState(null)
  const fileInput = useRef()

  useEffect(() => {
    if (!opts) return
    const t = opts.id ? themes.find((x) => x.id === opts.id) : null
    setF(t ? { name: t.name, emoji: t.emoji, color: t.color, parentId: t.parentId || '', coverItemId: t.coverItemId || null, hasCover: t.hasCover }
      : { name: '', emoji: EMOJIS[0], color: COLORS[Math.floor(Math.random() * COLORS.length)], parentId: opts.parentId || '', coverItemId: null, hasCover: false })
    setCoverBlob(undefined)
    setCoverPreview(null)
  }, [opts]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setUI({ themeEditor: null })
  const candidates = useMemo(
    () => (editing ? sortItems(themeItems(items, themes, editing.id).filter((i) => isMedia(i) && i.hasThumb), 'new').slice(0, 30) : []),
    [editing, items, themes],
  )
  const parentOptions = useMemo(() => {
    const banned = editing ? descendantIds(themes, editing.id) : new Set()
    return themeTree(themes).filter(({ theme }) => !banned.has(theme.id))
  }, [themes, editing])

  const save = async () => {
    const name = f.name.trim()
    if (!name) return toast('Вкажіть назву теми')
    const data = { name, emoji: f.emoji || '📁', color: f.color, parentId: f.parentId || null, coverItemId: f.coverItemId }
    let id = editing?.id
    if (editing) {
      if (data.parentId !== (editing.parentId || null)) {
        data.order = childThemes(themes, data.parentId).reduce((m, t) => Math.max(m, t.order), -1) + 1
      }
      await updateTheme(id, data)
    } else {
      id = (await createTheme(data)).id
      opts.onCreated?.(id)
    }
    if (coverBlob !== undefined) await setThemeCoverFile(id, coverBlob)
    close()
    if (!editing && !opts.stay) navigate('/theme/' + id)
  }

  const remove = async () => {
    if (await confirmDeleteTheme(editing)) close()
  }

  const pickFile = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    const { thumb } = await imageMeta(file)
    if (!thumb) return toast('Не вдалося відкрити зображення')
    setCoverBlob(thumb)
    setCoverPreview(URL.createObjectURL(thumb))
    setF((x) => ({ ...x, coverItemId: null, hasCover: true }))
  }

  return (
    <Sheet
      open={!!opts}
      onClose={close}
      title={editing ? 'Редагувати тему' : opts?.parentId ? 'Нова підтема' : 'Нова тема'}
      footer={f && (
        <div className="row gap">
          {editing && <button className="btn btn-danger-ghost" onClick={remove}><Trash2 size={18} /> Видалити</button>}
          <button className="btn btn-primary grow" onClick={save}>{editing ? 'Зберегти' : 'Створити'}</button>
        </div>
      )}
    >
      {f && (
        <div className="form">
          <div className="theme-preview" style={{ '--tc': f.color }}>
            <span className="theme-preview-emoji">{f.emoji}</span>
            <input className="input input-lg" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Назва, напр. «Тренування»" maxLength={60} />
          </div>

          <label className="label">Іконка</label>
          <div className="emoji-grid">
            {EMOJIS.map((em) => (
              <button key={em} className={`emoji-btn ${f.emoji === em ? 'is-active' : ''}`} onClick={() => setF({ ...f, emoji: em })}>{em}</button>
            ))}
            <input className="emoji-input" value={EMOJIS.includes(f.emoji) ? '' : f.emoji} onChange={(e) => setF({ ...f, emoji: [...e.target.value].slice(-1).join('') || '📁' })} placeholder="свій" aria-label="Свій емодзі" />
          </div>

          <label className="label">Колір</label>
          <div className="color-row">
            {COLORS.map((c) => (
              <button key={c} className={`color-btn ${f.color === c ? 'is-active' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={c}>
                {f.color === c && <Check size={16} color="#fff" strokeWidth={3} />}
              </button>
            ))}
          </div>

          <label className="label">Розташування</label>
          <select className="input" value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
            <option value="">Окрема тема (верхній рівень)</option>
            {parentOptions.map(({ theme, depth }) => (
              <option key={theme.id} value={theme.id}>{' '.repeat(depth * 3)}Підтема в: {theme.emoji} {theme.name}</option>
            ))}
          </select>

          <label className="label">Обкладинка</label>
          <div className="cover-pick">
            <button className={`cover-opt ${!f.hasCover && !f.coverItemId ? 'is-active' : ''}`} onClick={() => { setF({ ...f, coverItemId: null, hasCover: false }); setCoverBlob(editing?.hasCover ? null : undefined); setCoverPreview(null) }}>
              <span>Авто</span>
            </button>
            <button className={`cover-opt ${f.hasCover ? 'is-active' : ''}`} onClick={() => fileInput.current.click()}>
              {coverPreview ? <img src={coverPreview} alt="" /> : f.hasCover && editing?.hasCover ? <ThemeCover theme={editing} /> : <ImagePlus size={20} />}
            </button>
            {candidates.map((it) => (
              <CoverCandidate key={it.id} item={it} active={f.coverItemId === it.id && !f.hasCover} onClick={() => { setF({ ...f, coverItemId: it.id, hasCover: false }); setCoverBlob(editing?.hasCover ? null : undefined); setCoverPreview(null) }} />
            ))}
          </div>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={pickFile} />
        </div>
      )}
    </Sheet>
  )
}

function CoverCandidate({ item, active, onClick }) {
  const url = useFileUrl(fileKey.thumb(item.id), item.thumbV)
  return (
    <button className={`cover-opt ${active ? 'is-active' : ''}`} onClick={onClick}>
      {url && <img src={url} alt="" />}
    </button>
  )
}

// ---------- Вибір тем (кілька) ----------
export function ThemeChips({ value, onChange, allowCreate = true }) {
  const themes = useStore((s) => s.themes)
  const tree = useMemo(() => themeTree(themes), [themes])
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  const create = () => setUI({ themeEditor: { stay: true, onCreated: (id) => onChange([...value, id]) } })
  return (
    <div className="chips wrap">
      {tree.map(({ theme, depth }) => (
        <button key={theme.id} className={`chip ${value.includes(theme.id) ? 'is-active' : ''}`} style={{ '--tc': theme.color }} onClick={() => toggle(theme.id)} title={themeLabel(themes, theme.id)}>
          <span>{theme.emoji}</span>{depth ? <span className="chip-path">{themeLabel(themes, theme.parentId)} →</span> : null}{theme.name}
        </button>
      ))}
      {allowCreate && <button className="chip chip-dashed" onClick={create}><Plus size={14} /> Нова тема</button>}
    </div>
  )
}

export function ThemePickerSheet() {
  const p = useUI((u) => u.picker)
  const items = useStore((s) => s.items)
  const [value, setValue] = useState([])
  useEffect(() => {
    if (!p) return
    // Для одного елемента в режимі «додати» показуємо поточні теми, щоб можна було й прибрати
    const single = p.ids.length === 1 && p.mode === 'add' ? getState().items.find((i) => i.id === p.ids[0]) : null
    setValue(single ? single.themeIds : [])
  }, [p])
  const close = () => setUI({ picker: null })
  const single = p && p.ids.length === 1 && p.mode === 'add'

  const done = async () => {
    if (p.mode === 'move') {
      if (!value.length) return toast('Виберіть тему')
      await moveToThemes(p.ids, value, p.fromThemeId)
      toast(`Переміщено: ${pluralItems(p.ids.length)}`)
    } else if (single) {
      await updateItems(p.ids, () => ({ themeIds: value }))
      toast('Теми оновлено')
    } else {
      if (!value.length) return toast('Виберіть тему')
      await addToThemes(p.ids, value)
      toast(`Додано в теми: ${pluralItems(p.ids.length)}`)
    }
    p.onDone?.()
    close()
  }

  const title = !p ? '' : p.mode === 'move' ? `Перемістити ${pluralItems(p.ids.length)}` : single ? 'Теми елемента' : `Додати ${pluralItems(p.ids.length)} в тему`
  return (
    <Sheet open={!!p} onClose={close} title={title} footer={<button className="btn btn-primary block" onClick={done}>{p?.mode === 'move' ? 'Перемістити' : 'Готово'}</button>}>
      {p?.mode === 'move' && <p className="hint">{p.fromThemeId ? 'Елементи зникнуть з поточної теми й опиняться у вибраних.' : 'Елементи будуть лише у вибраних темах (з інших тем приберуться).'}</p>}
      {items && <ThemeChips value={value} onChange={setValue} />}
    </Sheet>
  )
}

// ---------- Теги ----------
export function TagInput({ value, onChange, suggestions = [] }) {
  const [text, setText] = useState('')
  const add = (raw) => {
    const t = normTag(raw)
    if (t && !value.includes(t)) onChange([...value, t])
    setText('')
  }
  const sugg = suggestions.filter((s) => !value.includes(s) && (!text || s.includes(normTag(text)))).slice(0, 8)
  return (
    <div className="tag-input">
      <div className="chips wrap">
        {value.map((t) => (
          <span key={t} className="chip is-active tag">#{t}
            <button onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Прибрати #${t}`}><X size={13} /></button>
          </span>
        ))}
        <input
          className="tag-field"
          value={text}
          onChange={(e) => {
            const v = e.target.value
            if (/[\s,]$/.test(v) && v.trim()) add(v)
            else setText(v)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (text.trim()) add(text) }
            if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => text.trim() && add(text)}
          placeholder={value.length ? '' : '#важливо, #повторити'}
        />
      </div>
      {sugg.length > 0 && (
        <div className="chips wrap sugg">
          {sugg.map((s) => <button key={s} className="chip small" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>#{s}</button>)}
        </div>
      )}
    </div>
  )
}
