// Синхронізація зі спільною галереєю в Supabase.
// Локальна IndexedDB лишається головною: усе працює без інтернету, а зміни
// складаються в outbox і надсилаються, щойно з'явиться зв'язок.
// Конфлікти: перемагає новіша зміна (updatedAt елемента).
import * as DB from '../db'
import { fileKey } from '../db'
import { applyRemote, getState, setChangeHook } from '../store'
import { SUPABASE_KEY, SUPABASE_URL, cloudConfigured } from './config'
import { getConn, setConn, setStatus } from './state'

const BUCKET = 'gallery'
const PAGE = 500
const PREFETCH_MAX = 40 * 1024 * 1024 // оригінали з сердечками до 40 МБ тримаємо на телефоні

let clientP
function client() {
  if (!clientP) {
    clientP = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'galereya:auth' },
      }))
  }
  return clientP
}

// Зрозумілі повідомлення замість технічних
function friendly(e) {
  const m = String(e?.message || e || '')
  if (/anonymous sign-ins are disabled/i.test(m)) return new Error('У Supabase не ввімкнено анонімний вхід (supabase/README.md, крок 3).')
  if (/bad code/.test(m)) return new Error('Невірний код запрошення. Попросіть нове посилання.')
  if (/space exists/.test(m)) return new Error('Спільна галерея вже створена — приєднайтеся за кодом запрошення.')
  if (/not a member/.test(m)) return new Error('Вас немає серед учасників галереї. Приєднайтеся знову за запрошенням.')
  if (/failed to fetch|network|load failed/i.test(m)) return new Error('Немає з\'єднання з сервером.')
  if (/function .* does not exist|relation .* does not exist|could not find the function/i.test(m)) return new Error('У Supabase не створено таблиці (supabase/README.md, крок 2).')
  return new Error(m || 'Невідома помилка')
}

async function session(sb) {
  const { data } = await sb.auth.getSession()
  if (data.session) return data.session
  const r = await sb.auth.signInAnonymously()
  if (r.error) throw friendly(r.error)
  return r.data.session
}

const filePath = (spaceId, key) => `${spaceId}/${key.replace(':', '_')}`

async function pool(list, n, fn) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) await fn(list[i++])
  }))
}

// ---------- Що змінилося локально → outbox ----------

let seqN = 0
const nextSeq = () => `${Date.now()}.${seqN++}`

function toOutbox(c) {
  const seq = nextSeq()
  const e = []
  for (const id of [...(c.items || []), ...(c.delItems || [])]) e.push(['item:' + id, { kind: 'item', id, seq }])
  for (const id of [...(c.themes || []), ...(c.delThemes || [])]) e.push(['theme:' + id, { kind: 'theme', id, seq }])
  for (const k of c.files || []) e.push(['file:' + k, { kind: 'file', id: k, seq }])
  for (const k of c.delFiles || []) e.push(['file:' + k, { kind: 'unfile', id: k, seq }])
  if (c.meta) e.push(['meta:hearts', { kind: 'meta', id: 'hearts', seq }])
  return e
}

function onLocalChange(c) {
  if (!getConn()) return
  DB.outboxPut(toOutbox(c)).then(() => schedule())
}

// Усе локальне — у спільну галерею (після створення чи приєднання)
async function markAll() {
  const { items, themes } = getState()
  const keys = (await DB.fileKeys()).filter((k) => typeof k === 'string')
  await DB.outboxPut(toOutbox({ items: items.map((i) => i.id), themes: themes.map((t) => t.id), files: keys, meta: !!getState().hearts.updatedAt }))
}

// ---------- Надсилання ----------

async function push(sb, spaceId) {
  const entries = await DB.outboxAll()
  if (!entries.length) return
  setStatus({ pending: entries.length })
  const files = entries.filter(([, v]) => v.kind === 'file')
  const unfiles = entries.filter(([, v]) => v.kind === 'unfile')
  const recs = entries.filter(([, v]) => v.kind === 'item' || v.kind === 'theme' || v.kind === 'meta')

  // Спершу файли — щоб інші не побачили елемент без фото
  let tooBig = 0
  const doneFiles = []
  await pool(files, 3, async (en) => {
    const blob = await DB.getLocalFile(en[1].id)
    if (blob) {
      const { error } = await sb.storage.from(BUCKET).upload(filePath(spaceId, en[1].id), blob, {
        upsert: true, contentType: blob.type || 'application/octet-stream', cacheControl: '31536000',
      })
      if (error) {
        if (!/exceeded|too large|payload|413/i.test(error.message + (error.statusCode || ''))) throw error
        tooBig++
      }
    }
    doneFiles.push(en)
  })
  await DB.outboxDone(doneFiles)
  if (tooBig) setStatus({ tooBig })

  const st = getState()
  const byId = { item: new Map(st.items.map((i) => [i.id, i])), theme: new Map(st.themes.map((t) => [t.id, t])) }
  for (let i = 0; i < recs.length; i += 100) {
    const batch = recs.slice(i, i + 100)
    const rows = batch.map(([, v]) => {
      if (v.kind === 'meta') return { kind: 'meta', id: 'hearts', data: st.hearts, updated: st.hearts.updatedAt || 1 }
      const rec = byId[v.kind].get(v.id)
      return rec
        ? { kind: v.kind, id: v.id, data: rec, updated: rec.updatedAt || rec.createdAt || 1 }
        : { kind: v.kind, id: v.id, data: null, deleted: true, updated: Date.now() }
    })
    const { error } = await sb.rpc('push_records', { p_space: spaceId, p_rows: rows })
    if (error) throw error
    await DB.outboxDone(batch)
  }

  if (unfiles.length) {
    await sb.storage.from(BUCKET).remove(unfiles.map(([, v]) => filePath(spaceId, v.id)))
    await DB.outboxDone(unfiles)
  }
}

// ---------- Отримання ----------

async function download(sb, spaceId, key) {
  const { data, error } = await sb.storage.from(BUCKET).download(filePath(spaceId, key))
  if (error || !data) return null
  await DB.putFile(key, data)
  return data
}

async function applyPage(sb, conn, rows, pending) {
  const st = getState()
  const items = new Map(st.items.map((i) => [i.id, i]))
  const themes = new Map(st.themes.map((t) => [t.id, t]))
  const r = { items: [], themes: [], delItems: [], delThemes: [], delFiles: [], hearts: null }
  const thumbs = []

  for (const row of rows) {
    if (row.kind === 'meta') {
      if (pending.has('meta:hearts') && st.hearts.updatedAt > row.client_updated) continue
      if (row.data && row.data.updatedAt !== st.hearts.updatedAt) r.hearts = row.data
      continue
    }
    const map = row.kind === 'item' ? items : themes
    const local = map.get(row.id)
    // Своя зміна ще не надіслана і новіша — не чіпаємо
    if (pending.has(row.kind + ':' + row.id) && (!local || (local.updatedAt || 0) > row.client_updated)) continue
    if (row.deleted) {
      if (local) (row.kind === 'item' ? r.delItems : r.delThemes).push(row.id)
      continue
    }
    const d = row.data
    if (!d || (local && (local.updatedAt || 0) === (d.updatedAt || 0))) continue
    if (row.kind === 'item') {
      if (local && local.thumbV !== d.thumbV) r.delFiles.push(fileKey.thumb(d.id), fileKey.edit(d.id))
      if (d.hasThumb && (!local || local.thumbV !== d.thumbV || !(await DB.hasFile(fileKey.thumb(d.id))))) thumbs.push(d.id)
      r.items.push(d)
    } else {
      if (local && local.coverV !== d.coverV) r.delFiles.push(fileKey.cover(d.id))
      r.themes.push(d)
    }
  }

  // Старі мініатюри прибрати, нові — докачати до показу
  if (r.delFiles.length) await DB.delMany('files', r.delFiles)
  await pool(thumbs, 6, (id) => download(sb, conn.spaceId, fileKey.thumb(id)).catch(() => null))
  r.delFiles = []
  if (r.items.length || r.themes.length || r.delItems.length || r.delThemes.length || r.hearts) await applyRemote(r)
}

async function pull(sb, conn) {
  const pending = new Set((await DB.outboxAll()).map(([k]) => k))
  // Невелике перекриття: запис, що завершився трохи пізніше, теж потрапить
  let since = conn.cursor ? new Date(new Date(conn.cursor).getTime() - 5000).toISOString() : '1970-01-01T00:00:00Z'
  let newest = conn.cursor
  for (;;) {
    const { data, error } = await sb.from('records')
      .select('kind,id,data,deleted,client_updated,updated_at')
      .eq('space_id', conn.spaceId)
      .gt('updated_at', since)
      .order('updated_at')
      .limit(PAGE)
    if (error) throw error
    if (data.length) {
      await applyPage(sb, conn, data, pending)
      newest = data[data.length - 1].updated_at
      since = newest
    }
    if (data.length < PAGE) break
  }
  if (newest && newest !== conn.cursor) setConn({ cursor: newest })
}

// Оригінали з сердечками — на телефон, щоб на касі відкривались без інтернету
let prefetching = false
async function prefetchHearted(sb, spaceId) {
  if (prefetching) return
  prefetching = true
  try {
    const want = []
    for (const i of getState().items) {
      if (!i.favorite || i.deletedAt || !['photo', 'video', 'voice', 'file'].includes(i.type) || i.size > PREFETCH_MAX) continue
      const key = i.edits ? fileKey.edit(i.id) : fileKey.orig(i.id)
      if (!(await DB.hasFile(key))) want.push(key)
    }
    await pool(want, 2, (key) => download(sb, spaceId, key).catch(() => null))
  } finally {
    prefetching = false
  }
}

// Файл, якого немає на телефоні (відкрили фото, додане іншим)
const absent = new Set()
async function fetchMissing(key) {
  const conn = getConn()
  if (!conn || absent.has(key) || !navigator.onLine) return undefined
  try {
    const sb = await client()
    await session(sb)
    const blob = await download(sb, conn.spaceId, key)
    if (!blob) absent.add(key)
    return blob || undefined
  } catch {
    return undefined
  }
}

// ---------- Цикл синхронізації ----------

let timer
let running = false
let again = false

export function schedule(ms = 1200) {
  if (!getConn()) return
  clearTimeout(timer)
  timer = setTimeout(syncNow, ms)
}

export async function syncNow() {
  const conn = getConn()
  if (!conn || !cloudConfigured()) return
  if (running) { again = true; return }
  if (!navigator.onLine) { setStatus({ state: 'offline' }); return }
  running = true
  setStatus({ state: 'syncing', error: '' })
  try {
    const sb = await client()
    await session(sb)
    await push(sb, conn.spaceId)
    await pull(sb, getConn())
    const left = (await DB.outboxAll()).length
    setStatus({ state: 'idle', lastSync: Date.now(), pending: left })
    prefetchHearted(sb, conn.spaceId)
  } catch (e) {
    console.warn('sync', e)
    setStatus({ state: navigator.onLine ? 'error' : 'offline', error: friendly(e).message })
    clearTimeout(timer)
    timer = setTimeout(syncNow, 30000)
  } finally {
    running = false
    if (again) { again = false; schedule(200) }
  }
}

// ---------- Миттєві оновлення ----------

let channel = null
let started = false

async function startLive() {
  const conn = getConn()
  if (!conn || channel) return
  const sb = await client()
  await session(sb)
  channel = sb.channel('records-' + conn.spaceId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `space_id=eq.${conn.spaceId}` }, () => schedule(400))
    .subscribe()
}

async function stopLive() {
  if (!channel) return
  const sb = await client()
  await sb.removeChannel(channel)
  channel = null
}

// Викликається один раз після load()
export function startCloud() {
  if (started) return
  started = true
  setChangeHook(onLocalChange)
  DB.setFileFallback(fetchMissing)
  window.addEventListener('online', () => schedule(300))
  window.addEventListener('offline', () => getConn() && setStatus({ state: 'offline' }))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule(300))
  setInterval(() => document.visibilityState === 'visible' && schedule(0), 60000)
  if (getConn() && cloudConfigured()) {
    setStatus({ state: 'idle' })
    syncNow()
    startLive().catch(() => {})
  }
}

// ---------- Створити / приєднатися / вийти ----------

async function connected(space, member) {
  setConn({ spaceId: space.id, spaceName: space.name, inviteCode: space.invite_code, memberName: member, cursor: null })
  await markAll()
  setStatus({ state: 'idle', error: '' })
  await syncNow()
  startLive().catch(() => {})
}

export async function createSpace(name, member) {
  const sb = await client()
  await session(sb)
  const { data, error } = await sb.rpc('create_space', { p_name: name, p_member: member })
  if (error) throw friendly(error)
  await connected(data, member)
}

export async function joinSpace(code, member) {
  const sb = await client()
  await session(sb)
  const { data, error } = await sb.rpc('join_space', { p_code: code, p_member: member })
  if (error) throw friendly(error)
  await connected(data, member)
}

// Вийти: дані лишаються на телефоні, але більше не синхронізуються
export async function leaveSpace() {
  const conn = getConn()
  await stopLive().catch(() => {})
  try {
    const sb = await client()
    const { data } = await sb.auth.getUser()
    if (conn && data.user) await sb.from('members').delete().eq('space_id', conn.spaceId).eq('user_id', data.user.id)
  } catch { /* без мережі — просто відключаємось */ }
  await DB.outboxClear()
  setConn(null)
  setStatus({ state: 'off', error: '', pending: 0 })
}

export async function listMembers() {
  const conn = getConn()
  const sb = await client()
  const [{ data: me }, { data, error }] = await Promise.all([
    sb.auth.getUser(),
    sb.from('members').select('user_id,name,joined_at').eq('space_id', conn.spaceId).order('joined_at'),
  ])
  if (error) throw friendly(error)
  return data.map((m) => ({ ...m, me: m.user_id === me.user?.id }))
}

export async function removeMember(userId) {
  const conn = getConn()
  const sb = await client()
  const { error } = await sb.from('members').delete().eq('space_id', conn.spaceId).eq('user_id', userId)
  if (error) throw friendly(error)
}

export async function newInviteCode() {
  const conn = getConn()
  const sb = await client()
  const { data, error } = await sb.rpc('new_invite_code', { p_space: conn.spaceId })
  if (error) throw friendly(error)
  setConn({ inviteCode: data })
  return data
}

export async function refreshSpace() {
  const conn = getConn()
  const sb = await client()
  const { data, error } = await sb.from('spaces').select('name,invite_code').eq('id', conn.spaceId).maybeSingle()
  if (error) throw friendly(error)
  if (data) setConn({ spaceName: data.name, inviteCode: data.invite_code })
}

export async function renameMe(name) {
  const conn = getConn()
  const sb = await client()
  const { data } = await sb.auth.getUser()
  const { error } = await sb.from('members').update({ name }).eq('space_id', conn.spaceId).eq('user_id', data.user.id)
  if (error) throw friendly(error)
  setConn({ memberName: name })
}

export const inviteLink = (code) => `${location.origin}${location.pathname}#/join/${code}`
