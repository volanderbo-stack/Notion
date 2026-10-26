// Поділитися елементами через системне меню (Web Share API), інакше — завантажити / скопіювати
import { getFile, fileKey } from './db'

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'application/pdf': 'pdf' }
export const extOf = (mime) => EXT[mime] || (mime && mime.split('/')[1]?.replace(/[^a-z0-9]/g, '')) || 'bin'

export async function itemBlob(item) {
  if (item.edits) {
    const e = await getFile(fileKey.edit(item.id))
    if (e) return e
  }
  return getFile(fileKey.orig(item.id))
}

export function itemFileName(item, blob) {
  if (item.name && !item.edits) return item.name
  const base = (item.caption || item.name || item.type).replace(/\.[a-z0-9]+$/i, '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)
  return `${base || 'file'}.${extOf(blob?.type || item.mime)}`
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

// Повертає 'shared' | 'downloaded' | 'copied' | 'cancelled'
export async function shareItems(items) {
  const files = []
  const texts = []
  for (const it of items) {
    if (it.type === 'link') texts.push([it.caption || it.linkTitle, it.url].filter(Boolean).join('\n'))
    else if (it.type === 'text') texts.push([it.caption, it.text].filter(Boolean).join('\n\n'))
    else {
      const blob = await itemBlob(it)
      if (blob) files.push(new File([blob], itemFileName(it, blob), { type: blob.type || it.mime }))
    }
  }
  const data = {}
  if (files.length) data.files = files
  if (texts.length) data.text = texts.join('\n\n')
  try {
    if (navigator.share && (!files.length || navigator.canShare?.(data))) {
      await navigator.share(data)
      return 'shared'
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled'
  }
  // Запасний варіант
  files.forEach((f) => downloadBlob(f, f.name))
  if (texts.length) {
    try { await navigator.clipboard.writeText(data.text) } catch { /* без буфера */ }
    return files.length ? 'downloaded' : 'copied'
  }
  return 'downloaded'
}
