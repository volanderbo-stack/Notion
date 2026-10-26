// Перевірка ZIP-модуля резервної копії в Node: npm test [-- шлях-для-архіву.zip]
// Модуль backup.js тягне IndexedDB, тому підміняємо залежності простими заглушками.
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = await mkdtemp(join(tmpdir(), 'zip-'))
const src = await readFile(new URL('../src/lib/backup.js', import.meta.url), 'utf8')
await writeFile(join(dir, 'backup.mjs'), src.replace(/from '\.\/(db|store|share)'/g, "from './stub.mjs'"))
await writeFile(join(dir, 'stub.mjs'), 'export const getState = () => ({}); export const load = () => {}; export const newItem = () => ({}); export const extOf = () => "bin"; export const getFile = () => null; export const fileKeys = () => [];')
const { createZip, readBackup } = await import(pathToFileURL(join(dir, 'backup.mjs')).href)

const zip = createZip()
const big = new Uint8Array(300000).map((_, i) => (i * 7) & 255)
await zip.add('files/o_тест.bin', new Blob([big]))
await zip.add('backup.json', new Blob([JSON.stringify({ app: 'rozumna-galereya', files: { 'o:тест': { path: 'files/o_тест.bin', type: 'application/octet-stream' } } })]))
const blob = zip.finish()
await writeFile(process.argv[2] || join(dir, 'test.zip'), Buffer.from(await blob.arrayBuffer()))
const back = await readBackup(new File([blob], 'b.zip'))
const got = new Uint8Array(await (await back.blob('o:тест')).arrayBuffer())
console.log('roundtrip', got.length === big.length && got.every((v, i) => v === big[i]) ? 'OK' : 'FAIL')
