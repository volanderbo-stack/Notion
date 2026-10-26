// Каркас: заголовок екрана, нижня навігація, діалоги, тости, порожній стан
import { Component, useEffect, useRef, useState } from 'react'
import { Heart, Images, LayoutGrid, Plus, Search } from 'lucide-react'
import { navigate, useBackClose } from '../lib/nav'
import { openAdd, setUI, useUI } from '../lib/ui'
import { usePresence } from '../lib/hooks'

export function Header({ title, subtitle, left, right, children }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 4)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  return (
    <header className={`header ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="header-row">
        {left}
        <div className="header-titles">
          <h1 className="header-title">{title}</h1>
          {subtitle && <div className="header-sub">{subtitle}</div>}
        </div>
        <div className="header-actions">{right}</div>
      </div>
      {children}
    </header>
  )
}

const TABS = [
  { name: 'gallery', path: '/', label: 'Галерея', Icon: Images },
  { name: 'themes', path: '/themes', label: 'Теми', Icon: LayoutGrid },
  null,
  { name: 'favorites', path: '/favorites', label: 'Сердечка', Icon: Heart },
  { name: 'search', path: '/search', label: 'Пошук', Icon: Search },
]

export function BottomNav({ route }) {
  const active = route.name === 'theme' ? 'themes' : route.name
  return (
    <nav className="bottom-nav" aria-label="Розділи">
      {TABS.map((t) =>
        t ? (
          <button key={t.name} className={`nav-btn ${active === t.name ? 'is-active' : ''}`} onClick={() => navigate(t.path)} aria-current={active === t.name ? 'page' : undefined}>
            <t.Icon size={23} strokeWidth={active === t.name ? 2.4 : 1.9} />
            <span>{t.label}</span>
          </button>
        ) : (
          <button key="add" className="nav-add" onClick={() => openAdd(route.name === 'theme' ? route.id : null)} aria-label="Додати">
            <Plus size={28} strokeWidth={2.4} />
          </button>
        ),
      )}
    </nav>
  )
}

export function Dialog() {
  const d = useUI((u) => u.dialog)
  const [value, setValue] = useState('')
  const last = useRef(d)
  if (d) last.current = d
  const shown = last.current
  const { mounted, visible } = usePresence(!!d, 200)
  const inputRef = useRef()

  useEffect(() => {
    if (d?.input) {
      setValue(d.value || '')
      setTimeout(() => inputRef.current?.select(), 60)
    }
  }, [d])

  const finish = (result) => {
    d?.resolve(result)
    setUI({ dialog: null })
  }
  useBackClose(!!d, () => finish(shown?.input ? null : shown?.actions ? null : false))

  if (!mounted || !shown) return null
  return (
    <div className={`dialog-wrap ${visible ? 'is-open' : ''}`} role="alertdialog" aria-modal="true">
      <div className="sheet-backdrop" onClick={() => finish(shown.input || shown.actions ? null : false)} />
      <div className="dialog">
        {shown.title && <h2 className="dialog-title">{shown.title}</h2>}
        {shown.text && <p className="dialog-text">{shown.text}</p>}
        {shown.input && (
          <form onSubmit={(e) => { e.preventDefault(); finish(value.trim() || null) }}>
            <input ref={inputRef} className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={shown.placeholder} />
          </form>
        )}
        {shown.actions ? (
          <div className="dialog-list">
            {shown.actions.map((a) => (
              <button key={a.id} className={`dialog-list-btn ${a.danger ? 'danger' : ''} ${a.active ? 'is-active' : ''}`} onClick={() => finish(a.id)}>
                {a.Icon && <a.Icon size={20} />}
                {a.label}
              </button>
            ))}
            <button className="dialog-list-btn muted" onClick={() => finish(null)}>Скасувати</button>
          </div>
        ) : (
          <div className="dialog-btns">
            <button className="btn" onClick={() => finish(shown.input ? null : false)}>Скасувати</button>
            <button className={`btn ${shown.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => finish(shown.input ? value.trim() || null : true)}>
              {shown.ok}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function Toast() {
  const t = useUI((u) => u.toast)
  if (!t) return null
  return (
    <div className="toast" key={t.key} role="status">
      <span>{t.text}</span>
      {t.action && (
        <button className="toast-action" onClick={() => { setUI({ toast: null }); t.onAction?.() }}>
          {t.action}
        </button>
      )}
    </div>
  )
}

export function Empty({ Icon, title, text, children }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-icon"><Icon size={34} strokeWidth={1.6} /></div>}
      <h2 className="empty-title">{title}</h2>
      {text && <p className="empty-text">{text}</p>}
      {children}
    </div>
  )
}

export function Progress({ value, max, label }) {
  return (
    <div className="progress-box">
      {label && <div className="progress-label">{label}</div>}
      <div className="progress"><div className="progress-bar" style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></div>
    </div>
  )
}

// Якщо щось зламалося в інтерфейсі — показуємо повідомлення замість порожнього екрана
export class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { console.error(error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="empty">
        <h2 className="empty-title">Щось пішло не так</h2>
        <p className="empty-text">Ваші дані в безпеці — вони збережені на пристрої.</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>Перезавантажити</button>
      </div>
    )
  }
}
