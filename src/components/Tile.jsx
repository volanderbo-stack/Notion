// Мініатюра елемента в сітці (фото, відео або картка для інших типів)
import { memo, useRef } from 'react'
import { Check, FileText, Globe, Heart, Mic, Play, StickyNote, ImageOff } from 'lucide-react'
import { fileKey } from '../lib/db'
import { useFileUrl } from '../lib/urls'
import { useInView } from '../lib/hooks'
import { formatDuration, hostname } from '../lib/format'

const LONG_PRESS = 420

function Tile({ item, cols, selecting, selected, onTap, onLong, badge }) {
  const ref = useRef()
  const seen = useInView(ref)
  const thumb = useFileUrl(item.hasThumb ? fileKey.thumb(item.id) : null, item.thumbV, seen)
  const press = useRef(null)
  const small = cols >= 7

  const onPointerDown = (e) => {
    if (e.button > 0) return
    const st = { x: e.clientX, y: e.clientY, fired: false }
    st.timer = setTimeout(() => {
      st.fired = true
      navigator.vibrate?.(12)
      onLong(item)
    }, LONG_PRESS)
    press.current = st
  }
  const cancel = () => { if (press.current) clearTimeout(press.current.timer) }
  const onPointerMove = (e) => {
    const st = press.current
    if (st && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) clearTimeout(st.timer)
  }
  const onClick = () => {
    const st = press.current
    press.current = null
    if (st?.fired) return
    onTap(item)
  }

  return (
    <button
      ref={ref}
      className={`tile tile-${item.type} ${selected ? 'is-selected' : ''} ${selecting ? 'is-selecting' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); cancel(); if (!selecting) onLong(item) }}
      aria-label={item.caption || item.name || item.type}
      aria-pressed={selecting ? selected : undefined}
    >
      <TileBody item={item} thumb={thumb} small={small} />
      {item.type === 'video' && (
        <span className="tile-badge tile-duration"><Play size={10} fill="currentColor" />{!small && formatDuration(item.duration)}</span>
      )}
      {item.favorite && <span className="tile-heart"><Heart size={small ? 10 : 13} fill="currentColor" strokeWidth={0} /></span>}
      {badge && <span className="tile-badge tile-extra">{badge}</span>}
      {selecting && <span className="tile-check">{selected && <Check size={14} strokeWidth={3} />}</span>}
    </button>
  )
}

function TileBody({ item, thumb, small }) {
  const img = thumb ? <img className="tile-img" src={thumb} alt="" draggable={false} /> : null
  switch (item.type) {
    case 'photo':
    case 'video':
      return img || <span className="tile-ph">{item.hasThumb ? null : <ImageOff size={20} />}</span>
    case 'link':
      return (
        <span className="tile-card">
          {img || (item.linkImage ? <img className="tile-img" src={item.linkImage} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} /> : null)}
          <span className={`tile-card-body ${img || item.linkImage ? 'on-img' : ''}`}>
            <Globe size={small ? 14 : 16} />
            {!small && <span className="tile-card-title">{item.caption || item.linkTitle || hostname(item.url)}</span>}
            {!small && <span className="tile-card-sub">{hostname(item.url)}</span>}
          </span>
        </span>
      )
    case 'text':
      return (
        <span className="tile-card tile-text">
          {small ? <StickyNote size={14} /> : (
            <>
              {item.caption && <span className="tile-card-title">{item.caption}</span>}
              <span className="tile-text-body">{item.text}</span>
            </>
          )}
        </span>
      )
    case 'voice':
      return (
        <span className="tile-card tile-center">
          <Mic size={small ? 14 : 22} />
          {!small && <span className="tile-card-sub">{formatDuration(item.duration)}</span>}
          {!small && item.caption && <span className="tile-card-title center">{item.caption}</span>}
        </span>
      )
    default:
      return (
        <span className="tile-card tile-center">
          <FileText size={small ? 14 : 22} />
          {!small && <span className="tile-ext">{(item.name.split('.').pop() || 'файл').slice(0, 5)}</span>}
          {!small && <span className="tile-card-title center">{item.caption || item.name}</span>}
        </span>
      )
  }
}

export default memo(Tile)
