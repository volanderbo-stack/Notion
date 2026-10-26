// Превʼю посилань: назва, опис і картинка сайту.
// Браузер не може напряму читати чужі сайти (CORS), тому використовуємо публічний сервіс microlink.io.
// Для YouTube картинку можна отримати й без нього.
import { getSettings } from './settings'

export function normalizeUrl(s) {
  s = s.trim()
  if (!s) return ''
  if (!/^[a-z][\w+.-]*:\/\//i.test(s)) s = 'https://' + s
  try { return new URL(s).href } catch { return '' }
}

const youtubeId = (url) =>
  url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/)?.[1]

export async function fetchLinkPreview(url) {
  const out = { title: '', desc: '', image: '' }
  const yt = youtubeId(url)
  if (yt) out.image = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`
  if (getSettings().linkPreviews && navigator.onLine) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 9000)
      const r = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(url), { signal: ctrl.signal })
      clearTimeout(timer)
      const j = await r.json()
      if (j.status === 'success') {
        const d = j.data || {}
        out.title = d.title || ''
        out.desc = d.description || ''
        out.image = out.image || d.image?.url || d.screenshot?.url || d.logo?.url || ''
      }
    } catch { /* без превʼю */ }
  }
  return out
}

// Пробуємо завантажити картинку превʼю, щоб мініатюра працювала офлайн
export async function fetchImageBlob(url) {
  if (!url) return null
  try {
    const r = await fetch(url, { mode: 'cors' })
    if (!r.ok) return null
    const b = await r.blob()
    return b.type.startsWith('image/') ? b : null
  } catch {
    return null
  }
}
