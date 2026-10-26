// Нижня шторка з затемненням; закривається свайпом вниз, тапом поза нею або «Назад»
import { useRef } from 'react'
import { X } from 'lucide-react'
import { usePresence, useScrollLock } from '../lib/hooks'
import { useBackClose } from '../lib/nav'

export default function Sheet({ open, onClose, title, children, footer, full, className = '' }) {
  const { mounted, visible } = usePresence(open)
  useBackClose(open, onClose)
  useScrollLock(open)
  const panel = useRef()
  const drag = useRef(null)

  if (!mounted) return null

  // Тягнемо за «ручку» або заголовок
  const onDown = (e) => {
    drag.current = { y: e.clientY, dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
    panel.current.style.transition = 'none'
  }
  const onMove = (e) => {
    if (!drag.current) return
    const dy = Math.max(0, e.clientY - drag.current.y)
    drag.current.dy = dy
    panel.current.style.transform = `translateY(${dy}px)`
  }
  const onUp = () => {
    if (!drag.current) return
    const { dy } = drag.current
    drag.current = null
    panel.current.style.transition = ''
    panel.current.style.transform = ''
    if (dy > 90) onClose()
  }

  return (
    <div className={`sheet-wrap ${visible ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div ref={panel} className={`sheet ${full ? 'sheet-full' : ''} ${className}`}>
        <div className="sheet-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="sheet-grip" />
          {title && (
            <div className="sheet-title-row">
              <h2 className="sheet-title">{title}</h2>
              <button className="icon-btn" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label="Закрити">
                <X size={20} />
              </button>
            </div>
          )}
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  )
}
