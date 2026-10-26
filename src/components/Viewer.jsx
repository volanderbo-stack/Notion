// Повноекранний перегляд: свайп вліво/вправо — сусідні елементи, вниз — закрити,
// подвійний тап і щипок — зум (для фото)
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, ExternalLink, FileText, FolderPlus, Heart, Info, Mic, Pause, Play, Share2, SlidersHorizontal, Trash2, RotateCcw, RotateCw, ImageOff } from 'lucide-react'
import { fileKey } from '../lib/db'
import { useFileUrl } from '../lib/urls'
import { useBackClose } from '../lib/nav'
import { usePresence, useScrollLock } from '../lib/hooks'
import { restoreItems, trashItems, useStore } from '../lib/store'
import { heartColor } from '../lib/hearts'
import { openEditor, openHearts, openInfo, openPicker, setUI, toast, useUI } from '../lib/ui'
import { formatBytes, formatDate, formatDuration, hostname } from '../lib/format'
import { titleOf } from '../lib/selectors'
import { downloadBlob, itemBlob, itemFileName, shareItems } from '../lib/share'
import { LinkPreviewCard } from './AddFlow'

export default function Viewer() {
  const v = useUI((u) => u.viewer)
  const last = useRef(v)
  if (v) last.current = v
  const { mounted, visible } = usePresence(!!v, 220)
  const close = useCallback(() => setUI({ viewer: null }), [])
  useBackClose(!!v, close)
  useScrollLock(!!v)
  if (!mounted || !last.current) return null
  return <ViewerInner key={last.current.ids.join()} data={last.current} visible={visible} onClose={close} />
}

const MAX_ZOOM = 5

function ViewerInner({ data, visible, onClose }) {
  const all = useStore((s) => s.items)
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all])
  const list = useMemo(() => data.ids.map((id) => byId.get(id)).filter((i) => i && !i.deletedAt), [data.ids, byId])
  const [curId, setCurId] = useState(data.ids[data.index])
  const lastIndex = useRef(data.index)
  let index = list.findIndex((i) => i.id === curId)
  if (index < 0) index = Math.min(lastIndex.current, list.length - 1)
  lastIndex.current = index
  const item = list[index]
  const prev = list[index - 1]
  const next = list[index + 1]
  const [chrome, setChrome] = useState(true)

  const stage = useRef()
  const track = useRef()
  const backdrop = useRef()
  const zoomEl = useRef()
  const zoom = useRef({ s: 1, x: 0, y: 0 })
  const g = useRef(null)
  const pointers = useRef(new Map())
  const tapTimer = useRef()
  const lastTap = useRef(null)

  useEffect(() => { if (!list.length) onClose() }, [list.length, onClose])

  const applyZoom = (animate) => {
    const el = zoomEl.current
    if (!el) return
    const { s, x, y } = zoom.current
    el.style.transition = animate ? 'transform .25s ease' : 'none'
    el.style.transform = s === 1 ? '' : `translate(${x}px, ${y}px) scale(${s})`
  }
  const clampPan = () => {
    const z = zoom.current
    const r = stage.current.getBoundingClientRect()
    const mx = ((z.s - 1) * r.width) / 2
    const my = ((z.s - 1) * r.height) / 2
    z.x = Math.max(-mx, Math.min(mx, z.x))
    z.y = Math.max(-my, Math.min(my, z.y))
  }

  // Після зміни елемента: скинути зсув стрічки й зум
  useLayoutEffect(() => {
    if (track.current) {
      track.current.style.transition = 'none'
      track.current.style.transform = ''
    }
    zoom.current = { s: 1, x: 0, y: 0 }
    applyZoom(false)
  }, [item?.id])

  const go = useCallback((dir) => {
    const target = dir > 0 ? next : prev
    if (!target) return
    const t = track.current
    t.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)'
    t.style.transform = `translateX(${-dir * 100}%)`
    setTimeout(() => setCurId(target.id), 260)
  }, [next, prev])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const onDoubleTap = (cx, cy) => {
    if (item?.type !== 'photo') return
    const z = zoom.current
    if (z.s > 1) zoom.current = { s: 1, x: 0, y: 0 }
    else {
      const r = stage.current.getBoundingClientRect()
      const s = 2.5
      zoom.current = { s, x: -(cx - r.left - r.width / 2) * (s - 1), y: -(cy - r.top - r.height / 2) * (s - 1) }
      clampPan()
    }
    applyZoom(true)
  }

  // ----- жести -----
  const onPointerDown = (e) => {
    if (e.target.closest('.no-gesture')) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    if (pts.length === 2 && item?.type === 'photo') {
      const r = stage.current.getBoundingClientRect()
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const z = zoom.current
      g.current = {
        axis: 'pinch',
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        s0: z.s,
        // точка зображення під пальцями (у локальних координатах)
        lx: (mid.x - r.left - r.width / 2 - z.x) / z.s,
        ly: (mid.y - r.top - r.height / 2 - z.y) / z.s,
        r,
      }
      if (track.current) { track.current.style.transition = 'none'; track.current.style.transform = '' }
      return
    }
    if (pts.length > 1) return
    stage.current.setPointerCapture?.(e.pointerId)
    const scroller = e.target.closest('.viewer-scroll')
    g.current = {
      axis: null, x0: e.clientX, y0: e.clientY, t0: performance.now(), dx: 0, dy: 0,
      zx: zoom.current.x, zy: zoom.current.y,
      noDown: scroller && scroller.scrollTop > 0,
    }
  }

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const st = g.current
    if (!st) return
    if (st.axis === 'pinch') {
      const pts = [...pointers.current.values()]
      if (pts.length < 2) return
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const s = Math.max(0.8, Math.min(MAX_ZOOM, (st.s0 * d) / st.dist))
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      zoom.current = {
        s,
        x: mid.x - st.r.left - st.r.width / 2 - s * st.lx,
        y: mid.y - st.r.top - st.r.height / 2 - s * st.ly,
      }
      applyZoom(false)
      return
    }
    st.dx = e.clientX - st.x0
    st.dy = e.clientY - st.y0
    if (zoom.current.s > 1) {
      zoom.current.x = st.zx + st.dx
      zoom.current.y = st.zy + st.dy
      clampPan()
      applyZoom(false)
      st.axis = 'pan'
      return
    }
    if (!st.axis && Math.hypot(st.dx, st.dy) > 8) {
      st.axis = Math.abs(st.dx) > Math.abs(st.dy) ? 'x' : st.dy > 0 && !st.noDown ? 'down' : 'none'
    }
    if (st.axis === 'x') {
      const edge = (st.dx > 0 && !prev) || (st.dx < 0 && !next)
      track.current.style.transition = 'none'
      track.current.style.transform = `translateX(${edge ? st.dx / 3 : st.dx}px)`
    } else if (st.axis === 'down') {
      const dy = Math.max(0, st.dy)
      stage.current.style.transition = 'none'
      stage.current.style.transform = `translate(${st.dx / 3}px, ${dy}px) scale(${1 - Math.min(dy, 400) / 1600})`
      backdrop.current.style.opacity = String(1 - Math.min(dy, 400) / 500)
    }
  }

  const onPointerUp = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    const st = g.current
    if (!st) return
    if (st.axis === 'pinch') {
      if (pointers.current.size === 0) {
        if (zoom.current.s <= 1.02) zoom.current = { s: 1, x: 0, y: 0 }
        else clampPan()
        applyZoom(true)
        g.current = null
      }
      return
    }
    g.current = null
    const dt = performance.now() - st.t0
    if (st.axis === 'x') {
      const w = stage.current.clientWidth
      const fast = Math.abs(st.dx) / dt > 0.5
      const dir = st.dx < 0 ? 1 : -1
      if ((Math.abs(st.dx) > w * 0.18 || fast) && (dir > 0 ? next : prev)) go(dir)
      else {
        track.current.style.transition = 'transform .25s ease'
        track.current.style.transform = ''
      }
    } else if (st.axis === 'down') {
      if (st.dy > 110 || st.dy / dt > 0.6) onClose()
      else {
        stage.current.style.transition = 'transform .25s ease'
        stage.current.style.transform = ''
        backdrop.current.style.opacity = ''
      }
    } else if (!st.axis && dt < 350) {
      // тап або подвійний тап
      const t = lastTap.current
      if (t && performance.now() - t.t < 300 && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 40) {
        clearTimeout(tapTimer.current)
        lastTap.current = null
        onDoubleTap(e.clientX, e.clientY)
      } else {
        lastTap.current = { t: performance.now(), x: e.clientX, y: e.clientY }
        tapTimer.current = setTimeout(() => setChrome((c) => !c), 280)
      }
    }
  }

  if (!item) return null

  return (
    <div className={`viewer ${visible ? 'is-open' : ''} ${chrome ? '' : 'no-chrome'}`} role="dialog" aria-modal="true" aria-label="Перегляд">
      <div ref={backdrop} className="viewer-backdrop" />
      <div
        ref={stage}
        className="viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={track} className="viewer-track">
          {[prev, item, next].map((it, i) => it && (
            <div key={it.id} className="viewer-slide" style={{ left: `${(i - 1) * 100}%` }}>
              <Slide item={it} active={i === 1} zoomRef={i === 1 ? zoomEl : undefined} />
            </div>
          ))}
        </div>
      </div>
      <ViewerTop item={item} index={index} total={list.length} onClose={onClose} />
      <ViewerBottom item={item} />
    </div>
  )
}

function ViewerTop({ item, index, total, onClose }) {
  return (
    <div className="viewer-top no-gesture">
      <button className="icon-btn light" onClick={onClose} aria-label="Закрити"><ArrowLeft size={24} /></button>
      <div className="viewer-title">
        <div className="viewer-title-main">{titleOf(item) || formatDate(item.createdAt, false)}</div>
        <div className="viewer-title-sub">{formatDate(item.createdAt)} · {index + 1} з {total}</div>
      </div>
    </div>
  )
}

function ViewerBottom({ item }) {
  const share = async () => {
    const r = await shareItems([item])
    if (r === 'downloaded') toast('Файл збережено')
    if (r === 'copied') toast('Скопійовано')
  }
  const del = async () => {
    await trashItems([item.id])
    toast('Переміщено в кошик', 'Повернути', () => restoreItems([item.id]))
  }
  return (
    <div className="viewer-bottom no-gesture">
      {(item.caption || item.note) && (
        <button className="viewer-caption" onClick={() => openInfo(item.id)}>
          {item.caption && <b>{item.caption}</b>}
          {item.note && <span>{item.note}</span>}
        </button>
      )}
      <div className="viewer-actions">
        <button className={`va ${item.favorite ? 'is-fav' : ''}`} style={item.favorite ? { color: heartColor(item.hearts[0]) } : undefined} onClick={() => openHearts([item.id])} aria-label="Сердечко">
          <Heart size={24} fill={item.favorite ? 'currentColor' : 'none'} />
          {item.hearts.length > 1 && <span className="va-count">{item.hearts.length}</span>}
        </button>
        <button className="va" onClick={() => openInfo(item.id)} aria-label="Інфо"><Info size={24} /></button>
        {item.type === 'photo' && <button className="va" onClick={() => openEditor(item.id)} aria-label="Редагувати"><SlidersHorizontal size={24} /></button>}
        <button className="va" onClick={() => openPicker([item.id], 'add')} aria-label="Теми"><FolderPlus size={24} /></button>
        <button className="va" onClick={share} aria-label="Поділитися"><Share2 size={24} /></button>
        <button className="va" onClick={del} aria-label="Видалити"><Trash2 size={24} /></button>
      </div>
    </div>
  )
}

function Slide({ item, active, zoomRef }) {
  const thumb = useFileUrl(item.hasThumb ? fileKey.thumb(item.id) : null, item.thumbV)
  const full = useFileUrl(['photo', 'video', 'voice', 'file'].includes(item.type) ? (item.edits ? fileKey.edit(item.id) : fileKey.orig(item.id)) : null, item.thumbV)
  const [broken, setBroken] = useState(false)

  if (item.type === 'photo') {
    return (
      <div className="slide-media" ref={zoomRef}>
        {broken && !thumb ? (
          <div className="slide-card"><ImageOff size={40} /><p>Браузер не може показати цей формат.</p><DownloadBtn item={item} /></div>
        ) : (
          <>
            {thumb && <img className="slide-img blur" src={thumb} alt="" draggable={false} />}
            {full && !broken && <img className="slide-img" src={full} alt={item.caption} draggable={false} onError={() => setBroken(true)} />}
          </>
        )}
      </div>
    )
  }
  if (item.type === 'video') {
    return <div className="slide-media">{full !== undefined && <MediaPlayer kind="video" src={full} poster={thumb} active={active} fallbackDuration={item.duration} />}</div>
  }
  if (item.type === 'voice') {
    return (
      <div className="slide-media">
        <div className="slide-card voice-card">
          <div className="voice-icon"><Mic size={44} /></div>
          {item.caption && <h2>{item.caption}</h2>}
          {full && <MediaPlayer kind="audio" src={full} active={active} fallbackDuration={item.duration} />}
        </div>
      </div>
    )
  }
  if (item.type === 'link') {
    return (
      <div className="slide-media">
        <div className="slide-card link-slide no-gesture-y">
          <LinkPreviewCard big url={item.url} p={{ title: item.caption || item.linkTitle, desc: item.linkDesc, image: thumb || item.linkImage }} />
          <a className="btn btn-primary" href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /> Відкрити {hostname(item.url)}</a>
        </div>
      </div>
    )
  }
  if (item.type === 'text') {
    return (
      <div className="slide-media">
        <article className="slide-text viewer-scroll">
          {item.caption && <h2>{item.caption}</h2>}
          <div className="slide-text-body">{item.text}</div>
        </article>
      </div>
    )
  }
  return (
    <div className="slide-media">
      <div className="slide-card">
        <FileText size={52} />
        <h2 className="break">{item.caption || item.name}</h2>
        <p className="muted">{item.name} · {formatBytes(item.size)}</p>
        <div className="row gap no-gesture">
          {full && <a className="btn btn-primary" href={full} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /> Відкрити</a>}
          <DownloadBtn item={item} />
        </div>
      </div>
    </div>
  )
}

function DownloadBtn({ item }) {
  return (
    <button className="btn no-gesture" onClick={async () => { const b = await itemBlob(item); if (b) downloadBlob(b, itemFileName(item, b)) }}>
      <Download size={18} /> Зберегти
    </button>
  )
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function MediaPlayer({ kind, src, poster, active, fallbackDuration = 0 }) {
  const ref = useRef()
  const [st, setSt] = useState({ playing: false, t: 0, d: fallbackDuration, rate: 1 })
  const seeking = useRef(false)
  useEffect(() => { if (!active) ref.current?.pause() }, [active])

  const dur = isFinite(st.d) && st.d > 0 ? st.d : fallbackDuration
  const toggle = () => {
    const m = ref.current
    if (m) m.paused ? m.play().catch(() => {}) : m.pause()
  }
  const skip = (s) => {
    const m = ref.current
    if (m) m.currentTime = Math.max(0, Math.min(dur || m.duration || 0, m.currentTime + s))
  }
  const cycleRate = () => {
    const m = ref.current
    if (m) m.playbackRate = RATES[(RATES.indexOf(m.playbackRate) + 1) % RATES.length]
  }
  const Media = kind
  return (
    <div className={`player player-${kind}`}>
      <Media
        ref={ref}
        src={src || undefined}
        poster={poster || undefined}
        playsInline
        preload="metadata"
        className="player-media"
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; setSt((s) => ({ ...s, d })) }}
        onDurationChange={(e) => { const d = e.currentTarget.duration; setSt((s) => ({ ...s, d })) }}
        onTimeUpdate={(e) => { const t = e.currentTarget.currentTime; if (!seeking.current) setSt((s) => ({ ...s, t })) }}
        onPlay={() => setSt((s) => ({ ...s, playing: true }))}
        onPause={() => setSt((s) => ({ ...s, playing: false }))}
        onEnded={() => setSt((s) => ({ ...s, playing: false }))}
        onRateChange={(e) => { const rate = e.currentTarget.playbackRate; setSt((s) => ({ ...s, rate })) }}
      />
      {kind === 'video' && !st.playing && (
        <button className="player-big no-gesture" onClick={toggle} aria-label="Відтворити"><Play size={34} fill="currentColor" /></button>
      )}
      <div className="player-bar no-gesture">
        <input
          type="range"
          className="player-seek"
          min={0}
          max={dur || 0}
          step="any"
          value={Math.min(st.t, dur || 0)}
          style={{ '--p': `${dur ? (st.t / dur) * 100 : 0}%` }}
          onPointerDown={() => (seeking.current = true)}
          onPointerUp={() => (seeking.current = false)}
          onChange={(e) => { const t = +e.target.value; setSt((s) => ({ ...s, t })); if (ref.current) ref.current.currentTime = t }}
          aria-label="Перемотка"
        />
        <div className="player-row">
          <button className="pbtn" onClick={() => skip(-10)} aria-label="Назад на 10 с"><RotateCcw size={20} /><small>10</small></button>
          <button className="pbtn main" onClick={toggle} aria-label={st.playing ? 'Пауза' : 'Відтворити'}>
            {st.playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
          </button>
          <button className="pbtn" onClick={() => skip(10)} aria-label="Вперед на 10 с"><RotateCw size={20} /><small>10</small></button>
          <span className="player-time">{formatDuration(st.t)} / {formatDuration(dur)}</span>
          <button className="pbtn rate" onClick={cycleRate} aria-label="Швидкість">{String(st.rate).replace('.', ',')}×</button>
        </div>
      </div>
    </div>
  )
}
