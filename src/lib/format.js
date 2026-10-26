// Форматування дат, розмірів, тривалості та множини українською
export const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень']
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня']

const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

// Ключ і назва групи для сітки: «Сьогодні», «Вчора», «Жовтень 2026»
export function dateGroup(ts) {
  const d = new Date(ts)
  const now = new Date()
  const day = dayStart(d)
  if (day === dayStart(now)) return { key: 'today', label: 'Сьогодні' }
  if (day === dayStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return { key: 'yesterday', label: 'Вчора' }
  return { key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
}

export function formatDate(ts, withTime = true) {
  const d = new Date(ts)
  let s = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`
  if (withTime) s += `, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return s
}

export function formatBytes(n) {
  if (!n && n !== 0) return '—'
  if (n < 1024) return n + ' Б'
  const u = ['КБ', 'МБ', 'ГБ']
  let i = -1
  do { n /= 1024; i++ } while (n >= 1024 && i < u.length - 1)
  return n.toFixed(n < 10 ? 1 : 0).replace('.', ',') + ' ' + u[i]
}

export function formatDuration(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0
  sec = Math.round(sec)
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0')
}

// plural(5, ['елемент', 'елементи', 'елементів']) → «5 елементів»
export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10
  const f = a > 10 && a < 20 ? forms[2] : b === 1 ? forms[0] : b >= 2 && b <= 4 ? forms[1] : forms[2]
  return `${n} ${f}`
}
export const pluralItems = (n) => plural(n, ['елемент', 'елементи', 'елементів'])

export function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export const TYPE_LABELS = {
  photo: 'Фото', video: 'Відео', link: 'Посилання', text: 'Текст', voice: 'Голосове', file: 'Файл',
}
