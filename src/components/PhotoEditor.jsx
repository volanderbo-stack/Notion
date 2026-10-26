// Редактор фото: обрізка, поворот, яскравість, контраст. Оригінал не змінюється —
// зберігаються параметри + окремо відрендерена копія; «Скинути» повертає оригінал.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Crop, Loader2, RotateCcw, RotateCw, Sun, Undo2, X, Check, Contrast } from 'lucide-react'
import { getFile, fileKey } from '../lib/db'
import { saveEdits, useStore } from '../lib/store'
import { setUI, toast, useUI } from '../lib/ui'
import { useBackClose } from '../lib/nav'
import { usePresence, useScrollLock } from '../lib/hooks'
import { DEFAULT_EDITS, canvasToBlob, isDefaultEdits, loadBitmap, renderEdits, rotatedSize, thumbFromSource } from '../lib/media'

export default function PhotoEditor() {
  const id = useUI((u) => u.editor)
  const item = useStore((s) => (id ? s.items.find((i) => i.id === id) : null))
  const last = useRef(item)
  if (item) last.current = item
  const { mounted, visible } = usePresence(!!id, 220)
  const close = () => setUI({ editor: null })
  useBackClose(!!id, close)
  useScrollLock(!!id)
  if (!mounted || !last.current) return null
  return <EditorInner key={last.current.id} item={last.current} visible={visible} onClose={close} />
}

const ASPECTS = [
  { id: 'free', label: 'Вільно', v: null },
  { id: 'orig', label: 'Оригінал', v: 'orig' },
  { id: '1', label: '1:1', v: 1 },
  { id: '45', label: '4:5', v: 4 / 5 },
  { id: '43', label: '4:3', v: 4 / 3 },
  { id: '169', label: '16:9', v: 16 / 9 },
]
const FULL = { x: 0, y: 0, w: 1, h: 1 }
const MIN = 0.06

function EditorInner({ item, visible, onClose }) {
  const [src, setSrc] = useState(null)
  const [error, setError] = useState(false)
  const [edits, setEdits] = useState(() => ({ ...DEFAULT_EDITS, ...(item.edits || {}) }))
  const [history, setHistory] = useState([])
  const [tab, setTab] = useState('crop')
  const [aspect, setAspect] = useState('free')
  const [saving, setSaving] = useState(false)
  const [disp, setDisp] = useState({ w: 0, h: 0 })
  const box = useRef()
  const wrap = useRef()
  const canvas = useRef()
  const drag = useRef(null)

  useEffect(() => {
    let alive = true
    getFile(fileKey.orig(item.id))
      .then((b) => loadBitmap(b))
      .then((bmp) => alive && setSrc(bmp))
      .catch(() => alive && setError(true))
    return () => { alive = false }
  }, [item.id])

  const [rw, rh] = src ? rotatedSize(src, edits.rotate) : [1, 1]

  // Превʼю повернутого зображення (без обрізки й фільтрів — їх показуємо поверх)
  useLayoutEffect(() => {
    if (!src || !canvas.current) return
    const c = renderEdits(src, { ...DEFAULT_EDITS, rotate: edits.rotate }, 1600, false)
    canvas.current.width = c.width
    canvas.current.height = c.height
    canvas.current.getContext('2d').drawImage(c, 0, 0)
  }, [src, edits.rotate])

  // Розмір відображення: вписати в доступну область
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !src) return
    const fit = () => {
      const bw = el.clientWidth - 32
      const bh = el.clientHeight - 32
      const k = Math.min(bw / rw, bh / rh)
      setDisp({ w: Math.floor(rw * k), h: Math.floor(rh * k) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [src, rw, rh])

  const commit = (next) => {
    setHistory((h) => [...h.slice(-30), edits])
    setEdits(next)
  }
  const snapshot = () => setHistory((h) => [...h.slice(-30), edits])
  const undo = () => {
    if (!history.length) return
    setEdits(history[history.length - 1])
    setHistory(history.slice(0, -1))
  }

  const ratioOf = (a) => (a === 'orig' ? rw / rh : a)
  // k: співвідношення ширини до висоти в нормованих координатах
  const kOf = (a) => (ratioOf(a) * rh) / rw

  const applyAspect = (id) => {
    setAspect(id)
    const a = ASPECTS.find((x) => x.id === id).v
    if (!a) return
    const k = kOf(a)
    let w = 1
    let h = w / k
    if (h > 1) { h = 1; w = k }
    commit({ ...edits, crop: { x: (1 - w) / 2, y: (1 - h) / 2, w, h } })
  }

  const rotate = (dir) => {
    commit({ ...edits, rotate: (((edits.rotate + dir * 90) % 360) + 360) % 360, crop: null })
    setAspect('free')
  }

  // ----- перетягування рамки обрізки -----
  const onDown = (e, handle) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    snapshot()
    drag.current = { handle, x0: e.clientX, y0: e.clientY, c0: { ...(edits.crop || FULL) }, rect: wrap.current.getBoundingClientRect() }
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x0) / d.rect.width
    const dy = (e.clientY - d.y0) / d.rect.height
    const c = d.c0
    let next
    if (d.handle === 'move') {
      next = { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) }
    } else {
      // протилежний кут лишається на місці
      const ax = d.handle.includes('w') ? c.x + c.w : c.x
      const ay = d.handle.includes('n') ? c.y + c.h : c.y
      const px = clamp((d.handle.includes('w') ? c.x : c.x + c.w) + dx, 0, 1)
      const py = clamp((d.handle.includes('n') ? c.y : c.y + c.h) + dy, 0, 1)
      const right = d.handle.includes('e')
      const down = d.handle.includes('s')
      let w = Math.max(MIN, right ? px - ax : ax - px)
      let h = Math.max(MIN, down ? py - ay : ay - py)
      const a = ASPECTS.find((x) => x.id === aspect).v
      const maxW = right ? 1 - ax : ax
      const maxH = down ? 1 - ay : ay
      if (a) {
        const k = kOf(a)
        if (w / h > k) w = h * k
        else h = w / k
        if (w > maxW) { w = maxW; h = w / k }
        if (h > maxH) { h = maxH; w = h * k }
      } else {
        w = Math.min(w, maxW)
        h = Math.min(h, maxH)
      }
      next = { x: right ? ax : ax - w, y: down ? ay : ay - h, w, h }
    }
    setEdits((ed) => ({ ...ed, crop: next }))
  }
  const onUp = () => { drag.current = null }

  const save = async () => {
    if (!src) return
    setSaving(true)
    try {
      const c = edits.crop
      const crop = c && (c.x > 0.002 || c.y > 0.002 || c.w < 0.996 || c.h < 0.996) ? c : null
      const final = { ...edits, crop }
      if (isDefaultEdits(final)) {
        await saveEdits(item.id, null, null, await thumbFromSource(src))
        toast('Відновлено оригінал')
      } else {
        const out = renderEdits(src, final, 4096)
        const blob = await canvasToBlob(out, 'image/jpeg', 0.92)
        await saveEdits(item.id, final, blob, await thumbFromSource(out))
        toast('Збережено. Оригінал залишився — його можна повернути')
      }
      onClose()
    } catch (e) {
      console.error(e)
      toast('Не вдалося зберегти')
      setSaving(false)
    }
  }

  const crop = edits.crop || FULL
  const filter = `brightness(${edits.brightness}%) contrast(${edits.contrast}%)`
  const changed = !isDefaultEdits(edits)

  return (
    <div className={`editor ${visible ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Редагування фото">
      <div className="editor-top">
        <button className="icon-btn light" onClick={onClose} aria-label="Скасувати"><X size={24} /></button>
        <button className="icon-btn light" onClick={undo} disabled={!history.length} aria-label="Відмінити дію"><Undo2 size={22} /></button>
        <button className="chip-btn light" onClick={() => { commit({ ...DEFAULT_EDITS }); setAspect('free') }} disabled={!changed}>Оригінал</button>
        <button className="btn btn-primary small" onClick={save} disabled={saving || !src}>
          {saving ? <Loader2 className="spin" size={18} /> : <Check size={18} />} Готово
        </button>
      </div>

      <div ref={box} className="editor-stage">
        {error && <p className="muted">Не вдалося відкрити фото</p>}
        {!src && !error && <Loader2 className="spin" size={28} />}
        {src && (
          <div ref={wrap} className="editor-canvas-wrap" style={{ width: disp.w, height: disp.h }}>
            <canvas ref={canvas} style={{ filter }} />
            <div
              className={`crop-rect ${tab === 'crop' ? 'is-active' : ''}`}
              style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
              onPointerDown={tab === 'crop' ? (e) => onDown(e, 'move') : undefined}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              {tab === 'crop' && ['nw', 'ne', 'sw', 'se'].map((h) => (
                <span key={h} className={`crop-h ${h}`} onPointerDown={(e) => onDown(e, h)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
              ))}
              {tab === 'crop' && <span className="crop-grid" />}
            </div>
          </div>
        )}
      </div>

      <div className="editor-tools">
        {tab === 'crop' ? (
          <>
            <div className="chips scroll">
              {ASPECTS.map((a) => (
                <button key={a.id} className={`chip dark ${aspect === a.id ? 'is-active' : ''}`} onClick={() => applyAspect(a.id)}>{a.label}</button>
              ))}
            </div>
            <div className="row center gap">
              <button className="tool-btn" onClick={() => rotate(-1)}><RotateCcw size={22} /><span>Ліворуч</span></button>
              <button className="tool-btn" onClick={() => rotate(1)}><RotateCw size={22} /><span>Праворуч</span></button>
            </div>
          </>
        ) : (
          <>
            <Slider Icon={Sun} label="Яскравість" value={edits.brightness} onStart={snapshot} onChange={(v) => setEdits({ ...edits, brightness: v })} />
            <Slider Icon={Contrast} label="Контраст" value={edits.contrast} onStart={snapshot} onChange={(v) => setEdits({ ...edits, contrast: v })} />
          </>
        )}
        <div className="editor-tabs">
          <button className={tab === 'crop' ? 'is-active' : ''} onClick={() => setTab('crop')}><Crop size={20} /> Обрізка</button>
          <button className={tab === 'light' ? 'is-active' : ''} onClick={() => setTab('light')}><Sun size={20} /> Світло</button>
        </div>
      </div>
    </div>
  )
}

function Slider({ Icon, label, value, onChange, onStart }) {
  return (
    <label className="slider">
      <span className="slider-head"><Icon size={16} /> {label}<b>{value > 100 ? '+' : ''}{value - 100}</b></span>
      <input type="range" min={30} max={170} value={value} onPointerDown={onStart} onKeyDown={onStart} onChange={(e) => onChange(+e.target.value)} onDoubleClick={() => onChange(100)} style={{ '--p': `${((value - 30) / 140) * 100}%` }} />
    </label>
  )
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
