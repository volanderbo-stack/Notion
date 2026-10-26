// Додавання контенту: «+» → тип → підпис, примітка, теми, теги → зберегти
import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ClipboardPaste, FileText, Globe, Images, Loader2, Mic, Square, StickyNote, Video, RotateCcw } from 'lucide-react'
import Sheet from './Sheet'
import { Progress } from './Chrome'
import { TagInput, ThemeChips } from './ThemeParts'
import { HeartChips, LocalOnlyToggle } from './HeartParts'
import { sortHearts } from '../lib/hearts'
import { addItem, newItem, useStore } from '../lib/store'
import { allTags } from '../lib/selectors'
import { setUI, toast, useUI } from '../lib/ui'
import { audioDuration, exifDate, imageMeta, typeOfFile, videoMeta } from '../lib/media'
import { fetchImageBlob, fetchLinkPreview, normalizeUrl } from '../lib/linkPreview'
import { formatBytes, formatDuration, hostname, pluralItems } from '../lib/format'

const KINDS = [
  { id: 'photo', label: 'Фото', Icon: Camera, accept: 'image/*' },
  { id: 'video', label: 'Відео', Icon: Video, accept: 'video/*' },
  { id: 'import', label: 'Імпорт багатьох', Icon: Images, accept: 'image/*,video/*' },
  { id: 'link', label: 'Посилання', Icon: Globe },
  { id: 'text', label: 'Текст', Icon: StickyNote },
  { id: 'voice', label: 'Голосове', Icon: Mic },
  { id: 'file', label: 'Файл / PDF', Icon: FileText, accept: '.pdf,application/pdf,*/*' },
]

const emptyForm = (themeId) => ({ caption: '', note: '', tags: [], themeIds: themeId ? [themeId] : [], hearts: [], local: false })

let persistAsked = false
function askPersist() {
  if (persistAsked) return
  persistAsked = true
  navigator.storage?.persist?.().catch(() => {})
}

export default function AddFlow() {
  const add = useUI((u) => u.add)
  const items = useStore((s) => s.items)
  const tagSugg = useMemo(() => allTags(items), [items])
  const [kind, setKind] = useState(null)
  const [files, setFiles] = useState([])
  const [form, setForm] = useState(emptyForm())
  const [link, setLink] = useState({ url: '', loading: false, preview: null })
  const [text, setText] = useState('')
  const [voice, setVoice] = useState(null) // { blob, duration }
  const [busy, setBusy] = useState(null) // { done, total }
  const input = useRef()

  useEffect(() => {
    if (!add) return
    setKind(null); setFiles([]); setForm(emptyForm(add.themeId)); setLink({ url: '', loading: false, preview: null }); setText(''); setVoice(null); setBusy(null)
  }, [add])

  const close = () => { if (!busy) setUI({ add: null }) }
  const choose = (k) => {
    setKind(k.id)
    if (k.accept) {
      input.current.accept = k.accept
      input.current.click()
    }
  }
  const onFiles = (e) => {
    const list = [...e.target.files]
    e.target.value = ''
    if (!list.length) { if (!files.length) setKind(null); return }
    setFiles((f) => [...f, ...list])
  }

  const loadPreview = async (raw) => {
    const url = normalizeUrl(raw ?? link.url)
    if (!url) return
    setLink((l) => ({ ...l, url, loading: true }))
    const preview = await fetchLinkPreview(url)
    setLink((l) => (l.url === url ? { ...l, loading: false, preview } : l))
  }
  const paste = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim()
      if (t) { setLink({ url: t, loading: false, preview: null }); loadPreview(t) }
    } catch { toast('Немає доступу до буфера — вставте вручну') }
  }

  const base = () => ({ caption: form.caption.trim(), note: form.note.trim(), tags: form.tags, themeIds: form.themeIds, hearts: form.hearts, local: form.local })

  const save = async () => {
    try {
      if (kind === 'link') {
        const url = normalizeUrl(link.url)
        if (!url) return toast('Введіть коректне посилання')
        setBusy({ done: 0, total: 1 })
        const p = link.preview || (await fetchLinkPreview(url))
        const imgBlob = await fetchImageBlob(p.image)
        const thumb = imgBlob ? (await imageMeta(imgBlob)).thumb : null
        await addItem(newItem({ type: 'link', url, linkTitle: p.title, linkDesc: p.desc, linkImage: p.image, hasThumb: !!thumb, ...base() }), { thumb })
        finish(1)
      } else if (kind === 'text') {
        if (!text.trim() && !form.caption.trim()) return toast('Напишіть щось')
        await addItem(newItem({ type: 'text', text: text.trim(), ...base() }))
        finish(1)
      } else if (kind === 'voice') {
        if (!voice) return toast('Спершу запишіть голосове')
        const name = `Голосове ${new Date().toLocaleString('uk-UA')}.${voice.blob.type.includes('mp4') ? 'm4a' : 'webm'}`
        await addItem(newItem({ type: 'voice', mime: voice.blob.type, size: voice.blob.size, name, duration: voice.duration, ...base() }), { orig: voice.blob })
        finish(1)
      } else {
        if (!files.length) return toast('Виберіть файли')
        setBusy({ done: 0, total: files.length })
        for (let i = 0; i < files.length; i++) {
          await saveFile(files[i], base())
          setBusy({ done: i + 1, total: files.length })
        }
        finish(files.length)
      }
    } catch (e) {
      console.error(e)
      setBusy(null)
      toast(e?.name === 'QuotaExceededError' ? 'Забракло місця на пристрої' : 'Не вдалося зберегти')
    }
  }
  const finish = (n) => {
    askPersist()
    setBusy(null)
    setUI({ add: null })
    toast(n > 1 ? `Додано: ${pluralItems(n)}` : 'Додано ✓')
  }

  const kindInfo = KINDS.find((k) => k.id === kind)
  const isFileKind = kindInfo?.accept
  const ready = kind && (!isFileKind || files.length)

  return (
    <Sheet
      open={!!add}
      onClose={close}
      title={ready ? kindInfo.label : 'Додати'}
      full={!!ready}
      footer={ready && (busy && busy.total > 1 ? <Progress value={busy.done} max={busy.total} label={`Збереження ${busy.done} з ${busy.total}…`} /> : (
        <button className="btn btn-primary block" onClick={save} disabled={!!busy}>
          {busy ? <Loader2 className="spin" size={18} /> : null} Зберегти{files.length > 1 ? ` (${files.length})` : ''}
        </button>
      ))}
    >
      <input ref={input} type="file" hidden onChange={onFiles} multiple />
      {!ready ? (
        <div className="kind-grid">
          {KINDS.map((k) => (
            <button key={k.id} className="kind-btn" onClick={() => choose(k)}>
              <span className={`kind-icon k-${k.id}`}><k.Icon size={24} /></span>
              {k.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="form">
          {isFileKind && <FileStrip files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} onAdd={() => input.current.click()} />}

          {kind === 'link' && (
            <>
              <div className="row gap">
                <input className="input grow" type="url" inputMode="url" autoFocus value={link.url} placeholder="https://…" onChange={(e) => setLink({ url: e.target.value, loading: false, preview: null })} onBlur={() => link.url && !link.preview && loadPreview()} onKeyDown={(e) => e.key === 'Enter' && loadPreview()} />
                <button className="btn" onClick={paste} aria-label="Вставити"><ClipboardPaste size={18} /></button>
              </div>
              {link.loading && <div className="hint"><Loader2 className="spin" size={14} /> Завантажую превʼю…</div>}
              {link.preview && <LinkPreviewCard url={normalizeUrl(link.url)} p={link.preview} />}
            </>
          )}

          {kind === 'voice' && <Recorder value={voice} onChange={setVoice} />}

          <input className="input" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder={kind === 'text' ? 'Заголовок' : link.preview?.title ? `Підпис (${link.preview.title.slice(0, 40)})` : 'Підпис'} />
          {kind === 'text' ? (
            <textarea className="input textarea tall" value={text} onChange={(e) => setText(e.target.value)} placeholder="Текст нотатки…" autoFocus />
          ) : (
            <textarea className="input textarea" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Примітка" />
          )}

          <label className="label">Теми</label>
          <ThemeChips value={form.themeIds} onChange={(themeIds) => setForm({ ...form, themeIds })} />

          <label className="label">Теги</label>
          <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} suggestions={tagSugg} />

          <label className="label">Сердечка</label>
          <HeartChips value={form.hearts} onToggle={(h, on) => setForm({ ...form, hearts: sortHearts(on ? [...form.hearts, h] : form.hearts.filter((x) => x !== h)) })} />
          <LocalOnlyToggle on={form.local} onChange={(local) => setForm({ ...form, local })} />
        </div>
      )}
    </Sheet>
  )
}

export async function saveFile(file, fields) {
  const type = typeOfFile(file)
  let meta = {}
  let thumb = null
  let createdAt = file.lastModified || Date.now()
  if (type === 'photo') {
    const m = await imageMeta(file)
    meta = { width: m.width, height: m.height }
    thumb = m.thumb
    createdAt = (await exifDate(file)) || createdAt
  } else if (type === 'video') {
    const m = await videoMeta(file)
    meta = { width: m.width, height: m.height, duration: m.duration }
    thumb = m.thumb
  } else if (type === 'voice') {
    meta = { duration: await audioDuration(file) }
    createdAt = Date.now()
  } else createdAt = Date.now()
  if (createdAt > Date.now()) createdAt = Date.now()
  await addItem(newItem({ type, mime: file.type, size: file.size, name: file.name, createdAt, hasThumb: !!thumb, ...meta, ...fields }), { orig: file, thumb })
}

function FileStrip({ files, onRemove, onAdd }) {
  const urls = useMemo(() => files.map((f) => (/^(image|video)\//.test(f.type) ? URL.createObjectURL(f) : null)), [files])
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls])
  return (
    <div className="file-strip">
      {files.map((f, i) => (
        <div key={i} className="file-chip">
          {urls[i] && f.type.startsWith('image/') ? <img src={urls[i]} alt="" /> : urls[i] ? <video src={urls[i]} muted preload="metadata" /> : <FileText size={22} />}
          <span className="file-chip-name">{f.name}<br /><small>{formatBytes(f.size)}</small></span>
          <button className="file-chip-x" onClick={() => onRemove(i)} aria-label="Прибрати">×</button>
        </div>
      ))}
      <button className="file-chip add" onClick={onAdd}>+ Ще</button>
    </div>
  )
}

export function LinkPreviewCard({ url, p, big }) {
  return (
    <a className={`link-card ${big ? 'big' : ''}`} href={url} target="_blank" rel="noopener noreferrer">
      {p.image && <img src={p.image} alt="" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} />}
      <span className="link-card-body">
        <span className="link-card-title">{p.title || hostname(url)}</span>
        {p.desc && <span className="link-card-desc">{p.desc}</span>}
        <span className="link-card-host"><Globe size={12} /> {hostname(url)}</span>
      </span>
    </a>
  )
}

function Recorder({ value, onChange }) {
  const [rec, setRec] = useState(null) // { mr, start }
  const [now, setNow] = useState(0)
  const audioUrl = useMemo(() => (value ? URL.createObjectURL(value.blob) : null), [value])
  useEffect(() => () => audioUrl && URL.revokeObjectURL(audioUrl), [audioUrl])
  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [rec])
  useEffect(() => () => rec?.mr.state === 'recording' && rec.mr.stop(), [rec])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t))
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      const chunks = []
      const startedAt = Date.now()
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: (mr.mimeType || 'audio/webm').split(';')[0] })
        onChange({ blob, duration: (Date.now() - startedAt) / 1000 })
        setRec(null)
      }
      mr.start(250)
      setRec({ mr, start: startedAt })
      setNow(Date.now())
    } catch {
      toast('Немає доступу до мікрофона')
    }
  }
  const pickFile = async (e) => {
    const f = e.target.files[0]
    e.target.value = ''
    if (f) onChange({ blob: f, duration: await audioDuration(f) })
  }

  return (
    <div className="recorder">
      {rec ? (
        <>
          <div className="rec-time"><span className="rec-dot" /> {formatDuration((now - rec.start) / 1000)}</div>
          <button className="rec-btn is-rec" onClick={() => rec.mr.stop()} aria-label="Зупинити"><Square size={26} fill="currentColor" /></button>
        </>
      ) : value ? (
        <>
          <audio src={audioUrl} controls className="rec-audio" />
          <button className="btn" onClick={() => onChange(null)}><RotateCcw size={16} /> Перезаписати</button>
        </>
      ) : (
        <>
          <button className="rec-btn" onClick={start} aria-label="Записати"><Mic size={30} /></button>
          <div className="hint">Натисніть, щоб записати</div>
          <label className="link-btn">або вибрати аудіофайл<input type="file" accept="audio/*" hidden onChange={pickFile} /></label>
        </>
      )}
    </div>
  )
}
