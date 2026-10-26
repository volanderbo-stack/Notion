// Перевірка синхронізації спільної галереї в Node: два «телефони» й імітація Supabase в пам'яті.
// Справжні store.js і sync.js; IndexedDB і Supabase підмінені простими замінниками.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = join(root, 'node_modules', '.cache', 'test-sync')
await rm(tmp, { recursive: true, force: true })
await mkdir(tmp, { recursive: true })

// Таймери синхронізації вимкнені: тест сам викликає syncNow і чекає на результат
const realTimeout = setTimeout
globalThis.setTimeout = () => 0
globalThis.setInterval = () => 0
globalThis.clearTimeout = () => {}
globalThis.window = { addEventListener() {} }
globalThis.document = { addEventListener() {}, visibilityState: 'hidden' }
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

// ---------- Імітація сервера Supabase (спільна для обох телефонів) ----------
await writeFile(join(tmp + '-server.mjs'), `
export const server = { records: new Map(), files: new Map(), seq: 0 }
const iso = (n) => new Date(1.8e12 + n * 1000).toISOString()
function query(table) {
  const f = { gt: null, eq: null }
  const q = {
    select() { return q }, eq(k, v) { f.eq = v; return q }, gt(k, v) { f.gt = v; return q },
    order() { return q }, limit(n) { f.limit = n; return q },
    async maybeSingle() { return { data: table === 'spaces' ? { name: 'Тест', invite_code: 'CODE' } : null, error: null } },
    then(res) {
      const rows = [...server.records.values()].filter((r) => r.updated_at > f.gt).sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1))
      return Promise.resolve({ data: rows.slice(0, f.limit || 1000).map((r) => structuredClone(r)), error: null }).then(res)
    },
  }
  return q
}
export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: {} } }),
      signInAnonymously: async () => ({ data: { session: {} } }),
      getUser: async () => ({ data: { user: { id: 'u' } } }),
    },
    async rpc(name, a) {
      if (name === 'create_space' || name === 'join_space') return { data: { id: 'S', name: 'Тест', invite_code: 'CODE' }, error: null }
      if (name === 'push_records') {
        for (const r of a.p_rows) {
          const k = r.kind + ':' + r.id
          const cur = server.records.get(k)
          if (!cur || cur.client_updated <= r.updated) {
            server.records.set(k, { kind: r.kind, id: r.id, data: structuredClone(r.data ?? null), deleted: !!r.deleted, client_updated: r.updated, updated_at: iso(++server.seq) })
          }
        }
        return { error: null }
      }
    },
    from: query,
    storage: {
      from: () => ({
        async upload(path, blob) { server.files.set(path, blob); return { error: null } },
        async download(path) { return server.files.has(path) ? { data: server.files.get(path) } : { data: null, error: { message: 'not found' } } },
        async remove(paths) { paths.forEach((p) => server.files.delete(p)); return { error: null } },
      }),
    },
  }
}
`)

// ---------- Замінник IndexedDB (свій у кожного телефона) ----------
const dbStub = `
const stores = { items: new Map(), themes: new Map(), files: new Map(), meta: new Map(), outbox: new Map() }
const keyOf = { items: (v) => v.id, themes: (v) => v.id }
export const fileKey = { orig: (id) => 'o:' + id, thumb: (id) => 't:' + id, edit: (id) => 'e:' + id, cover: (id) => 'c:' + id }
export const getAll = async (s) => [...stores[s].values()]
export const putMany = async (s, vs) => vs.forEach((v) => stores[s].set(keyOf[s](v), v))
export const delMany = async (s, ks) => ks.forEach((k) => stores[s].delete(k))
let fallback = null
export const setFileFallback = (f) => { fallback = f }
export const getLocalFile = async (k) => stores.files.get(k)
export const getFile = async (k) => stores.files.get(k) || (fallback ? fallback(k) : undefined)
export const hasFile = async (k) => stores.files.has(k)
export const putFile = async (k, b) => { stores.files.set(k, b) }
export const putFiles = async (es) => es.forEach(([k, b]) => b && stores.files.set(k, b))
export const fileKeys = async () => [...stores.files.keys()]
export const getMeta = async (k) => stores.meta.get(k)
export const putMeta = async (k, v) => { stores.meta.set(k, v) }
export const outboxAll = async () => [...stores.outbox.entries()]
export const outboxPut = async (es) => es.forEach(([k, v]) => stores.outbox.set(k, v))
export const outboxDone = async (es) => es.forEach(([k, v]) => { if (stores.outbox.get(k)?.seq === v.seq) stores.outbox.delete(k) })
export const outboxClear = async () => stores.outbox.clear()
`

// Копія модулів для одного телефона: додаємо .js до імпортів, підставляємо замінники
async function phone(name) {
  const dir = join(tmp, name)
  await mkdir(join(dir, 'cloud'), { recursive: true })
  const fix = (src) => src
    .replace(/from '(\.\.?\/[^']+?)'/g, (m, p) => `from '${p.endsWith('.js') ? p : p + '.js'}'`)
    .replace("import('@supabase/supabase-js')", `import(${JSON.stringify(pathToFileURL(tmp + '-server.mjs').href)})`)
  const copy = async (from, to) => writeFile(join(dir, to), fix(await readFile(join(root, 'src/lib', from), 'utf8')))
  await copy('store.js', 'store.js')
  await copy('hearts.js', 'hearts.js')
  await copy('cloud/state.js', 'cloud/state.js')
  await copy('cloud/sync.js', 'cloud/sync.js')
  await writeFile(join(dir, 'db.js'), dbStub)
  await writeFile(join(dir, 'cloud/config.js'), "export const SUPABASE_URL = 'x'; export const SUPABASE_KEY = 'x'; export const cloudConfigured = () => true")
  const store = await import(pathToFileURL(join(dir, 'store.js')).href)
  const sync = await import(pathToFileURL(join(dir, 'cloud/sync.js')).href)
  const db = await import(pathToFileURL(join(dir, 'db.js')).href)
  await store.load()
  sync.startCloud()
  return { store, sync, db }
}

const { server } = await import(pathToFileURL(tmp + '-server.mjs').href)
const A = await phone('a')
const B = await phone('b')
const blob = (t) => new Blob([t], { type: 'image/jpeg' })
// Пауза: зміни на різних телефонах не мають припадати на одну мілісекунду
const tick = () => new Promise((r) => realTimeout(r, 5))
const sync = async () => { await A.sync.syncNow(); await B.sync.syncNow(); await A.sync.syncNow(); await tick() }
const item = (p, id) => p.store.getState().items.find((i) => i.id === id)

await A.sync.createSpace('Тест', 'А')
await B.sync.joinSpace('CODE', 'Б')

// 1. Спільне фото й особисте фото
const shared = await A.store.addItem(A.store.newItem({ type: 'photo', caption: 'картка', hasThumb: true }), { orig: blob('o1'), thumb: blob('t1') })
const priv = await A.store.addItem(A.store.newItem({ type: 'photo', caption: 'паспорт', hasThumb: true, local: true }), { orig: blob('o2'), thumb: blob('t2') })
await sync()
assert.ok(item(B, shared.id), 'спільне фото має дійти до Б')
assert.ok(await B.db.hasFile('t:' + shared.id), 'мініатюра спільного фото має докачатися')
assert.equal(item(B, priv.id), undefined, 'особисте фото не має потрапити до Б')
assert.ok(![...server.files.keys()].some((k) => k.includes(priv.id)), 'файли особистого фото не мають бути на сервері')
assert.ok(!server.records.get('item:' + priv.id)?.data, 'запису особистого фото не має бути на сервері')
console.log('✓ особисте фото лишається на телефоні')

// 2. Спільне стає особистим — зникає з сервера й у Б, але лишається в А
await A.store.setLocalOnly([shared.id], true)
await sync()
assert.equal(item(B, shared.id), undefined, 'у Б фото має зникнути')
assert.ok(item(A, shared.id), 'в А фото має лишитися')
assert.ok(await A.db.hasFile('o:' + shared.id), 'в А файл має лишитися')
assert.ok(![...server.files.keys()].some((k) => k.includes(shared.id)), 'файли мають зникнути з сервера')
console.log('✓ позначене особистим прибирається з сервера й у інших')

// 3. Знову спільне — повертається до Б разом з файлами
await A.store.setLocalOnly([shared.id], false)
await sync()
assert.ok(item(B, shared.id), 'фото має повернутися до Б')
assert.ok(server.files.has('S/o_' + shared.id), 'оригінал має знову бути на сервері')
console.log('✓ знову спільне повертається до інших')

// 4. Звичайні зміни й назви сердечок і далі синхронізуються
await B.store.setHeart([shared.id], 'green', true)
await B.store.setHeartLabels({ purple: 'Знижки' })
await sync()
assert.deepEqual(item(A, shared.id).hearts, ['green'])
assert.equal(A.store.getState().hearts.labels.purple, 'Знижки')
console.log('✓ сердечка й назви синхронізуються')

// 5. Особисте при приєднанні: нове фото Б з позначкою не йде на сервер
const privB = await B.store.addItem(B.store.newItem({ type: 'text', caption: 'нотатка Б', local: true }))
await sync()
assert.equal(item(A, privB.id), undefined)
console.log('✓ особисте з другого телефона теж не надсилається')

await rm(tmp, { recursive: true, force: true })
await rm(tmp + '-server.mjs', { force: true })
console.log('sync OK')
process.exit(0)
