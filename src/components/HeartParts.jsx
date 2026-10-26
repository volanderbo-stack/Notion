// Кольорові сердечка: значки на плитках, вибір кольору, назви категорій
import { useEffect, useState } from 'react'
import { Check, Heart, Lock, Pencil } from 'lucide-react'
import Sheet from './Sheet'
import { HEARTS, heartColor, heartLabel } from '../lib/hearts'
import { getState, setHeart, setHeartLabels, useHeartLabels, useStore } from '../lib/store'
import { setUI, useUI } from '../lib/ui'
import { useConn } from '../lib/cloud/state'

// Сердечка, накладені одне на одне (на плитці)
export function HeartIcons({ hearts, size = 13 }) {
  if (!hearts?.length) return null
  return (
    <span className="heart-stack">
      {hearts.map((h) => (
        <Heart key={h} size={size} fill={heartColor(h)} color={heartColor(h)} strokeWidth={0} />
      ))}
    </span>
  )
}

// Ряд перемикачів: використовується в додаванні й «Інфо»
export function HeartChips({ value, onToggle }) {
  const labels = useHeartLabels()
  return (
    <div className="chips wrap">
      {HEARTS.map((h) => {
        const on = value.includes(h.id)
        return (
          <button key={h.id} className={`chip heart-chip ${on ? 'is-active' : ''}`} style={{ '--tc': h.color }} onClick={() => onToggle(h.id, !on)} aria-pressed={on}>
            <Heart size={16} fill={on ? h.color : 'none'} color={h.color} /> {heartLabel(h.id, labels)}
          </button>
        )
      })}
      <button className="chip chip-dashed" onClick={() => setUI({ heartLabels: true })}><Pencil size={14} /> Назви</button>
    </div>
  )
}

// Шторка вибору сердечок для одного чи кількох елементів
export function HeartSheet() {
  const ids = useUI((u) => u.hearts?.ids)
  const items = useStore((s) => s.items)
  const labels = useHeartLabels()
  const close = () => setUI({ hearts: null })
  const sel = ids ? items.filter((i) => ids.includes(i.id)) : []

  return (
    <Sheet open={!!ids} onClose={close} title={ids?.length > 1 ? `Сердечка · ${ids.length}` : 'Сердечко'}>
      <div className="heart-list">
        {HEARTS.map((h) => {
          const n = sel.filter((i) => i.hearts.includes(h.id)).length
          const all = sel.length > 0 && n === sel.length
          return (
            <button key={h.id} className={`heart-row ${all ? 'is-on' : ''}`} style={{ '--tc': h.color }} onClick={() => setHeart(ids, h.id, !all)}>
              <Heart size={26} fill={all || n ? h.color : 'none'} color={h.color} fillOpacity={all ? 1 : n ? 0.4 : 1} />
              <span className="heart-row-label">{heartLabel(h.id, labels)}</span>
              {all && <Check size={20} className="heart-row-check" />}
            </button>
          )
        })}
      </div>
      <button className="link-btn heart-rename" onClick={() => setUI({ heartLabels: true })}><Pencil size={14} /> Змінити назви</button>
    </Sheet>
  )
}

// Назви категорій — спільні для всієї галереї
export function HeartLabelsSheet() {
  const open = useUI((u) => u.heartLabels)
  const [draft, setDraft] = useState({})
  useEffect(() => { if (open) setDraft({ ...getState().hearts.labels }) }, [open])
  const close = () => setUI({ heartLabels: false })
  const save = async () => {
    await setHeartLabels(Object.fromEntries(HEARTS.map((h) => [h.id, (draft[h.id] || '').trim()])))
    close()
  }

  return (
    <Sheet
      open={!!open}
      onClose={close}
      title="Назви сердечок"
      footer={<button className="btn btn-primary block" onClick={save}>Зберегти</button>}
    >
      <div className="form">
        <p className="hint">Кожен колір — окрема категорія. Наприклад: картки магазинів, QR-коди, документи.</p>
        {HEARTS.map((h) => (
          <label key={h.id} className="heart-label-row">
            <Heart size={24} fill={h.color} color={h.color} />
            <input className="input" value={draft[h.id] || ''} placeholder={h.name} maxLength={40} onChange={(e) => setDraft({ ...draft, [h.id]: e.target.value })} />
          </label>
        ))}
      </div>
    </Sheet>
  )
}

// «Лише на цьому телефоні»: елемент не потрапляє в спільну галерею
export function LocalOnlyToggle({ on, onChange }) {
  const conn = useConn()
  return (
    <button className={`toggle-row lock-row ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <Lock size={20} />
      <span className="setting-text">
        Лише на цьому телефоні
        <small>{on ? 'Не надсилається в спільну галерею' : conn ? 'Бачать усі учасники спільної галереї' : 'Не потрапить у спільну галерею, якщо приєднаєтесь'}</small>
      </span>
      <span className={`switch ${on ? 'is-on' : ''}`} />
    </button>
  )
}
